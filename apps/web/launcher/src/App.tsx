import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getVersion } from '@tauri-apps/api/app'
import { homepage } from '../package.json'
import windowStyle from './window-style.json'
import { ServerStatus } from './components/ServerStatus'
import { ControlPanel, type LauncherCommand } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { SettingsPanel } from './components/SettingsPanel'
import { TooltipHost } from './components/TooltipHost'
import { TablerIcon } from './lib/TablerIcon'
import { Button } from '@/components/ui/button'
import { useServerStatus } from './hooks/useServerStatus'
import { useLogStream } from './hooks/useLogStream'
import { useTheme, hasStoredTheme } from './hooks/useTheme'
import { useI18n, hasStoredLocale, type TranslationKey } from './i18n'
import { MAX_LOG_ENTRIES } from './lib/constants'
import {
  installDeps, buildFrontend, startServer, stopServer, restartServer, openUrl,
  getSettings, setDshDirectory, clearLogs, setTheme, setLocale, setAutostart, setStopServicesOnExit, setServerPort, openDirectoryPicker,
  type CommandOutput, type AppSettings,
} from './lib/tauri-api'
import { revealWindowOnce } from './lib/reveal-window'
import type { LogEntry } from './types/server-status'

interface UiError {
  id: number
  timestamp: string
  action: TranslationKey
  detail: string
}

