import { TablerIcon } from '../lib/TablerIcon'
import type { CommandOutput } from '../lib/tauri-api'
import { useI18n } from '../i18n'
import { Card } from '@/components/ui/card'

export interface LogViewerProps {
  output?: CommandOutput
  error?: string
}

/** Show the most recent command result in a compact terminal surface. */
export function LogViewer({ output, error }: LogViewerProps) {
  const { t } = useI18n()
  const content = error ? error : [output?.stdout, output?.stderr].filter(Boolean).join('\n')

  if (!content) return null

  const isError = Boolean(error || (output && !output.success))
  const lines = content.split('\n')

  return (
    <Card className="overflow-hidden">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <TablerIcon name={isError ? 'alert' : 'check'} size={14} className={isError ? 'text-destructive' : 'text-success'} />
          <span>{isError ? t('log.fail.title') : t('log.done.title')}</span>
        </div>
        <span className="text-xs text-muted-foreground">{t('log.lines', { n: lines.length })}</span>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {lines.map((line, index) => (
          <span key={`${index}-${line}`} className={line.startsWith('[stderr]') || isError ? 'text-destructive' : undefined}>
            {line}
            {index < lines.length - 1 ? '\n' : ''}
          </span>
        ))}
      </pre>
    </Card>
  )
}
