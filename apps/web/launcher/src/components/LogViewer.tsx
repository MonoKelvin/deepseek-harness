import React from 'react'
import { TablerIcon } from '../lib/TablerIcon'
import type { CommandOutput } from '../lib/tauri-api'

export interface LogViewerProps {
  output?: CommandOutput
  error?: string
}

export function LogViewer({ output, error }: LogViewerProps) {
  const content = error || output?.stdout || output?.stderr
  if (!content) return null

  const hasSuccess = output?.success
  const isError = error || !hasSuccess

  return (
    <section className="log-section">
      <div className="glass-card log-card">
        <div className="log-header flex items-center gap-2 px-3 py-2 border-b border-border">
          <TablerIcon name={isError ? 'alert' : 'check'} size={14} />
          <span className="text-xs font-medium text-text-secondary">
            {isError ? 'Error Output' : 'Command Output'}
          </span>
        </div>
        <pre className="log-content whitespace-pre-wrap font-mono text-xs text-text-tertiary">
          {error
            ? `❌ ${error}`
            : content.split('\n').map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith('[stderr]') ? 'text-danger' : 'text-text-tertiary'
                }
              >
                {line}
                {'\n'}
              </span>
            ))}
        </pre>
      </div>
    </section>
  )
}
