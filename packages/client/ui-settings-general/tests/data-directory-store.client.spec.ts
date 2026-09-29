import { describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { DataDirectoryStore } from '../src/client/data-directory-store.ts'

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function failed<T>(message: string): RemoteResult<T> {
  return { ok: false, error: new RemoteError('gateway/internal', message, {}) }
}

function storeOver(remote: object, uiWorkspace?: unknown): DataDirectoryStore {
  return new DataDirectoryStore({ remote, get: (name: string) => (name === 'uiWorkspace' ? uiWorkspace : undefined) } as never)
}

describe('DataDirectoryStore', () => {
  it('loads the current directory and defaults the target to it', async () => {
    const store = storeOver({
      settings: { describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: true })) },
    })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready', path: '/home/data', canOpen: true, target: '/home/data',
    })
  })

  it('marks a failed read unavailable', async () => {
    const store = storeOver({
      settings: { describeDataDirectory: () => Promise.resolve(failed('offline')) },
    })
    await store.load()
    expect(store.store.getSnapshot().status).toBe('unavailable')
  })

  it('stages a migration and flags the required restart', async () => {
    const migrate = vi.fn(() => Promise.resolve(ok({ target: '/new', restartRequired: true as const })))
    const store = storeOver({
      settings: {
        describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: false })),
        migrateDataDirectory: migrate,
      },
    })
    await store.load()
    store.setTarget('  /new  ')
    await store.migrate()
    expect(migrate).toHaveBeenCalledWith('/new')
    expect(store.store.getSnapshot()).toMatchObject({ migrating: false, restartRequired: true, error: null })
  })

  it('skips a blank target and records a migration failure', async () => {
    const migrate = vi.fn(() => Promise.resolve(failed<{ target: string; restartRequired: true }>('bad path')))
    const store = storeOver({
      settings: {
        describeDataDirectory: () => Promise.resolve(ok({ path: '', canOpen: false })),
        migrateDataDirectory: migrate,
      },
    })
    store.setTarget('   ')
    await store.migrate()
    expect(migrate).not.toHaveBeenCalled()

    store.setTarget('/x')
    await store.migrate()
    expect(store.store.getSnapshot()).toMatchObject({ error: 'migrate', restartRequired: false })
  })

  it('collapses concurrent migration gestures', async () => {
    let resolveMigrate!: (value: RemoteResult<{ target: string; restartRequired: true }>) => void
    const migrate = vi.fn(() => new Promise<RemoteResult<{ target: string; restartRequired: true }>>(
      (resolve) => { resolveMigrate = resolve }))
    const store = storeOver({ settings: { migrateDataDirectory: migrate } })
    store.setTarget('/new')
    const first = store.migrate()
    const second = store.migrate()
    expect(migrate).toHaveBeenCalledOnce()
    resolveMigrate(ok({ target: '/new', restartRequired: true }))
    await Promise.all([first, second])
  })

  it('opens the directory and records an open failure', async () => {
    const open = vi.fn(() => Promise.resolve(ok({ opened: true as const })))
    const store = storeOver({ settings: { openDataDirectory: open } })
    await store.open()
    expect(open).toHaveBeenCalledOnce()
    open.mockResolvedValueOnce(failed<{ opened: true }>('locked'))
    await store.open()
    expect(store.store.getSnapshot().error).toBe('open')
  })

  it('collapses concurrent open gestures', async () => {
    let resolveOpen!: (value: RemoteResult<{ opened: true }>) => void
    const open = vi.fn(() => new Promise<RemoteResult<{ opened: true }>>((resolve) => { resolveOpen = resolve }))
    const store = storeOver({ settings: { openDataDirectory: open } })
    const first = store.open()
    const second = store.open()
    expect(open).toHaveBeenCalledOnce()
    resolveOpen(ok({ opened: true }))
    await Promise.all([first, second])
  })

  it('adopts a picked directory and ignores an absent picker or a refusal', async () => {
    const pickDirectory = vi.fn((): Promise<string | null> => Promise.resolve('/picked'))
    const store = storeOver({ settings: {} }, { pickDirectory })
    await store.pickTarget()
    expect(store.store.getSnapshot().target).toBe('/picked')

    // A cancel resolves null; a browse-only backend rejects — both leave the target.
    pickDirectory.mockResolvedValueOnce(null)
    await store.pickTarget()
    expect(store.store.getSnapshot().target).toBe('/picked')
    pickDirectory.mockRejectedValueOnce(new Error('native picker unavailable'))
    await store.pickTarget()
    expect(store.store.getSnapshot().picking).toBe(false)

    const withoutService = storeOver({ settings: {} })
    await withoutService.pickTarget()
    expect(withoutService.store.getSnapshot().target).toBe('')
  })
})
