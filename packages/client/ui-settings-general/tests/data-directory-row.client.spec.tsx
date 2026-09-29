// @vitest-environment jsdom
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { DataDirectoryRow } from '../src/client/DataDirectoryRow.tsx'
import { DataDirectoryStore } from '../src/client/data-directory-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const unusedHook = (() => { throw new Error('unused by data-directory row') }) as never
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook,
  usePanelInfo, useSessionRetainInfo: () => undefined, useResource, useWorkspaces: unusedHook,
}
const t = ((key: string) => (en as Record<string, string>)[key] ?? key) as never

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function storeOver(remote: object, uiWorkspace?: unknown): DataDirectoryStore {
  return new DataDirectoryStore({ remote, get: (name: string) => (name === 'uiWorkspace' ? uiWorkspace : undefined) } as never)
}

function renderRow(controller: DataDirectoryStore) {
  return render(<DataDirectoryRow {...kit} t={t} controller={controller} useSnapshot={bindSnapshotSelector(controller.store)} />)
}

describe('DataDirectoryRow', () => {
  it('shows the path and opens the directory when the Host can reveal it', async () => {
    const open = vi.fn(() => Promise.resolve(ok({ opened: true as const })))
    const controller = storeOver({
      settings: {
        describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: true })),
        openDataDirectory: open,
      },
    })
    renderRow(controller)
    expect(await screen.findByText('/home/data')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['dataDirectory.open'] }))
    await waitFor(() => { expect(open).toHaveBeenCalledOnce() })
  })

  it('hides the open button when no file manager is available', async () => {
    const controller = storeOver({
      settings: { describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: false })) },
    })
    renderRow(controller)
    await screen.findByText('/home/data')
    expect(screen.queryByRole('button', { name: en['dataDirectory.open'] })).toBeNull()
  })

  it('migrates the typed target and shows the restart notice', async () => {
    const migrate = vi.fn(() => Promise.resolve(ok({ target: '/new', restartRequired: true as const })))
    const controller = storeOver({
      settings: {
        describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: false })),
        migrateDataDirectory: migrate,
      },
    })
    renderRow(controller)
    await screen.findByText('/home/data')
    const input = screen.getByLabelText(en['dataDirectory.title'])
    fireEvent.change(input, { target: { value: '/new' } })
    fireEvent.click(screen.getByRole('button', { name: en['dataDirectory.migrate'] }))
    await waitFor(() => { expect(migrate).toHaveBeenCalledWith('/new') })
    expect(await screen.findByText(en['dataDirectory.restart'])).toBeTruthy()
  })

  it('picks a directory into the target field', async () => {
    const pickDirectory = vi.fn((): Promise<string | null> => Promise.resolve('/chosen'))
    const controller = storeOver({
      settings: { describeDataDirectory: () => Promise.resolve(ok({ path: '/home/data', canOpen: false })) },
    }, { pickDirectory })
    renderRow(controller)
    await screen.findByText('/home/data')
    fireEvent.click(screen.getByRole('button', { name: en['dataDirectory.pick'] }))
    await waitFor(() => { expect(pickDirectory).toHaveBeenCalledOnce() })
    expect(screen.getByLabelText<HTMLInputElement>(en['dataDirectory.title']).value).toBe('/chosen')
  })

  it('stays hidden when the directory cannot be read', async () => {
    const controller = storeOver({
      settings: { describeDataDirectory: () => Promise.resolve({ ok: false as const, error: new RemoteError('gateway/internal', 'x', {}) }) },
    })
    renderRow(controller)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(screen.queryByLabelText(en['dataDirectory.title'])).toBeNull()
  })
})
