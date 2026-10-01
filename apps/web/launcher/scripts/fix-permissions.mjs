#!/usr/bin/env node
// Cross-platform wrapper around scripts/fix-integrity.ps1.
// On non-Windows it is a no-op; on Windows it runs the PowerShell script
// (which self-elevates only when a Low-integrity sandbox label is detected).
// Wired into `tauri:dev` / `tauri:build` so a fresh clone on a sandboxed
// machine self-heals before the Rust build runs.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, '..');

if (process.platform !== 'win32') {
  console.log('[fix-permissions] not Windows, skipping');
  process.exit(0);
}

const ps1 = join(here, 'fix-integrity.ps1');
const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-ProjectDir', projectDir],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
