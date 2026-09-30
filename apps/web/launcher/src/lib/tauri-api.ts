import { invoke } from '@tauri-apps/api/core'
import type { ServerStatusInfo } from '../types/server-status'

export type { ServerStatusInfo } from '../types/server-status'

/** Result returned by a lifecycle command executed by the Tauri backend. */
export interface CommandOutput {
  success: boolean
  stdout: string
  stderr: string
}

/** Read the current dsh web server status. */
export function getStatus(): Promise<ServerStatusInfo> {
  return invoke<ServerStatusInfo>('get_status')
}

/** Install workspace dependencies through the launcher backend. */
export function installDeps(): Promise<CommandOutput> {
  return invoke<CommandOutput>('install_deps')
}

/** Build the web frontend through the launcher backend. */
export function buildFrontend(): Promise<CommandOutput> {
  return invoke<CommandOutput>('build_frontend')
}

/** Start a managed dsh web server process. */
export function startServer(): Promise<CommandOutput> {
  return invoke<CommandOutput>('start_server')
}

/** Stop the managed dsh web server process. */
export function stopServer(): Promise<CommandOutput> {
  return invoke<CommandOutput>('stop_server')
}

/** Restart the managed dsh web server process. */
export function restartServer(): Promise<CommandOutput> {
  return invoke<CommandOutput>('restart_server')
}

/** Open a URL in the user's default browser via the launcher backend. */
export function openUrl(url: string): Promise<void> {
  return invoke<void>('open_url', { url })
}
