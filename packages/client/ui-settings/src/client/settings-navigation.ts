/**
 * Cross-plugin entry into the Settings panel. The settings domain base owns
 * the contract so any feature can open Settings on a registered section —
 * optionally with a one-shot intent its registrant honors — without depending
 * on the shell package that renders the panel. The shell provides the
 * implementation over its own view store.
 */

import type { SettingsSectionIntent } from './contract/slots.ts'

/** Cross-plugin entry into the Settings panel. */
export interface SettingsNavigation {
  /**
   * Open the Settings panel, optionally on one registered section.
   * @param sectionId - registered `settings.section` id; absent opens the
   * panel on its current (or first) section.
   * @param intent - one-shot id delivered to that section through its owner
   * props (see `SettingsSectionOwnerProps.intent`); the section owning the id
   * decides what it means.
   */
  open(sectionId?: string, intent?: SettingsSectionIntent): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin entry into the Settings panel. */
    settingsNavigation: SettingsNavigation
  }
}
