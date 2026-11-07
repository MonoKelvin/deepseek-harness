import { SERVER_READY_POLL_MS, SERVER_READY_TIMEOUT_MS } from './constants'
import { getStatus } from './tauri-api'

/**
 * Resolve the service address once the backend reports one.
 *
 * The backend confirms the listener before a start resolves, so this normally
 * returns on the first probe; the retries cover a status read that lands while
 * the server is still coming up. Returns null when no address appears before the
 * timeout, leaving the failure to the caller's own report.
 */
export async function waitForServerUrl(
  timeoutMs = SERVER_READY_TIMEOUT_MS,
  intervalMs = SERVER_READY_POLL_MS,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const status = await getStatus()
    if (status.url) return status.url
    if (Date.now() >= deadline) return null
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}
