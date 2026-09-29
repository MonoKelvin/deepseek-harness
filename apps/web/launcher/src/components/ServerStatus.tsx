import React from 'react'
import { TablerIcon, type TablerIconName } from '../lib/TablerIcon'
import type { ServerStatusInfo, ServerState } from '../types/server-status'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface ServerStatusProps {
  status: ServerStatusInfo | null
  loading: boolean
}

const stateInfo: Record<ServerState, { label: string; icon: TablerIconName; variant: BadgeProps['variant'] }> = {
  stopped: { label: 'Stopped', icon: 'pause', variant: 'secondary' },
  starting: { label: 'Starting', icon: 'refresh', variant: 'warning' },
  'running-managed': { label: 'Running', icon: 'server', variant: 'default' },
  'running-external': { label: 'Running externally', icon: 'wifi', variant: 'info' },
  stopping: { label: 'Stopping', icon: 'refresh', variant: 'warning' },
}

function LoadingStatus() {
  return (
    <section aria-label="Loading server status" className="status-section">
      <Card className="surface status-card">
        <div className="status-card-top">
          <div className="status-card-title">
            <span className="status-state-icon"><TablerIcon name="activity" size={17} /></span>
            <div>
              <Skeleton className="h-[18px] w-[150px]" />
              <Skeleton className="mt-2 h-3 w-[200px]" />
            </div>
          </div>
          <Skeleton className="h-[27px] w-[84px]" />
        </div>
        <div className="status-details">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-[38px]" />)}
        </div>
      </Card>
    </section>
  )
}

/** Present the server state and the connection details used by the launcher. */
export function ServerStatus({ status, loading }: ServerStatusProps) {
  if (loading || !status) return <LoadingStatus />

  const info = stateInfo[status.state]
  const isRunning = status.state !== 'stopped'
  const processValue = status.pid === null ? (status.external ? 'External process' : 'Not running') : `PID ${status.pid}`

  return (
    <section aria-label="Server status" className="status-section">
      <Card className="surface status-card">
        <div className="status-card-top">
          <div className="status-card-title">
            <span className="status-state-icon"><TablerIcon name={info.icon} size={17} /></span>
            <div>
              <h2>Development server</h2>
              <p>Local dsh web process</p>
            </div>
          </div>
          <Badge variant={info.variant}>
            <span className={`status-dot ${isRunning ? 'status-pulse' : ''}`} />
            {info.label}
          </Badge>
        </div>

        <Separator className="mt-[22px]" />
        <div className="status-details">
          <div className="status-detail">
            <span className="status-detail-label"><TablerIcon name="externalLink" size={14} />Endpoint</span>
            {status.url ? (
              <a className="status-detail-value status-detail-link" href={status.url} target="_blank" rel="noreferrer">
                {status.url}
              </a>
            ) : (
              <span className="status-detail-value">Waiting to start</span>
            )}
          </div>
          <div className="status-detail">
            <span className="status-detail-label"><TablerIcon name="server" size={14} />Port</span>
            <span className="status-detail-value">{status.port ?? 'Not assigned'}</span>
          </div>
          <div className="status-detail">
            <span className="status-detail-label"><TablerIcon name="activity" size={14} />Process</span>
            <span className="status-detail-value">{processValue}</span>
          </div>
        </div>

        {status.error && (
          <div className="status-error" role="alert">
            <TablerIcon name="alert" size={15} />
            <span>{status.error}</span>
          </div>
        )}
      </Card>
    </section>
  )
}
