import { useEffect, useState, useCallback } from 'react'
import { getStatus, ServerStatusInfo } from '../lib/tauri-api'

export interface ServerStatusResult {
  status: ServerStatusInfo | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useServerStatus(pollIntervalMs: number = 2000): ServerStatusResult {
  const [status, setStatus] = useState<ServerStatusInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getStatus()
      setStatus(result)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    void fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, pollIntervalMs)
    return () => clearInterval(interval)
  }, [fetchStatus, pollIntervalMs])

  return { status, loading, error, refresh }
}
