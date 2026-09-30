import { useLayoutEffect, useRef } from 'react'
import type { LogEntry } from '../types/server-status'
import { useI18n } from '../i18n'
import { Button } from '@/components/ui/button'
import { TablerIcon } from '../lib/TablerIcon'
import { cn } from '../lib/utils'

interface LogViewerProps {
  entries: LogEntry[]
  errors: string[]
  activeLabel?: string
  onClear: () => void
  onCopy: () => void
}

const levelLabels: Record<string, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).replace(/\//g, '-') + `.${String(d.getMilliseconds()).padStart(3, '0')}`
  } catch {
    return ts
  }
}

/** Render backend snapshots once, retaining local IPC errors in the same view. */
export function LogViewer({ entries, errors, activeLabel, onClear, onCopy }: LogViewerProps) {
  const { t } = useI18n()
  const body = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const lastId = entries.at(-1)?.id

  useLayoutEffect(() => {
    if (follow.current && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [lastId, errors.length])

  return (
    <div className="log-viewer panel-content">
      <div className="log-toolbar">
        <Button variant="ghost" size="sm" onClick={onClear} aria-label={t('log.clear')}>
          <TablerIcon name="trash" size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={onCopy} aria-label={t('log.copy')}>
          <TablerIcon name="copy" size={14} />
        </Button>
      </div>
      <div
        ref={body}
        className="log-body"
        tabIndex={0}
        aria-label={t('log.title')}
        onScroll={(event) => {
          const node = event.currentTarget
          follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24
        }}
      >
        {entries.length || errors.length ? (
          <pre>
            {entries.map(entry => (
              <span
                key={entry.id}
                data-log-id={entry.id}
                data-source={entry.source}
                data-severity={entry.severity}
                className="log-line"
              >
                <span className="log-timestamp">{formatTimestamp(entry.timestamp)}</span>
                <span className={`log-level log-level-${entry.severity}`}>{levelLabels[entry.severity] ?? 'INFO'}</span>
                <span className="log-message">{entry.message}</span>
                {'\n'}
              </span>
            ))}
            {errors.map((error, index) => (
              <span key={`ipc-${index}`} className="log-line log-error">
                <span className="log-timestamp">{new Date().toISOString()}</span>
                <span className="log-level log-level-error">ERROR</span>
                <span className="log-message">{error}</span>
                {'\n'}
              </span>
            ))}
          </pre>
        ) : (
          <div className="log-empty">
            <p>{activeLabel ? t('log.pending', { action: activeLabel }) : t('log.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
