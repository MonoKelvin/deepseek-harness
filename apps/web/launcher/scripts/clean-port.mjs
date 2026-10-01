#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const port = 5173

const isWindows = process.platform === 'win32'

if (isWindows) {
  // Windows: find PIDs on port 5173 and kill them synchronously
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'])
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
