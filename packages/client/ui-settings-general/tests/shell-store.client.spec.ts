/** The settings view store's complete mutation API, including its one-shot section intent. */
import { describe, expect, it } from 'vitest'
import { createSettingsShellStore } from '../src/client/shell-store.ts'

describe('settings shell store', () => {
  it('carries a one-shot intent only for the pairing it was opened with', () => {
    const store = createSettingsShellStore().create()

    store.actions.openSection('models', 'models.add-provider')
    expect(store.getSnapshot()).toEqual({ open: true, activeId: 'models', intent: 'models.add-provider' })

    // The honoring section clears it as it acts on it.
    store.actions.clearIntent()
    expect(store.getSnapshot()).toEqual({ open: true, activeId: 'models', intent: undefined })

    // An ordinary nav selection drops whatever pairing came before.
    store.actions.openSection('models', 'models.add-provider')
    store.actions.select('general')
    expect(store.getSnapshot()).toEqual({ open: true, activeId: 'general', intent: undefined })
  })

  it('drops any pending intent when the panel opens or closes as a whole', () => {
    const store = createSettingsShellStore().create()

    store.actions.openSection('models', 'models.add-provider')
    store.actions.open()
    expect(store.getSnapshot()).toEqual({ open: true, activeId: 'models', intent: undefined })

    store.actions.openSection('models', 'models.add-provider')
    store.actions.close()
    expect(store.getSnapshot()).toEqual({ open: false, activeId: undefined, intent: undefined })
  })
})
