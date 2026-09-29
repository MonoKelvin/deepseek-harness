import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DATA_CLEANUP_FILE,
  DATA_LOCATION_FILE,
  applyDataDirectoryRedirect,
  dataCleanupMarkerPath,
  dataLocationPointerPath,
  migrateDataDirectory,
} from '@deepseek-ai/dsh-home-paths'

const temps: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-datadir-'))
  temps.push(dir)
  return resolve(dir)
}

afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true })
})

describe('data-directory control paths', () => {
  it('anchors the pointer and marker at the given control root', () => {
    expect(dataLocationPointerPath('/root')).toBe(join('/root', DATA_LOCATION_FILE))
    expect(dataCleanupMarkerPath('/root')).toBe(join('/root', DATA_CLEANUP_FILE))
  })
})

describe('migrateDataDirectory', () => {
  it('copies the current data and records the move without deleting the source', async () => {
    const base = await tempDir()
    const home = join(base, 'home')
    const control = join(base, 'control')
    const target = join(base, 'moved')
    await mkdir(join(home, 'sessions'), { recursive: true })
    await writeFile(join(home, 'sessions', 'a.jsonl'), 'row', 'utf8')

    const result = migrateDataDirectory(target, { DSH_HOME: home }, control)

    expect(result).toEqual({ previous: home, target })
    expect(await readFile(join(target, 'sessions', 'a.jsonl'), 'utf8')).toBe('row')
    expect(existsSync(join(home, 'sessions', 'a.jsonl'))).toBe(true)
    expect((await readFile(dataLocationPointerPath(control), 'utf8')).trim()).toBe(target)
    expect((await readFile(dataCleanupMarkerPath(control), 'utf8')).trim()).toBe(home)
  })

  it('keeps control files out of the copy when the home is the control root', async () => {
    const base = await tempDir()
    const home = join(base, 'home')
    await mkdir(home, { recursive: true })
    await writeFile(join(home, 'settings.yml'), 'x', 'utf8')
    // The control root is the home itself; a prior pointer sits inside it.
    await writeFile(join(home, DATA_LOCATION_FILE), '/somewhere\n', 'utf8')
    const target = join(base, 'moved')

    migrateDataDirectory(target, { DSH_HOME: home }, home)

    expect(existsSync(join(target, 'settings.yml'))).toBe(true)
    expect(existsSync(join(target, DATA_LOCATION_FILE))).toBe(false)
  })

  it('removes an earlier staged-but-unactivated target to avoid a redundant copy', async () => {
    const base = await tempDir()
    const home = join(base, 'home')
    const control = join(base, 'control')
    await mkdir(home, { recursive: true })
    await writeFile(join(home, 'f'), '1', 'utf8')
    const first = join(base, 'first')
    const second = join(base, 'second')

    migrateDataDirectory(first, { DSH_HOME: home }, control)
    expect(existsSync(first)).toBe(true)
    migrateDataDirectory(second, { DSH_HOME: home }, control)

    expect(existsSync(first)).toBe(false)
    expect(existsSync(second)).toBe(true)
    expect((await readFile(dataLocationPointerPath(control), 'utf8')).trim()).toBe(second)
  })

  it('rejects a target equal to or nested with the current directory', async () => {
    const base = await tempDir()
    const home = join(base, 'home')
    await mkdir(home, { recursive: true })
    expect(() => migrateDataDirectory(home, { DSH_HOME: home }, base)).toThrow('already the current')
    expect(() => migrateDataDirectory(join(home, 'inner'), { DSH_HOME: home }, base)).toThrow('inside the current')
    const outer = join(base, 'outer')
    expect(() => migrateDataDirectory(outer, { DSH_HOME: join(outer, 'inner') }, base)).toThrow('contains the current')
  })
})

describe('applyDataDirectoryRedirect', () => {
  it('does nothing without a pointer or marker', async () => {
    const control = await tempDir()
    const env: Record<string, string | undefined> = { DSH_HOME: join(control, 'x') }
    const result = applyDataDirectoryRedirect(env, control)
    expect(result.redirected).toBe(false)
  })

  it('redirects an unset home to the recorded directory', async () => {
    const base = await tempDir()
    const control = join(base, 'control')
    const moved = join(base, 'moved')
    await mkdir(moved, { recursive: true })
    await mkdir(control, { recursive: true })
    await writeFile(dataLocationPointerPath(control), `${moved}\n`, 'utf8')
    const env: Record<string, string | undefined> = {}
    expect(applyDataDirectoryRedirect(env, control)).toEqual({ redirected: true, home: moved })
    expect(env.DSH_HOME).toBe(moved)
  })

  it('never overrides an explicit home', async () => {
    const base = await tempDir()
    const control = join(base, 'control')
    const moved = join(base, 'moved')
    await mkdir(moved, { recursive: true })
    await mkdir(control, { recursive: true })
    await writeFile(dataLocationPointerPath(control), `${moved}\n`, 'utf8')
    const env: Record<string, string | undefined> = { DSH_HOME: join(base, 'explicit') }
    expect(applyDataDirectoryRedirect(env, control).redirected).toBe(false)
    expect(env.DSH_HOME).toBe(join(base, 'explicit'))
  })

  it('ignores a blank pointer and a missing target directory', async () => {
    const base = await tempDir()
    const control = join(base, 'control')
    await mkdir(control, { recursive: true })
    await writeFile(dataLocationPointerPath(control), '   \n', 'utf8')
    expect(applyDataDirectoryRedirect({}, control).redirected).toBe(false)
    await writeFile(dataLocationPointerPath(control), `${join(base, 'gone')}\n`, 'utf8')
    expect(applyDataDirectoryRedirect({}, control).redirected).toBe(false)
  })

  it('deletes a recorded previous directory and clears the marker', async () => {
    const base = await tempDir()
    const control = join(base, 'control')
    const old = join(base, 'old')
    await mkdir(old, { recursive: true })
    await mkdir(control, { recursive: true })
    await writeFile(join(old, 'stale'), '1', 'utf8')
    await writeFile(dataCleanupMarkerPath(control), `${old}\n`, 'utf8')

    applyDataDirectoryRedirect({ DSH_HOME: join(base, 'current') }, control)

    expect(existsSync(old)).toBe(false)
    expect(existsSync(dataCleanupMarkerPath(control))).toBe(false)
  })

  it('clears the control root contents but keeps its control files', async () => {
    const control = await tempDir()
    await writeFile(join(control, 'sessions.db'), '1', 'utf8')
    await writeFile(dataLocationPointerPath(control), `${control}\n`, 'utf8')
    await writeFile(dataCleanupMarkerPath(control), `${control}\n`, 'utf8')

    applyDataDirectoryRedirect({ DSH_HOME: control }, control)

    expect(existsSync(join(control, 'sessions.db'))).toBe(false)
    expect(existsSync(dataLocationPointerPath(control))).toBe(true)
  })

  it('rethrows a control-file read error that is not absence', async () => {
    const control = await tempDir()
    // A directory where the marker file is expected makes readFileSync throw EISDIR.
    await mkdir(dataCleanupMarkerPath(control), { recursive: true })
    expect(() => applyDataDirectoryRedirect({ DSH_HOME: join(control, 'x') }, control)).toThrow()
  })
})
