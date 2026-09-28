/** Shared settings viewing state for its mouse and command entry points. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
// Type-only: the section-intent id face named by SettingsNavigation.open.
import type { SettingsSectionIntent } from '@deepseek-ai/dsh-client-ui-settings/client'

type State = { open: boolean; activeId: string | undefined; intent: SettingsSectionIntent | undefined }
type Actions = {
  open(draft: State): void
  close(draft: State): void
  select(draft: State, id: string): void
  openSection(draft: State, id: string, intent?: SettingsSectionIntent): void
  clearIntent(draft: State): void
}

/**
 * Declare the settings dialog state and its complete mutation API.
 * @returns one root-scoped store handle for the settings shell.
 *
 * `intent` is a one-shot navigation intent for the section `activeId` names
 * (see `SettingsNavigation.open`): it lives exactly as long as that pairing —
 * an ordinary open, a nav selection, or a close drops it, and the honoring
 * section clears it through `clearIntent`.
 */
export function createSettingsShellStore(): EngineStoreHandle<State, Actions> {
  return defineStore({
    init: (): State => ({ open: false, activeId: undefined as string | undefined, intent: undefined }),
    actions: {
      open: (d) => { d.open = true; d.intent = undefined },
      close: (d) => { d.open = false; d.activeId = undefined; d.intent = undefined },
      select: (d, id: string) => { d.activeId = id; d.intent = undefined },
      openSection: (d, id: string, intent?: SettingsSectionIntent) => {
        d.activeId = id
        d.open = true
        d.intent = intent
      },
      clearIntent: (d) => { d.intent = undefined },
    },
  })
}
