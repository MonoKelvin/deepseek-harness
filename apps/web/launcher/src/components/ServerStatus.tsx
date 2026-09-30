import type { ServerStatusInfo, ServerState } from '../types/server-status'
import { useI18n, type TranslationKey } from '../i18n'
import { TablerIcon } from '../lib/TablerIcon'
import { Button } from '@/components/ui/button'

interface ServerStatusProps {
  status: ServerStatusInfo | null
  loading: boolean
  error?: string | null
  onRetry: () => void
}

const stateLabels: Record<ServerState, TranslationKey> = {
  stopped: 'status.state.stopped',
  starting: 'status.state.starting',
  'running-managed': 'status.state.running-managed',
  'running-external': 'status.state.running-external',
  stopping: 'status.state.stopping',
}

/** Show the last status without treating unavailable data as a stopped service. */
export function ServerStatus({ status, loading, error, onRetry }: ServerStatusProps) {
  const { t } = useI18n()
  const directoryMissing = status?.dshDirectoryValid === false
  const failure = error || status?.error || directoryMissing
  const state = failure ? 'unavailable' : loading || !status ? 'loading' : status.state
  const label = failure ? t('status.unavailable') : loading || !status ? t('status.loading') : t(stateLabels[status.state])
  const explanation = error
    ? t(error.includes('state not managed') ? 'status.stateNotManaged' : 'status.connectionFailed')
    : t(directoryMissing ? 'status.dshMissingTooltip' : 'status.connectionFailed')
  const address = status?.url ?? (status?.port ? `127.0.0.1:${status.port}` : null)

  return (
    <>
      <div className="service-heading">
        <h1>{t('status.title')}</h1>
        <div className="service-state" data-state={state} role="status">
          <span className="state-dot" aria-hidden="true" />
          <span className="service-state-label">{label}</span>
          {failure && (
            <>
              {error && (
                <Button variant="ghost" size="sm" onClick={onRetry} aria-label={t('status.retry')} data-tooltip={t('status.retry')}>
                  <TablerIcon name="refresh" size={12} />
                </Button>
              )}
              <span className="status-error-icon" role="img" tabIndex={0} aria-label={explanation} data-tooltip={explanation}>
                <TablerIcon name="alert" size={13} aria-hidden="true" />
              </span>
            </>
          )}
        </div>
      </div>
      <div className="service-metadata">
        <span className="service-address" data-tooltip={address ?? undefined}>{address ?? t('status.notAssigned')}</span>
      </div>
    </>
  )
}