const commandLabels: Record<LauncherCommand, TranslationKey> = {
  install: 'controls.install', build: 'controls.build', start: 'controls.start',
  stop: 'controls.stop', restart: 'controls.restart', open: 'controls.open', project: 'settings.project',
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** How long the log copy button shows its success mark before reverting. */
const COPY_FEEDBACK_MS = 2000

function App() {
  const { t, locale, setLocale: setLocalePreference } = useI18n()
  const { theme, setTheme: setThemePreference } = useTheme()
  const { status, loading, refresh, error: statusError } = useServerStatus()
  const logStream = useLogStream(status?.logEntries)
  const commandPending = useRef(false)
  const [activeCommand, setActiveCommand] = useState<LauncherCommand | null>(null)
  const [commandSuccess, setCommandSuccess] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'logs' | 'settings'>('logs')
  const [version, setVersion] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [uiErrors, setUiErrors] = useState<UiError[]>([])
  const [copied, setCopied] = useState(false)
  const nextErrorId = useRef(-1)
  const copyTimer = useRef<number | null>(null)

  const reportError = useCallback((action: TranslationKey, error: unknown) => {
    // Negative IDs keep IPC-independent errors distinct from backend entries.
    const entry = { id: nextErrorId.current--, timestamp: new Date().toISOString(), action, detail: errorMessage(error) }
    setUiErrors(previous => [...previous.slice(-(MAX_LOG_ENTRIES - 1)), entry])
  }, [])

  useEffect(() => () => {
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
  }, [])

  // Keep the document language in sync with the UI locale so assistive tech sees
  // the right language above the app subtree, not the static value in index.html.
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])

  useEffect(() => {
    if (statusError) reportError('status.title', statusError)
  }, [statusError, reportError])

  // Reveal the window the instant the shell is committed to the DOM, so a
  // non-silent launch appears with content instead of a blank window while the
  // webview initializes. useLayoutEffect runs right after commit, before paint,
  // which is the earliest point the DOM is ready to composite; the silent-launch
  // check it awaits was started at module load, so it adds nothing on the path.
  // The backend keeps the window hidden until this runs and reveals it itself
  // after a timeout as a fallback.
  useLayoutEffect(() => {
    void revealWindowOnce()
  }, [])

  useEffect(() => {
    let cancelled = false
    void getVersion().then((value) => {
      if (!cancelled) setVersion(value)
    }).catch((error) => {
      if (!cancelled) reportError('settings.version', error)
    })
    void getSettings().then((result) => {
      if (cancelled) return
      setSettings(result)
      // Seed theme and locale from the backend only when the user has no local
      // choice, mirroring the OS-vs-file precedence; validate before applying so
      // an unexpected persisted value cannot become an invalid preference.
      if (!hasStoredTheme() && (result.theme === 'light' || result.theme === 'dark' || result.theme === 'system')) {
        setThemePreference(result.theme)
      }
      if (!hasStoredLocale() && (result.locale === 'zh' || result.locale === 'en')) {
        setLocalePreference(result.locale)
      }
    }).catch((error) => {
      if (!cancelled) reportError('settings.title', error)
    })
    return () => { cancelled = true }
  }, [reportError, setThemePreference, setLocalePreference])

  // Rebuilt only when the backing entries or language change, not on every
  // 2-second status poll, which re-renders App with an unchanged log set.
  const logEntries = useMemo<LogEntry[]>(() => [
    ...logStream.entries,
    ...uiErrors.map<LogEntry>(entry => ({
      id: entry.id,
      source: 'launcher',
      severity: 'error',
      timestamp: entry.timestamp,
      message: t('log.operationFailed', {
        action: t(entry.action),
        error: entry.detail.includes('state not managed') ? t('status.stateNotManaged') : entry.detail,
      }),
    })),
  ].sort((left, right) => left.timestamp.replace('T', ' ').localeCompare(right.timestamp.replace('T', ' '))).slice(-MAX_LOG_ENTRIES), [logStream.entries, uiErrors, t])

  const runCommand = async (name: LauncherCommand, command: () => Promise<CommandOutput>) => {
    if (commandPending.current) return
    commandPending.current = true
    setActiveCommand(name)
    setCommandSuccess(null)
    if (name === 'project') setTab('logs')
    try {
      const output = await command()
      setCommandSuccess(output.success)
    } catch (error) {
      reportError(commandLabels[name], error)
      setCommandSuccess(false)
    } finally {
      commandPending.current = false
      setActiveCommand(null)
      refresh()
    }
  }

  const open = async (url: string): Promise<CommandOutput> => {
    await openUrl(url)
    return { success: true, stdout: '', stderr: '' }
  }
  const commands: Record<LauncherCommand, () => Promise<CommandOutput>> = {
    install: installDeps, build: buildFrontend, start: startServer, stop: stopServer, restart: restartServer,
    open: async () => {
      if (!status?.url) throw new Error(t('status.unavailable'))
      return open(status.url)
    },
    project: () => open(homepage),
  }

  const hideWindow = async () => {
    try {
      await getCurrentWindow().hide()
    } catch (error) {
      reportError('titlebar.close', error)
      setTab('logs')
    }
  }
  const unavailable = loading || !status || Boolean(statusError || status.error)
  const onCommand = (name: LauncherCommand) => void runCommand(name, commands[name])
  const dshDirectoryValid = status?.dshDirectoryValid ?? false
  const serverRunning = status?.state === 'running-managed' || status?.state === 'running-external'

  const handleThemeChange = (next: 'light' | 'dark' | 'system') => {
    setThemePreference(next)
    void setTheme(next).catch(error => reportError('settings.theme', error))
  }
  const handleDshDirectoryChange = (path: string) => {
    void setDshDirectory(path).then((result) => {
      setSettings(result)
      refresh()
    }).catch(error => reportError('settings.dshDirectory', error))
  }
  const handleBrowseDshDirectory = () => {
    void openDirectoryPicker().then((path) => {
      if (path) handleDshDirectoryChange(path)
    }).catch(error => reportError('settings.dshDirectoryBrowse', error))
  }
  const handleLocaleChange = (next: 'zh' | 'en') => {
    setLocalePreference(next)
    void setLocale(next).catch(error => reportError('settings.language', error))
  }
  const handleAutostartChange = (enabled: boolean) => {
    void setAutostart(enabled).then(setSettings).catch(error => reportError('settings.autostart', error))
  }
  const handleStopServicesOnExitChange = (enabled: boolean) => {
    void setStopServicesOnExit(enabled).then(setSettings).catch(error => reportError('settings.stopOnExit', error))
  }
  const handleServerPortChange = (port: number) => {
    void setServerPort(port).then(setSettings).catch(error => reportError('settings.serverPort', error))
  }
  const handleClearLogs = () => {
    void clearLogs().then(() => {
      logStream.clear()
      setUiErrors([])
      setCommandSuccess(null)
      // Clearing during the copy-feedback window would otherwise leave the copy
      // button stuck disabled until the timer fires.
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current)
        copyTimer.current = null
      }
      setCopied(false)
      refresh()
    }).catch(error => reportError('log.clear', error))
  }
  const handleCopyLogs = async () => {
    if (copied) return
    const text = logEntries.map(entry => `${entry.timestamp} [${t(`log.level.${entry.severity}`)}] ${entry.message}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      reportError('log.copy', error)
      return
    }
    setCopied(true)
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null
      setCopied(false)
    }, COPY_FEEDBACK_MS)
  }

  const moveBackdrop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce), (hover: none)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1))
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1))
    event.currentTarget.style.setProperty('--pointer-x', x.toFixed(3))
    event.currentTarget.style.setProperty('--pointer-y', y.toFixed(3))
  }
  const resetBackdrop = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.removeProperty('--pointer-x')
    event.currentTarget.style.removeProperty('--pointer-y')
  }

  return (
    <div className="launcher" style={{ borderRadius: windowStyle.cornerRadius }} lang={locale === 'zh' ? 'zh-CN' : 'en'} onPointerMove={moveBackdrop} onPointerLeave={resetBackdrop}>
      <TooltipHost />
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-identity" data-tauri-drag-region>
          <span className="wordmark" data-tauri-drag-region>{t('app.title')}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void hideWindow()} data-tooltip={t('titlebar.close')} aria-label={t('titlebar.close')}>
          <TablerIcon name="x" size={16} />
        </Button>
      </header>
      <main className="launcher-main">
        <section className="service" aria-label={t('status.title')}>
          <img className="launcher-art" src="./appicon-dsh-girl.png" alt="" aria-hidden="true" draggable={false} />
          <ServerStatus
            status={status}
            loading={loading}
            error={statusError}
            onRetry={refresh}
          />
          <ControlPanel
            state={status?.state}
            canOpen={Boolean(status?.url)}
            disabled={unavailable}
            dshDirectoryValid={dshDirectoryValid}
            activeCommand={activeCommand}
            onCommand={onCommand}
          />
        </section>
        <section className="details-panel">
          <div className="details-toolbar">
            <div className="panel-tabs" role="group" aria-label={t('app.views')}>
              <Button variant="tab" size="sm" aria-pressed={tab === 'logs'} onClick={() => setTab('logs')}>{t('log.title')}</Button>
              <Button variant="tab" size="sm" aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>{t('settings.title')}</Button>
            </div>
            {tab === 'logs' && (
              <div className="toolbar-actions">
                {(activeCommand || commandSuccess !== null) && (
                  <span className="log-result" data-failed={commandSuccess === false} role="status">
                    <TablerIcon name={activeCommand ? 'loader' : commandSuccess ? 'check' : 'alert'} size={13} className={activeCommand ? 'animate-spin' : undefined} />
                    {activeCommand ? t('controls.working') : t(commandSuccess ? 'log.completed' : 'log.failed')}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={handleClearLogs} aria-label={t('log.clear')} data-tooltip={t('log.clear')}>
                  <TablerIcon name="trash" size={14} />
                </Button>
                <Button variant="ghost" size="sm" className="copy-button" data-copied={copied} disabled={copied} onClick={handleCopyLogs} aria-label={t('log.copy')} data-tooltip={t('log.copy')}>
                  <TablerIcon name="copy" size={14} className="copy-glyph" />
                  <TablerIcon name="check" size={14} className="copy-glyph-check" />
                </Button>
              </div>
            )}
          </div>
          {tab === 'logs'
            ? <LogViewer
              entries={logEntries}
              activeLabel={activeCommand ? t(commandLabels[activeCommand]) : undefined}
            />
            : <SettingsPanel
              version={version}
              theme={theme}
              settings={settings}
              dshDirectoryValid={status?.dshDirectoryValid}
              serverRunning={serverRunning}
              onThemeChange={handleThemeChange}
              onDshDirectoryChange={handleDshDirectoryChange}
              onBrowseDshDirectory={handleBrowseDshDirectory}
              onServerPortChange={handleServerPortChange}
              onLocaleChange={handleLocaleChange}
              onAutostartChange={handleAutostartChange}
              onStopServicesOnExitChange={handleStopServicesOnExitChange}
              onOpenProject={() => onCommand('project')}
            />}
        </section>
      </main>
    </div>
  )
}

export default App
