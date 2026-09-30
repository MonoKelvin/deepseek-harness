import type { ServerStatusInfo, ServerState } from '../types/server-status'
import { useI18n, type TranslationKey } from '../i18n'
import { Button } from '@/components/ui/button'

interface ServerStatusProps {
  status: ServerStatusInfo | null
  loading: boolean
  error?: string | null
  dshDirectoryValid: boolean
  onRetry: () => void
  onNavigateToSettings: () => void
}

const stateLabels: Record<ServerState, TranslationKey> = {
  stopped: 'status.state.stopped',
  starting: 'status.state.starting',
  'running-managed': 'status.state.running-managed',
  'running-external': 'status.state.running-external',
  stopping: 'status.state.stopping',
}

/** Show the last status without treating unavailable data as a stopped service. */
export function ServerStatus({ status, loading, error, dshDirectoryValid, onRetry, onNavigateToSettings }: ServerStatusProps) {
  const { t } = useI18n()
  const failure = error || status?.error
  const state = failure ? 'unavailable' : loading || !status ? 'loading' : status.state
  const label = failure ? t('status.unavailable') : loading || !status ? t('status.loading') : t(stateLabels[status.state])
  const address = status?.url ?? (status?.port ? `127.0.0.1:${status.port}` : null)

  return (
    <>
      <div className="service-heading">
        <h1>{t('status.title')}</h1>
        <div className="service-state" data-state={state} role="status">
          <span className="state-dot" aria-hidden="true" />
          {label}
        </div>
      </div>
      <div className="service-metadata">
        <span className="service-address" data-tooltip={address ?? undefined}>{address ?? t('status.notAssigned')}</span>
      </div>
      {failure && (
        <div className="status-error" role="alert">
          <span className="status-error-message">{failure}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>{t('status.retry')}</Button>
        </div>
      )}
      {!dshDirectoryValid && (
        <div className="dsh-missing">
          <span onClick={onNavigateToSettings}>{t('status.dshMissing')}</span>
        </div>
      )}
    </>
  )
}
