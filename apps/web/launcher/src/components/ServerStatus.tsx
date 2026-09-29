import React from 'react'
import { TablerIcon } from '../lib/TablerIcon'
import type { ServerStatusInfo } from '../lib/tauri-api'

interface ServerStatusProps {
  status: ServerStatusInfo | null
  loading: boolean
}

const stateLabels: Record<NonNullable<ServerStatusInfo['state']>, string> = {
  stopped: 'Stopped',
  starting: 'Starting…',
  'running-managed': 'Running',
  'running-external': 'Running (external)',
  stopping: 'Stopping…',
}

const stateColors: Record<NonNullable<ServerStatusInfo['state']>, string> = {
  stopped: 'bg-danger',
  starting: 'bg-warning',
  'running-managed': 'bg-success',
  'running-external': 'bg-info',
  stopping: 'bg-warning',
}

const stateIcons: Record<NonNullable<ServerStatusInfo['state']>, string> = {
  stopped: 'pause',
  starting: 'refresh',
  'running-managed': 'server',
  'running-external': 'wifi',
  stopping: 'refresh',
}

export function ServerStatus({ status, loading }: ServerStatusProps) {
  if (loading || !status) {
    return (
      <section className="status-section">
        <div className="glass-card status-card">
          <div className="status-row">
            <span className="status-label flex items-center gap-2">
              <TablerIcon name="activity" size={14} />
              Status
            </span>
            <span className="status-value text-text-tertiary">Loading…</span>
          </div>
        </div>
      </section>
    )
  }

  const state = status.state
  const label = stateLabels[state]
  const dotColor = stateColors[state]
  const iconName = stateIcons[state]
  const isRunning = state !== 'stopped'

  return (
    <section className="status-section">
      <div className="glass-card status-card">
        <div className="status-row">
          <span className="status-label flex items-center gap-2">
            <TablerIcon name={iconName} size={14} />
            Status
          </span>
          <span className={`status-badge ${dotColor.replace('bg-', 'bg-opacity-20 ')} text-${dotColor.replace('bg-', 'text-')}`}>
            <span className={`status-dot ${dotColor} ${state === 'running-managed' || state === 'running-external' ? 'status-pulse' : ''}`}></span>
            {label}
          </span>
        </div>

        {isRunning && status.url && (
          <div className="status-row">
            <span className="status-label flex items-center gap-2">
              <TablerIcon name="terminal" size={14} />
              URL
            </span>
            <a
              href={status.url}
              className="status-value text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
              target="_blank"
              rel="noreferrer"
            >
              {status.url}
              <TablerIcon name="eye" size={12} />
            </a>
          </div>
        )}

        {status.port && (
          <div className="status-row">
            <span className="status-label flex items-center gap-2">
              <TablerIcon name="server" size={14} />
              Port
            </span>
            <span className="status-value text-text-tertiary">{status.port}</span>
          </div>
        )}

        {status.pid !== null && status.state === 'running-managed' && (
          <div className="status-row">
            <span className="status-label flex items-center gap-2">
              <TablerIcon name="activity" size={14} />
              PID
            </span>
            <span className="status-value text-text-tertiary">{status.pid}</span>
          </div>
        )}

        {status.error && (
          <div className="status-row">
            <span className="status-label flex items-center gap-2">
              <TablerIcon name="alert" size={14} />
              Error
            </span>
            <span className="status-value text-danger">{status.error}</span>
          </div>
        )}
      </div>
    </section>
  )
}
