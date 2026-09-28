/**
 * The cross-plugin Settings entry: it must forward onto the shell store's own
 * actions, so a caller anywhere in the product opens the same panel.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SettingsNavigationService } from '../src/client/settings-navigation.ts'

describe('SettingsNavigationService', () => {
  it('opens the panel as the sidebar foot does when no section is named', () => {
    const target = { open: vi.fn(), openSection: vi.fn() }
    const service = new SettingsNavigationService(new Context(), target)

    service.open()

    expect(target.open).toHaveBeenCalledOnce()
    expect(target.openSection).not.toHaveBeenCalled()
  })

  it('opens the panel on the named section and carries its one-shot intent', () => {
    const target = { open: vi.fn(), openSection: vi.fn() }
    const service = new SettingsNavigationService(new Context(), target)

    service.open('models', 'models.add-provider')

    expect(target.openSection).toHaveBeenCalledExactlyOnceWith('models', 'models.add-provider')
    expect(target.open).not.toHaveBeenCalled()
  })
})
