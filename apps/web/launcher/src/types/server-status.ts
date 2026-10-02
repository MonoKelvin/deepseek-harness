export type ServerState = 'stopped' | 'starting' | 'running-managed' | 'running-external' | 'stopping'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: number
  source: 'launcher' | 'stdout' | 'stderr'
  severity: LogLevel
  timestamp: string
  message: string
}

export interface ServerStatusInfo {
  state: ServerState
  port: number | null
  url: string | null
  pid: number | null
  external: boolean
  dshDirectoryValid: boolean
  logEntries: LogEntry[]
  error: string | null
}

export interface AppSettings {
  dshDirectory: string | null
  theme: string
  locale: string
  /** Mirrors the OS autostart entry; not stored in the settings file. */
  autostart: boolean
  /** Whether exiting the launcher also stops the dsh service it started. */
  stopServicesOnExit: boolean
}
