export type ServerState =
  | 'stopped'
  | 'starting'
  | 'running-managed'
  | 'running-external'
  | 'stopping'

export interface ServerStatusInfo {
  /** The current server state. */
  state: ServerState
  /** The port the server is listening on, if running. */
  port: number | null
  /** The URL to open in a browser, if running. */
  url: string | null
  /** The PID of the managed process, if we started it. */
  pid: number | null
  /** Whether the server was started externally (e.g. from CLI). */
  external: boolean
  /** Recent log lines from the server process. */
  logLines: string[]
  /** Error message if the server is in an error state. */
  error: string | null
}
