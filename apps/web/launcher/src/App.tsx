import React, { useEffect, useState } from 'react'
import { ServerStatus } from './components/ServerStatus'
import { ControlPanel } from './components/ControlPanel'
import { LogViewer } from './components/LogViewer'
import { WindowControls } from './components/WindowControls'
import { TablerIcon } from './lib/TablerIcon'
import { useServerStatus } from './hooks/useServerStatus'
import {
  getStatus, installDeps, buildFrontend,
  startServer, stopServer, restartServer,
  ServerStatusInfo, CommandOutput,
} from './lib/tauri-api'
import './App.css'

const POLL_INTERVAL_MS = 2000

function App() {
  const { status, loading, refresh, error } = useServerStatus(POLL_INTERVAL_MS)
  const [activeCommand, setActiveCommand] = useState<string | null>(null)
  const [commandOutput, setCommandOutput] = useState<CommandOutput | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)

  useEffect(() => {
    if (status && status.state === 'running-external') {
      console.log('[dsh-web-launcher] Detected externally-started dsh web server')
    }
  }, [status?.state])

  const handleInstall = async () => {
    setActiveCommand('install')
    setCommandOutput(null)
    setCommandError(null)
    try {
      const output = await installDeps()
      setCommandOutput(output)
    } catch (e: any) {
      setCommandError(e.message || String(e))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const handleBuild = async () => {
    setActiveCommand('build')
    setCommandOutput(null)
    setCommandError(null)
    try {
      const output = await buildFrontend()
      setCommandOutput(output)
    } catch (e: any) {
      setCommandError(e.message || String(e))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const handleStart = async () => {
    setActiveCommand('start')
    setCommandOutput(null)
    setCommandError(null)
    try {
      const output = await startServer()
      setCommandOutput(output)
    } catch (e: any) {
      setCommandError(e.message || String(e))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const handleStop = async () => {
    setActiveCommand('stop')
    setCommandOutput(null)
    setCommandError(null)
    try {
      const output = await stopServer()
      setCommandOutput(output)
    } catch (e: any) {
      setCommandError(e.message || String(e))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const handleRestart = async () => {
    setActiveCommand('restart')
    setCommandOutput(null)
    setCommandError(null)
    try {
      const output = await restartServer()
      setCommandOutput(output)
    } catch (e: any) {
      setCommandError(e.message || String(e))
    } finally {
      setActiveCommand(null)
      refresh()
    }
  }

  const isRunning = status?.state === 'running-managed' || status?.state === 'running-external'
  const canStart = !isRunning
  const canStop = isRunning
  const canRestart = isRunning && status?.state === 'running-managed'
  const canBuild = status?.state === 'stopped'
  const canInstall = status?.state === 'stopped'

  return (
    <div className="app-container">
      <WindowControls />

      <header className="app-header titlebar-drag-region">
        <div className="app-title">
          <span className="app-icon">
            <TablerIcon name="rocket" />
          </span>
          <span>dsh Web Launcher</span>
        </div>
      </header>

      <main className="app-main">
        <ServerStatus status={status} loading={loading} />
        <ControlPanel
          onInstall={handleInstall}
          onBuild={handleBuild}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
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
        <span className="text-xs text-text-tertiary">DeepSeek Harness · Web Launcher v0.1.0</span>
      </footer>
    </div>
  )
}

export default App
