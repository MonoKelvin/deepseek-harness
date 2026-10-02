#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { DEV_PORT } from './constants.mjs'

const port = DEV_PORT

const isWindows = process.platform === 'win32'

if (isWindows) {
  // Windows: find PIDs on port 5173 and kill them synchronously.
  // Use `netstat -ano` without `-p tcp`: the `-p tcp` filter lists only IPv4, so
  // it misses an IPv6 listener (e.g. vite binding `[::1]:5173` when localhost
  // resolves to ::1), leaving the port occupied. Plain `-ano` reports IPv6 TCP
  // rows under the same "TCP" proto, so both are caught.
  const result = spawnSync('netstat', ['-ano'])
  if (result.status === 0) {
    const output = result.stdout.toString()
    const pids = new Set()
    for (const line of output.split(/\r?\n/)) {
      // Columns: Proto, Local Address, Foreign Address, State, PID.
      const columns = line.trim().split(/\s+/)
      if (columns.length < 5 || columns[3] !== 'LISTENING' || !columns[1].endsWith(`:${port}`)) continue
      if (/^\d+$/.test(columns[4])) pids.add(Number(columns[4]))
    }
    for (const pid of pids) {
      try {
        spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' })
      } catch { }
    }
  }
} else {
  // Unix-like: use lsof synchronously
  spawnSync('sh', ['-c', `lsof -ti:${port} 2>/dev/null | xargs -r kill -9 2>/dev/null || true`])
}
