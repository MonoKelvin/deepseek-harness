/**
 * Settings-shell implementation of the cross-plugin Settings entry: it
 * forwards {@link SettingsNavigation} onto the shell store's own actions, so
 * a click anywhere in the product opens the same panel the sidebar foot does.
 * The interface lives in ui-settings (the settings domain base) so consumers
 * never depend on this shell package.
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNavigation, SettingsSectionIntent } from '@deepseek-ai/dsh-client-ui-settings/client'

/** The shell-store actions the navigation entry forwards to. */
export interface SettingsNavigationTarget {
  /** Open the panel on its current (or first) section. */
  open(): void
  /** Open the panel on one registered section with an optional one-shot intent. */
  openSection(id: string, intent?: SettingsSectionIntent): void
}

/** Forwards {@link SettingsNavigation} onto the shell store's own actions. */
export class SettingsNavigationService extends Service implements SettingsNavigation {
  /**
   * @param ctx - the providing (shell) context.
   * @param target - the shell store actions bound to the live instance.
   */
  constructor(ctx: Context, private readonly target: SettingsNavigationTarget) {
    super(ctx, 'settingsNavigation')
  }

  open(sectionId?: string, intent?: SettingsSectionIntent): void {
    if (sectionId === undefined) this.target.open()
    else this.target.openSection(sectionId, intent)
  }
}
