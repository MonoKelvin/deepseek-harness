import { invoke } from '@tauri-apps/api/core'
import type { ServerStatusInfo, AppSettings, LogLevel } from '../types/server-status'

export type { ServerStatusInfo, AppSettings, LogLevel } from '../types/server-status'

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
/** Get persisted launcher settings (theme, locale, DSH directory). */
export function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('get_settings')
}

/** Set the DSH workspace root directory. */
export async function setDshDirectory(path: string): Promise<AppSettings> {
  return invoke<AppSettings>('set_dsh_directory', { path })
}

/** Persist the theme preference. */
export async function setTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
  await invoke('set_theme', { theme })
}

/** Persist the locale preference. */
export async function setLocale(locale: 'zh' | 'en'): Promise<void> {
  await invoke('set_locale', { locale })
}

/** Clear the backend log buffer without resetting entry IDs. */
export async function clearLogs(): Promise<void> {
  await invoke('clear_logs')
}

/** Open a directory picker dialog; returns the selected path or null. */
export async function openDirectoryPicker(): Promise<string | null> {
  return invoke<string | null>('open_directory_picker')
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
