import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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
import { useTheme, hasStoredTheme } from './hooks/useTheme'
import { useI18n, type TranslationKey } from './i18n'
import {
  installDeps, buildFrontend, startServer, stopServer, restartServer, openUrl,
  getSettings, setDshDirectory, clearLogs, setTheme, setLocale, openDirectoryPicker,
  type CommandOutput, type AppSettings,
} from './lib/tauri-api'
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

function App() {
  const { t, locale, setLocale: setLocalePreference } = useI18n()
  const { theme, setTheme: setThemePreference } = useTheme()
  const { status, loading, refresh, error: statusError } = useServerStatus(2000)
  const commandPending = useRef(false)
  const [activeCommand, setActiveCommand] = useState<LauncherCommand | null>(null)
  const [commandSuccess, setCommandSuccess] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'logs' | 'settings'>('logs')
  const [version, setVersion] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [uiErrors, setUiErrors] = useState<UiError[]>([])
  const nextErrorId = useRef(-1)

  const reportError = useCallback((action: TranslationKey, error: unknown) => {
    // Negative IDs keep IPC-independent errors distinct from backend entries.
    const entry = { id: nextErrorId.current--, timestamp: new Date().toISOString(), action, detail: errorMessage(error) }
    setUiErrors(previous => [...previous.slice(-199), entry])
  }, [])

  useEffect(() => {
    if (statusError) reportError('status.title', statusError)
  }, [statusError, reportError])

  useEffect(() => {
    let cancelled = false
    void getVersion().then((value) => {
      if (!cancelled) setVersion(value)
    }).catch((error) => {
      if (!cancelled) reportError('settings.version', error)
    })
    void getSettings().then((result) => {
      if (!cancelled) {
        setSettings(result)
        if (result.theme && !hasStoredTheme()) setThemePreference(result.theme as 'light' | 'dark' | 'system')
      }
    }).catch((error) => {
      if (!cancelled) reportError('settings.title', error)
    })
    return () => { cancelled = true }
  }, [reportError, setThemePreference])

  const logEntries: LogEntry[] = [
    ...(status?.logEntries ?? []),
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
  ].sort((left, right) => left.timestamp.replace('T', ' ').localeCompare(right.timestamp.replace('T', ' '))).slice(-200)

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
  const handleClearLogs = () => {
    void clearLogs().then(() => {
      setUiErrors([])
      setCommandSuccess(null)
      refresh()
    }).catch(error => reportError('log.clear', error))
  }
  const handleCopyLogs = async () => {
    const text = logEntries.map(entry => `${entry.timestamp} [${t(`log.level.${entry.severity}`)}] ${entry.message}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      reportError('log.copy', error)
    }
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
          {version && <span className="app-version" data-tauri-drag-region>v{version}</span>}
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
                <Button variant="ghost" size="sm" onClick={handleCopyLogs} aria-label={t('log.copy')} data-tooltip={t('log.copy')}>
                  <TablerIcon name="copy" size={14} />
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
              onThemeChange={handleThemeChange}
              onDshDirectoryChange={handleDshDirectoryChange}
              onBrowseDshDirectory={handleBrowseDshDirectory}
              onLocaleChange={handleLocaleChange}
              onOpenProject={() => onCommand('project')}
            />}
        </section>
      </main>
    </div>
  )
}

export default App
