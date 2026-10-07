#!/usr/bin/env node
// scripts/package.mjs — one-click Windows packaging for dsh-web-launcher.
//
// Produces two deliverables under release/:
//   * dsh-web-launcher-<version>-portable.exe — the self-contained Tauri binary.
//     The frontend assets and icons are embedded at compile time and no sidecar
//     resources are declared, so this single file runs directly: no install, no
//     unpack, no folder. Its only external dependency is the system WebView2
//     runtime that ships with Windows 10/11.
//   * dsh-web-launcher-<version>-setup.exe — an Inno Setup installer that lets
//     the user choose the install directory. Needs the Inno Setup compiler
//     (ISCC.exe) on PATH or at its default install location.
//
// Windows-only. Usage:
//   node scripts/package.mjs [--portable] [--installer] [--skip-build] [--upx] [--gnu]
// With neither --portable nor --installer, both deliverables are produced.
// --gnu uses the GNU toolchain (x86_64-pc-windows-gnu) instead of MSVC.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const projectDir = join(here, '..')
const tauriDir = join(projectDir, 'src-tauri')
const releaseDir = join(projectDir, 'release')
const builtExe = join(tauriDir, 'target', 'release', 'dsh-web-launcher.exe')
const issFile = join(tauriDir, 'bundle', 'dsh-web-launcher.iss')
const iconFile = join(projectDir, 'public', 'appicon.ico')
// Repository root LICENSE (apps/web/launcher -> apps/web -> apps -> root).
const licenseFile = join(projectDir, '..', '..', '..', 'LICENSE')

const log = (message) => console.log(`[package] ${message}`)
const rel = (p) => relative(projectDir, p) || p
const mb = (p) => `${(statSync(p).size / (1024 * 1024)).toFixed(2)} MB`

function fail(message) {
  console.error(`[package] error: ${message}`)
  process.exit(1)
}

function printHelp() {
  console.log(`One-click Windows packaging for dsh-web-launcher.

Usage: node scripts/package.mjs [options]

Options:
  --portable    Produce only the portable single-file exe
  --installer   Produce only the Inno Setup installer
  --skip-build  Reuse the existing release binary instead of rebuilding
  --upx         Compress the binary with UPX if available (smaller, may trip AV)
  --gnu         Use GNU toolchain (x86_64-pc-windows-gnu) instead of MSVC
  -h, --help    Show this help

With neither --portable nor --installer, both deliverables are produced.`)
}

function parseArgs(argv) {
  const flags = new Set(argv.slice(2))
  if (flags.has('--help') || flags.has('-h')) { printHelp(); process.exit(0) }
  for (const flag of flags) {
    if (!['--portable', '--installer', '--skip-build', '--upx', '--gnu'].includes(flag)) {
      fail(`unknown option: ${flag} (use --help)`)
    }
  }
  const portable = flags.has('--portable')
  const installer = flags.has('--installer')
  const both = !portable && !installer
  const gnu = flags.has('--gnu')
  return {
    portable: portable || both,
    installer: installer || both,
    skipBuild: flags.has('--skip-build'),
    upx: flags.has('--upx'),
    gnu,
  }
}

function ensureWindows() {
  if (process.platform !== 'win32') {
    fail('packaging is Windows-only; run this on Windows.')
  }
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
  if (!pkg.version) fail('package.json has no version')
  return pkg.version
}

// Run a command, quoting arguments that contain whitespace so paths survive the
// Windows shell. Aborts packaging on a non-zero exit.
function run(cmd, args, opts = {}) {
  const quoted = [cmd, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')
  const result = spawnSync(quoted, { stdio: 'inherit', shell: true, cwd: opts.cwd || projectDir })
  if (result.status !== 0) fail(`command failed (${result.status ?? result.signal}): ${quoted}`)
}

function build(gnu = false) {
  log('building release binary (tauri build --no-bundle)…')
  // Reuse the integrity fix wired into tauri:build so a Low-integrity tree
  // self-heals before the Rust compile; tauri runs the frontend build itself.
  run('node', [join(here, 'fix-permissions.mjs')])
  if (gnu) {
    log('using GNU toolchain (x86_64-pc-windows-gnu)')
    // Use GNU toolchain with MinGW-w64 for linking
    // Note: RUSTFLAGS env doesn't override .cargo/config.toml rustflags
    // We just need to ensure the config.toml has the correct flags
    const result = spawnSync('npx', ['tauri', 'build', '--no-bundle', '--target=x86_64-pc-windows-gnu'], {
      stdio: 'inherit', shell: true, cwd: projectDir
    })
    if (result.status !== 0) {
      fail(`tauri build failed (${result.status ?? result.signal}) with GNU toolchain`)
    }
  } else {
    run('npx', ['tauri', 'build', '--no-bundle'])
  }
}

// Locate the Inno Setup compiler. Checks, in order: the ISCC environment
// override, PATH, the default install directories, and the registry install
// location (which survives non-default drives and version 6/7 differences).
function findISCC() {
  if (process.env.ISCC && existsSync(process.env.ISCC)) return process.env.ISCC
  const which = spawnSync('where', ['iscc'], { encoding: 'utf8' })
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  }
  const candidates = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files (x86)\\Inno Setup 7\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 7\\ISCC.exe',
  ]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return isccFromRegistry()
}

