import type { ReactNode } from 'react'
import { TablerIcon, type TablerIconName } from '../lib/TablerIcon'
import { openUrl } from '../lib/tauri-api'
import type { ServerStatusInfo, ServerState } from '../types/server-status'
import { useI18n, type TranslationKey } from '../i18n'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

interface ServerStatusProps {
  status: ServerStatusInfo | null
  loading: boolean
  error?: string | null
}

const stateInfo: Record<ServerState, { icon: TablerIconName; variant: BadgeProps['variant']; labelKey: TranslationKey }> = {
  stopped: { icon: 'pause', variant: 'secondary', labelKey: 'status.state.stopped' },
  starting: { icon: 'refresh', variant: 'warning', labelKey: 'status.state.starting' },
  'running-managed': { icon: 'server', variant: 'default', labelKey: 'status.state.running-managed' },
  'running-external': { icon: 'wifi', variant: 'info', labelKey: 'status.state.running-external' },
  stopping: { icon: 'refresh', variant: 'warning', labelKey: 'status.state.stopping' },
}

function Detail({ icon, label, children }: { icon: TablerIconName; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TablerIcon name={icon} size={13} />
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[13px] text-foreground/90">{children}</div>
    </div>
  )
}

/** Present the server state and the connection details used by the launcher. */
export function ServerStatus({ status, loading, error }: ServerStatusProps) {
  const { t } = useI18n()

  return (
    <Card className="min-h-[172px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md border border-border bg-muted text-muted-foreground">
            <TablerIcon name={status ? stateInfo[status.state].icon : 'activity'} size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">{t('status.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('status.subtitle')}</p>
          </div>
        </div>
        {loading || !status ? (
          <Skeleton className="h-6 w-20 rounded-full" />
        ) : (
          <Badge variant={stateInfo[status.state].variant}>
            <span className="size-1.5 rounded-full bg-current" />
            {t(stateInfo[status.state].labelKey)}
          </Badge>
        )}
      </div>

      <Separator className="my-4" />

      <div className="grid grid-cols-3 gap-3">
        {loading || !status ? (
          <>
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </>
        ) : (
          <>
            <Detail icon="externalLink" label={t('status.endpoint')}>
              {status.url ? (
                <button
                  type="button"
                  onClick={() => void openUrl(status.url!)}
                  className="truncate text-primary underline-offset-4 hover:underline"
                >
                  {status.url}
                </button>
              ) : (
                <span className="text-muted-foreground">{t('status.waiting')}</span>
              )}
            </Detail>
            <Detail icon="server" label={t('status.port')}>
              {status.port ?? <span className="text-muted-foreground">{t('status.notAssigned')}</span>}
            </Detail>
            <Detail icon="activity" label={t('status.process')}>
              {status.pid === null
                ? (status.external ? t('status.externalProcess') : t('status.notRunning'))
                : t('status.pid', { pid: status.pid })}
            </Detail>
          </>
        )}
      </div>

      {(status?.error || error) && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <TablerIcon name="alert" size={14} />
          <span>{status?.error || error}</span>
        </div>
      )}
    </Card>
  )
}
