/**
 * One-click DeepSeek Harness data-directory relocation.
 *
 * A fixed pointer file at the default home root (`~/.dsh/.data-location`)
 * records where the data actually lives, and the launcher reads it before any
 * consumer resolves `$DSH_HOME`. Migration copies the current data to the
 * chosen directory and records the previous directory in a deferred-cleanup
 * marker; the launcher deletes that previous directory on the next start, so a
 * failed or partial copy never destroys the source (verify-before-delete). The
 * pointer and marker always live at the default root, never inside the movable
 * data, so the launcher can find them after the data has moved away.
 *
 * The control root defaults to the default home in production; tests pass a
 * temporary root so they never touch the real `~/.dsh`.
 *
 * @module @deepseek-ai/dsh-home-paths/data-directory
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { DSH_HOME_ENV, defaultDshHome, expandHomePath, resolveDshHome } from './index.ts'

/** File name of the data-location pointer, kept at the fixed default home root. */
export const DATA_LOCATION_FILE = '.data-location'

/** File name of the deferred-cleanup marker recording the previous data directory. */
export const DATA_CLEANUP_FILE = '.data-cleanup'

/** The previous and post-restart data directories reported by a migration. */
export interface DataDirectoryMigration {
  /** Data directory in use before the migration; deleted on the next launch. */
  readonly previous: string
  /** Directory the data was copied into and used after restart. */
  readonly target: string
}

/** What the launcher settled on after honoring any recorded pointer. */
export interface DataDirectoryRedirect {
  /** True when the launcher moved the effective home to the recorded location. */
  readonly redirected: boolean
  /** Resolved data directory the launcher settled on. */
  readonly home: string
}

/**
 * Absolute path of the data-location pointer at the fixed default home root.
 * @param controlRoot - directory holding the control files; defaults to the default home.
 * @returns the pointer file path, whether or not it exists.
 */
export function dataLocationPointerPath(controlRoot: string = defaultDshHome()): string {
  return join(controlRoot, DATA_LOCATION_FILE)
}

/**
 * Absolute path of the deferred-cleanup marker at the fixed default home root.
 * @param controlRoot - directory holding the control files; defaults to the default home.
 * @returns the marker file path, whether or not it exists.
 */
export function dataCleanupMarkerPath(controlRoot: string = defaultDshHome()): string {
  return join(controlRoot, DATA_CLEANUP_FILE)
}

/**
 * Read one control file as a single absolute path.
 * @param path - control file to read.
 * @returns the normalized recorded path, or undefined when missing or blank.
 */
function readControlPath(path: string): string | undefined {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  const value = raw.trim()
  return value.length > 0 ? resolve(expandHomePath(value)) : undefined
}

/** Whether a path exists and is a directory. */
function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch (error) {
    /* v8 ignore next -- a missing target is ENOENT everywhere; other stat errors are platform-specific */
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

/** Whether `child` is strictly nested below `parent`. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Delete the previous data directory recorded for deferred cleanup. When it is
 * the control root itself, clear only its contents so the pointer and marker
 * survive; otherwise remove the whole directory.
 * @param previous - the directory recorded before migration.
 * @param controlRoot - directory holding the control files.
 */
function performCleanup(previous: string, controlRoot: string): void {
  if (previous !== resolve(controlRoot)) {
    rmSync(previous, { recursive: true, force: true })
    return
  }
  let entries: string[]
  try {
    entries = readdirSync(previous)
  } catch (error) {
    /* v8 ignore next 2 -- the control root holds the marker just read, so it exists here */
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of entries) {
    if (name === DATA_LOCATION_FILE || name === DATA_CLEANUP_FILE) continue
    rmSync(join(previous, name), { recursive: true, force: true })
  }
}

/**
 * Copy the current data directory to a new location and record the move.
 *
 * The copy runs first; only after it returns does this write the new pointer
 * and the deferred-cleanup marker, so an interrupted copy leaves the current
 * data untouched. An earlier staged-but-unactivated target is removed first so
 * re-selecting a directory before restarting never leaves a redundant copy.
 * @param targetPath - chosen destination directory, absolute or `~`-prefixed.
 * @param env - environment consulted for the current `$DSH_HOME`.
 * @param controlRoot - directory holding the control files; defaults to the default home.
 * @returns the previous and target directories.
 * @throws when the target equals or nests with the current directory, or the copy fails.
 */
export function migrateDataDirectory(
  targetPath: string,
  env: Record<string, string | undefined> = process.env,
  controlRoot: string = defaultDshHome(),
): DataDirectoryMigration {
  const previous = resolveDshHome(undefined, env)
  const target = resolve(expandHomePath(targetPath))
  if (target === previous) throw new Error('data directory target is already the current data directory')
  if (isInside(previous, target)) throw new Error('data directory target is inside the current data directory')
  if (isInside(target, previous)) throw new Error('data directory target contains the current data directory')

  const pointerPath = dataLocationPointerPath(controlRoot)
  const staged = readControlPath(pointerPath)
  if (staged !== undefined && staged !== previous && staged !== target && directoryExists(staged)) {
    rmSync(staged, { recursive: true, force: true })
  }

  mkdirSync(target, { recursive: true })
  cpSync(previous, target, {
    recursive: true,
    force: true,
    // The pointer and marker live at the control root; they must not travel
    // with the data when the current home is that root.
    filter: (source) => {
      const name = relative(previous, source)
      return name !== DATA_LOCATION_FILE && name !== DATA_CLEANUP_FILE
    },
  })

  mkdirSync(controlRoot, { recursive: true })
  writeFileSync(pointerPath, `${target}\n`, 'utf8')
  writeFileSync(dataCleanupMarkerPath(controlRoot), `${previous}\n`, 'utf8')
  return { previous, target }
}

/**
 * Perform pending cleanup and honor the recorded data-location pointer.
 *
 * The launcher calls this once, before anything resolves `$DSH_HOME`. It first
 * deletes any directory a completed migration recorded for cleanup, then, when
 * `$DSH_HOME` is not explicitly set, points the environment at the recorded
 * data directory. An explicit `$DSH_HOME` is never overridden.
 * @param env - environment mutated in place with the effective `$DSH_HOME`.
 * @param controlRoot - directory holding the control files; defaults to the default home.
 * @returns whether a redirect happened and the resolved data directory.
 */
export function applyDataDirectoryRedirect(
  env: Record<string, string | undefined> = process.env,
  controlRoot: string = defaultDshHome(),
): DataDirectoryRedirect {
  const markerPath = dataCleanupMarkerPath(controlRoot)
  const pending = readControlPath(markerPath)
  if (pending !== undefined) {
    performCleanup(pending, controlRoot)
    rmSync(markerPath, { force: true })
  }
  const explicit = env[DSH_HOME_ENV]
  if (explicit !== undefined && explicit.trim().length > 0) {
    return { redirected: false, home: resolveDshHome(undefined, env) }
  }
  const target = readControlPath(dataLocationPointerPath(controlRoot))
  if (target === undefined || !directoryExists(target)) {
    return { redirected: false, home: resolveDshHome(undefined, env) }
  }
  env[DSH_HOME_ENV] = target
  return { redirected: true, home: target }
}
