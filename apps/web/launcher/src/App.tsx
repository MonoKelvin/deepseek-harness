import { useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ServerStatus } from './components/ServerStatus'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { TablerIcon } from './lib/TablerIcon'
import { Button } from '@/components/ui/button'
import { useServerStatus } from './hooks/useServerStatus'
import { useI18n } from './i18n'
import {
  installDeps,
  buildFrontend,
  startServer,
  stopServer,
  restartServer,
  type CommandOutput,
} from './lib/tauri-api'

const POLL_INTERVAL_MS = 2000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function App() {
  const { t, toggleLocale } = useI18n()
  const { status, loading, refresh, error: statusError } = useServerStatus(POLL_INTERVAL_MS)
  const [activeCommand, setActiveCommand] = useState<string | null>(null)
  const [commandOutput, setCommandOutput] = useState<CommandOutput | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)

  const runCommand = async (name: string, command: () => Promise<CommandOutput>) => {
    setActiveCommand(name)
    setCommandOutput(null)
    setCommandError(null)
    try {
      setCommandOutput(await command())
    } catch (error) {
      setCommandError(errorMessage(error))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const isRunning = status?.state === 'running-managed' || status?.state === 'running-external'
  const canStart = !isRunning
  const canStop = isRunning
  const canRestart = status?.state === 'running-managed'
  const canBuild = status?.state === 'stopped'
  const canInstall = status?.state === 'stopped'

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-[10px] border border-border bg-background text-foreground">
      <header className="drag-region flex h-11 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary">
            <TablerIcon name="rocket" size={15} />
          </span>
          <span className="text-sm font-semibold tracking-tight">{t('app.title')}</span>
        </div>
        <div className="no-drag flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggleLocale} title="切换语言 / Switch language" className="text-xs font-semibold">
            {t('lang.toggle')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void getCurrentWindow().hide()}
            title={t('titlebar.close')}
            aria-label={t('titlebar.close')}
            className="hover:bg-destructive/20 hover:text-destructive"
          >
            <TablerIcon name="x" size={16} />
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <ServerStatus status={status} loading={loading} error={statusError} />
        <ControlPanel
          onInstall={() => void runCommand('install', installDeps)}
          onBuild={() => void runCommand('build', buildFrontend)}
          onStart={() => void runCommand('start', startServer)}
          onStop={() => void runCommand('stop', stopServer)}
          onRestart={() => void runCommand('restart', restartServer)}
          canInstall={canInstall}
          canBuild={canBuild}
          canStart={canStart}
          canStop={canStop}
          canRestart={canRestart}
          disabled={activeCommand !== null}
          activeCommand={activeCommand ?? undefined}
        />
        {(commandOutput || commandError) && (
          <LogViewer output={commandOutput ?? undefined} error={commandError ?? undefined} />
        )}
      </main>

      <footer className="flex h-8 flex-shrink-0 items-center justify-between border-t border-border px-4 text-xs text-muted-foreground">
        <span>{t('footer.brand')}</span>
        <span>{t('footer.polling')}</span>
      </footer>
    </div>
  )
}

export default App
