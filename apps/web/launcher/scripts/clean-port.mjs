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
    for (const line of output.split('\n')) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const match = line.match(/\s+(\d+)$/)
        if (match) pids.add(parseInt(match[1]))
      }
    }
    for (const pid of pids) {
      try {
        spawnSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' })
      } catch { }
    }
  }
} else {
  // Unix-like: use lsof synchronously
  spawnSync('sh', ['-c', `lsof -ti:${port} 2>/dev/null | xargs -r kill -9 2>/dev/null || true`])
}
