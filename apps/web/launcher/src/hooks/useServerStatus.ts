import { useCallback, useEffect, useRef, useState } from 'react'
import { getStatus, type ServerStatusInfo } from '../lib/tauri-api'
import { POLL_INTERVAL_MS } from '../lib/constants'

export interface ServerStatusResult {
  status: ServerStatusInfo | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Poll the server status. Only the initial fetch toggles `loading`; background
 * polls update silently and keep the last status on error, so the UI does not
 * flicker back to a skeleton every interval.
 *
 * A refresh requested while a poll is in flight re-fetches as soon as that poll
 * settles instead of being dropped, so an action's effect shows up without
 * waiting for the next interval.
 */
export function useServerStatus(pollIntervalMs: number = POLL_INTERVAL_MS): ServerStatusResult {
  const [status, setStatus] = useState<ServerStatusInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialLoad = useRef(true)
  const fetching = useRef(false)
  const pending = useRef(false)

  const fetchStatus = useCallback(async () => {
    if (fetching.current) {
      pending.current = true
      return
    }
    fetching.current = true
    do {
      const isInitial = initialLoad.current
      try {
        const result = await getStatus()
        setStatus(result)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (isInitial) {
          initialLoad.current = false
          setLoading(false)
        }
      }
      pending.current = false
    } while (pending.current)
    fetching.current = false
  }, [])

  const refresh = useCallback(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    void fetchStatus()
    const interval = setInterval(() => void fetchStatus(), pollIntervalMs)
    return () => clearInterval(interval)
  }, [fetchStatus, pollIntervalMs])

  return { status, loading, error, refresh }
}
