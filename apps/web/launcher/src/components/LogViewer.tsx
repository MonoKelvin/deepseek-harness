import { useLayoutEffect, useRef } from 'react'
import type { LogEntry } from '../types/server-status'
import { useI18n, type TranslationKey } from '../i18n'
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

function formatTimestamp(ts: string, locale: 'zh' | 'en'): string {
  try {
    const d = new Date(ts)
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }
    const loc = locale === 'zh' ? 'zh-CN' : 'en-US'
    return d.toLocaleString(loc, options).replace(/\//g, '-') + `.${String(d.getMilliseconds()).padStart(3, '0')}`
  } catch {
    return ts
  }
}

/** Render backend snapshots once, retaining local IPC errors in the same view. */
export function LogViewer({ entries, errors, activeLabel, onClear, onCopy }: LogViewerProps) {
  const { t, locale } = useI18n()
  const body = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const lastId = entries.at(-1)?.id

  const levelLabel = (severity: string) => t(`log.level.${severity}` as TranslationKey)
  const copyToast = () => {
    const el = body.current?.closest('.log-viewer')
    if (el) {
      const dot = document.createElement('span')
      dot.className = 'copy-toast'
      dot.textContent = t('log.copied')
      el.appendChild(dot)
      requestAnimationFrame(() => { dot.style.opacity = '1'; dot.style.transform = 'translateY(0)' })
      setTimeout(() => { dot.style.opacity = '0'; dot.style.transform = 'translateY(-4px)'; dot.remove() }, 1400)
    }
  }

  useLayoutEffect(() => {
    if (follow.current && body.current) body.current.scrollTop = body.current.scrollHeight
  }, [lastId, errors.length])

  return (
    <div className="log-viewer panel-content">
      <div className="log-toolbar">
        <Button variant="ghost" size="sm" onClick={onClear} aria-label={t('log.clear')}>
          <TablerIcon name="trash" size={14} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { onCopy(); copyToast() }} aria-label={t('log.copy')}>
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
                <span className="log-timestamp">{formatTimestamp(entry.timestamp, locale)}</span>
                <span className={`log-level log-level-${entry.severity}`}>{levelLabel(entry.severity)}</span>
                <span className="log-message">{entry.message}</span>
                {'\n'}
              </span>
            ))}
            {errors.map((error, index) => (
              <span key={`ipc-${index}`} className="log-line log-error">
                <span className="log-timestamp">{formatTimestamp(new Date().toISOString(), locale)}</span>
                <span className="log-level log-level-error">{levelLabel('error')}</span>
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
