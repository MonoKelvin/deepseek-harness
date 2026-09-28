# Agent Note: One Settings entry point from the composer's model picker

Status: implemented

English | [中文](2026-09-28-model-picker-add-custom-model-entry.zh.md)

## Problem

A user whose catalog holds no suitable model had nothing to act on. The composer's model picker lists models and reasoning efforts only; adding a provider or declaring a custom route lived in Settings → Models, behind opening Settings, finding the section, and pressing its add button.

The picker and the Models page are different feature plugins, and a client feature plugin may not value-import another: behaviour crosses packages through injected Cordis services, UI through slots. Nothing let the picker open Settings on a section, let alone ask that section to start a flow.

## Decision

**The settings domain base owns the contract.** `ui-settings` declares `SettingsNavigation` (`open(sectionId?, intent?)`) with the `ctx.settingsNavigation` Context merge, and extends `SettingsSectionOwnerProps` with `intent`/`onIntentHandled`. The shell (`ui-settings-general`) implements the service over its own view store, so any surface opens the same panel the sidebar foot does.

**The intent is a one-shot, registrant-defined id.** The shell store keeps `intent` beside `activeId`, hands it to the active section as an owner prop, and drops it on any ordinary open, nav selection, or close. `SettingsSectionIntent` names the shipped ids; the base layer stays generic because the honoring section defines the meaning.

**One implementation per surface.** `ModelsSection` extracts its add-card inputs into `addInputs` and one `openAddCard`, so the entry button and the picker intent open the same card the same way; the intent waits for the same provider/settings/credential join the button waits for.

**The picker leads its card with the entry.** `ModelSelect` renders the `+` entry above whichever pane is shown, closes the card, and hands off through its inject face. The entry joins the root pane's roving-focus order but not a drilled list's: `moveFocus` scopes to the shown pane, and the pane-switch restore addresses the root cells by name rather than by position.

## Alternatives considered

**A second, models-specific service.** Exposing `openAddProvider()` from `ui-settings-models` would have put panel opening behind a feature package the composer seat has no other reason to depend on, and left the section-intent channel unbuilt for the next feature that needs one.

**A request store on the navigation service.** The service could have carried a store sections subscribe to. Owner props already reach exactly the active section, so that would have added a subscription and a second source of truth for state the shell owns.

**A mouse-only entry.** Keeping the entry out of the roving-focus order would have left the existing keyboard walk untouched, but an action no keystroke reaches is not a menu item.

## Consequences

- Any feature can open Settings on a registered section and name a one-shot intent without depending on the shell package.
- A section that ignores `intent` is unaffected: an id it does not own is simply dropped.
- The composer model picker leads with one more row, which the root pane's keyboard walk includes.
- The intent is state, not a route — reopening Settings normally shows the section as it was, with no add card.
