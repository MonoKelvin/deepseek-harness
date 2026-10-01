import { useCallback, useEffect, useState } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { LogEntry } from '../types/server-status'

const MAX_ENTRIES = 200

/** Event the launcher backend emits for each appended log entry. */
export const LOG_ENTRY_EVENT = 'log-entry'

/**
 * Merge entries by their monotonic IDs. A status snapshot and a live event can
 * carry the same entry, and an event can arrive before the snapshot that
 * contains it, so unioning by ID keeps the order stable either way.
 */
function merge(current: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  if (!incoming.length) return current
  const byId = new Map(current.map(entry => [entry.id, entry]))
  for (const entry of incoming) byId.set(entry.id, entry)
  return [...byId.values()].sort((left, right) => left.id - right.id).slice(-MAX_ENTRIES)
}

export interface LogStream {
  entries: LogEntry[]
  clear: () => void
}

/**
 * Live log entries. The status snapshot seeds the list, and the backend's
 * `log-entry` event appends each new line as it is produced, so the log view
 * does not wait for the next status poll.
 */
export function useLogStream(seed: LogEntry[] | undefined): LogStream {
  const [entries, setEntries] = useState<LogEntry[]>([])

  // The seed is a fresh array per poll; merging is idempotent and repairs any
  // line the event stream lost while the window was not listening.
  useEffect(() => {
    if (seed) setEntries(current => merge(current, seed))
  }, [seed])

  useEffect(() => {
    let disposed = false
    let stop: UnlistenFn | undefined
    void listen<LogEntry>(LOG_ENTRY_EVENT, (event) => {
      setEntries(current => merge(current, [event.payload]))
    }).then((unlisten) => {
      if (disposed) unlisten()
      else stop = unlisten
    }).catch((error: unknown) => {
      // Without the subscription the view still fills from status polls, but
      // lines arrive late, so leave a trace of why.
      console.error('Failed to subscribe to log events', error)
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [])

  const clear = useCallback(() => setEntries([]), [])
  return { entries, clear }
}
