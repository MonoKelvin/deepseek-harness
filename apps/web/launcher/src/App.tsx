import { useState } from 'react'
import { ServerStatus } from './components/ServerStatus'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { WindowControls } from './components/WindowControls'
import { TablerIcon } from './lib/TablerIcon'
import { useServerStatus } from './hooks/useServerStatus'
import {
  installDeps,
  buildFrontend,
  startServer,
  stopServer,
  restartServer,
  type CommandOutput,
} from './lib/tauri-api'
import './App.css'

const POLL_INTERVAL_MS = 2000

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function App() {
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
    <div className="app-container">
      <header className="app-header titlebar-drag-region">
        <div className="app-title">
          <span className="app-icon"><TablerIcon name="rocket" size={16} /></span>
          <span>dsh Web Launcher</span>
          <span className="app-title-muted">/ web</span>
        </div>
        <WindowControls />
      </header>

      <main className="app-main">
        <div className="workspace-heading">
          <h1>Web workspace</h1>
          <p>Install, build, and run the local dsh web server from one focused control surface.</p>
        </div>

        {statusError && (
          <div className="status-error" role="alert">
            <TablerIcon name="alert" size={15} />
            <span>{statusError}</span>
          </div>
        )}

        <ServerStatus status={status} loading={loading} />

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

      <footer className="app-footer">
        <span>DeepSeek Harness</span>
        <span className="footer-status"><span className="status-dot" />Polling every 2 seconds</span>
      </footer>
    </div>
  )
}

export default App
