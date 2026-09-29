import { TablerIcon } from '../lib/TablerIcon'
import type { CommandOutput } from '../lib/tauri-api'
import { Card } from '@/components/ui/card'

export interface LogViewerProps {
  output?: CommandOutput
  error?: string
}

/** Show the most recent command result in a compact terminal surface. */
export function LogViewer({ output, error }: LogViewerProps) {
  const content = error
    ? error
    : [output?.stdout, output?.stderr].filter(Boolean).join('\n')

  if (!content) return null

  const isError = Boolean(error || (output && !output.success))
  const lines = content.split('\n')

  return (
    <section aria-label="Command output">
      <div className="section-heading">
        <h2>Latest output</h2>
        <p>{isError ? 'The command returned an error' : 'The command completed successfully'}</p>
      </div>
      <Card className="surface log-card">
        <div className="log-header">
          <div className="log-title">
            <TablerIcon name={isError ? 'alert' : 'check'} size={15} />
            <span>{isError ? 'Command failed' : 'Command completed'}</span>
          </div>
          <span className="log-meta">{lines.length} lines</span>
        </div>
        <pre className="log-content">
          {lines.map((line, index) => (
            <span key={`${index}-${line}`} className={line.startsWith('[stderr]') || isError ? 'log-line-stderr' : undefined}>
              {line}{index < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </pre>
      </Card>
    </section>
  )
}