// Read the Inno Setup install directory from its uninstall registry entry
// (`Inno Setup <n>_is1`) and resolve ISCC.exe under it.
function isccFromRegistry() {
  const roots = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]
  for (const root of roots) {
    const list = spawnSync('reg', ['query', root], { encoding: 'utf8' })
    if (list.status !== 0) continue
    const keys = list.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\\Inno Setup [^\\]*_is1$/i.test(l))
    for (const key of keys) {
      const entry = spawnSync('reg', ['query', key, '/v', 'InstallLocation'], { encoding: 'utf8' })
      if (entry.status !== 0) continue
      const match = entry.stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/i)
      if (match) {
        const exe = join(match[1].trim(), 'ISCC.exe')
        if (existsSync(exe)) return exe
      }
    }
  }
  return null
}

function runUpx() {
  const which = spawnSync('where', ['upx'], { encoding: 'utf8' })
  if (which.status !== 0) {
    log('upx not found on PATH; skipping compression')
    return
  }
  log(`compressing with upx (before: ${mb(builtExe)})…`)
  run('upx', ['--best', '--lzma', builtExe])
  log(`compressed (after: ${mb(builtExe)})`)
}

function makePortable(version, exePath = builtExe) {
  const out = join(releaseDir, `dsh-web-launcher-${version}-portable.exe`)
  copyFileSync(exePath, out)

  // Copy WebView2Loader.dll needed by GNU toolchain builds.
  // The DLL is at the same directory as the exe in the target/release folder.
  const webView2Dll = join(dirname(exePath), 'WebView2Loader.dll')
  if (existsSync(webView2Dll)) {
    const dllOut = join(releaseDir, 'WebView2Loader.dll')
    copyFileSync(webView2Dll, dllOut)
    log(`copied WebView2Loader.dll to release directory`)
  }

  log(`portable → ${rel(out)} (${mb(out)})`)
}

function makeInstaller(version, exePath = builtExe) {
  const iscc = findISCC()
  if (!iscc) {
    fail('Inno Setup compiler (ISCC.exe) not found on PATH, in the default install '
      + 'directories, or in the registry. Install it with `winget install JRSoftware.InnoSetup`, '
      + 'or set the ISCC environment variable to its full path, then re-run.')
  }
  const defines = [
    `/DMyAppVersion=${version}`,
    `/DAppExe=${exePath}`,
    `/DIconFile=${iconFile}`,
    `/DOutputDir=${releaseDir}`,
    `/DOutputBaseFilename=dsh-web-launcher-${version}-setup`,
  ]
  if (existsSync(licenseFile)) defines.push(`/DLicenseFile=${licenseFile}`)
  log('compiling Inno Setup installer…')
  run(iscc, [...defines, issFile])
  const out = join(releaseDir, `dsh-web-launcher-${version}-setup.exe`)
  if (existsSync(out)) log(`installer → ${rel(out)} (${mb(out)})`)
}

ensureWindows()
const opts = parseArgs(process.argv)
const version = readVersion()

// Determine the correct binary path based on toolchain
const builtExePath = opts.gnu
  ? join(tauriDir, 'target', 'x86_64-pc-windows-gnu', 'release', 'dsh-web-launcher.exe')
  : builtExe

mkdirSync(releaseDir, { recursive: true })
if (!opts.skipBuild) build(opts.gnu)
if (!existsSync(builtExePath)) {
  fail(`built binary not found: ${rel(builtExePath)} — run without --skip-build first`)
}
if (opts.upx) runUpx()
if (opts.portable) makePortable(version, builtExePath)
if (opts.installer) makeInstaller(version, builtExePath)
log('done.')
