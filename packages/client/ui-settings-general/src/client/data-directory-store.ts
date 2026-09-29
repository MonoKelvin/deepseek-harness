/** State owner for the General-settings data-directory relocation control. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ctx.uiWorkspace directory-pick service into this program.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Which action, if any, last failed; the UI shows only localized copy. */
export type DataDirectoryError = 'migrate' | 'open' | null

/** Browser state of the Host-resolved data directory and its relocation. */
export interface DataDirectoryState {
  /** Metadata-loading phase; unavailable means the read failed. */
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** Absolute path of the data directory in use. */
  path: string
  /** Whether the Host can reveal the directory in a native file manager. */
  canOpen: boolean
  /** Destination path the user typed for the next migration. */
  target: string
  /** Whether a migration request is in flight. */
  migrating: boolean
  /** Whether a native-open request is in flight. */
  opening: boolean
  /** Whether a directory-picker request is in flight. */
  picking: boolean
  /** True once a migration staged a move that a restart will complete. */
  restartRequired: boolean
  /** Last action that failed, or null. */
  error: DataDirectoryError
}

/** Reads and relocates the Host data directory over the loopback settings namespace. */
export class DataDirectoryStore {
  /** uSES-safe state source shared by the registered General row. */
  readonly store: SnapshotStore<DataDirectoryState> = createSnapshotStore({
    status: 'idle', path: '', canOpen: false, target: '',
    migrating: false, opening: false, picking: false, restartRequired: false, error: null,
  })

  /**
   * @param ctx - the plugin's context, whose loopback `remote.settings`
   * namespace reads and relocates the data directory, and whose optional
   * `uiWorkspace` service opens the Host directory picker.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Read the current data directory once.
   * @returns settlement after the snapshot reflects the Host answer.
   */
  async load(): Promise<void> {
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    const result = await this.ctx.remote.settings.describeDataDirectory()
    if (!result.ok) {
      this.store.update((state) => { state.status = 'unavailable' })
      return
    }
    const { path, canOpen } = result.value
    this.store.update((state) => {
      state.status = 'ready'
      state.path = path
      state.canOpen = canOpen
      if (state.target === '') state.target = path
    })
  }

  /**
   * Record the destination path the user is editing.
   * @param target - the typed destination path.
   */
  setTarget(target: string): void {
    this.store.update((state) => { state.target = target })
  }

  /**
   * Open the Host directory picker and adopt the chosen path as the target;
   * concurrent gestures collapse, and an absent picker or a cancel is a no-op.
   * @returns after the picker settles.
   */
  async pickTarget(): Promise<void> {
    const workspace = this.ctx.get('uiWorkspace')
    if (workspace === undefined || this.store.getSnapshot().picking) return
    this.store.update((state) => {
      state.picking = true
      state.error = null
    })
    try {
      const chosen = await workspace.pickDirectory()
      if (chosen !== null && chosen !== '') this.setTarget(chosen)
    } catch {
      // A browse-only backend refuses the native picker, and a cancel rejects;
      // neither is an error the user must act on — the path field still works.
    } finally {
      this.store.update((state) => { state.picking = false })
    }
  }

  /**
   * Copy the data to the typed destination and stage the move; concurrent
   * gestures collapse behind the in-flight request.
   * @returns after the migration request settles, or immediately when busy/blank.
   */
  async migrate(): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.migrating || current.target.trim() === '') return
    this.store.update((state) => {
      state.migrating = true
      state.error = null
    })
    try {
      const result = await this.ctx.remote.settings.migrateDataDirectory(current.target.trim())
      this.store.update((state) => {
        if (result.ok) state.restartRequired = true
        else state.error = 'migrate'
      })
    } finally {
      this.store.update((state) => { state.migrating = false })
    }
  }

  /**
   * Reveal the current data directory in the Host file manager; concurrent
   * gestures collapse behind the in-flight request.
   * @returns after the native-open request settles, or immediately when busy.
   */
  async open(): Promise<void> {
    const current = this.store.getSnapshot()
    if (current.opening) return
    this.store.update((state) => {
      state.opening = true
      state.error = null
    })
    try {
      const result = await this.ctx.remote.settings.openDataDirectory()
      if (!result.ok) this.store.update((state) => { state.error = 'open' })
    } finally {
      this.store.update((state) => { state.opening = false })
    }
  }
}
