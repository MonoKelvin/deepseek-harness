import { useLayoutEffect, useRef } from 'react'
import type { LogEntry } from '../types/server-status'
import { useI18n } from '../i18n'

interface LogViewerProps {
  entries: LogEntry[]
  activeLabel?: string
}

/** Render bounded logs with compact UTC times and full timestamps in tooltips. */
export function LogViewer({ entries, activeLabel }: LogViewerProps) {
  const { t } = useI18n()
  const body = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const lastId = entries.at(-1)?.id

  const levelLabel = (severity: LogEntry['severity']) => t(`log.level.${severity}`)

  useLayoutEffect(() => {
    if (follow.current && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [lastId])

  return (
    <div className="log-viewer panel-content">
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
        {entries.length ? (
          <pre>
            {entries.map(entry => (
              <span
                key={entry.id}
                data-log-id={entry.id}
                data-source={entry.source}
                data-severity={entry.severity}
                className="log-line"
              >
                <span className="log-timestamp" data-tooltip={`${entry.timestamp} UTC`}>{entry.timestamp.slice(11, 23)}</span>
                <span className={`log-level log-level-${entry.severity}`}>{levelLabel(entry.severity)}</span>
                <span className="log-message">{entry.message}</span>
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
