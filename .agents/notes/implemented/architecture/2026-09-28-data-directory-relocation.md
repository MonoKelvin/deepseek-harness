# Agent Note: One-click data-directory relocation for the Web GUI

Status: implemented

English | [中文](2026-09-28-data-directory-relocation.zh.md)

## Problem

The DeepSeek Harness data tree — `$DSH_HOME`: sessions, settings, credentials, plugins — lives wherever the launcher resolved it, and moving it meant stopping dsh, copying files by hand, and setting `DSH_HOME`. Users want to relocate it from the GUI in one action, without losing data if the copy fails and without leaving a redundant copy behind.

## Decision

The General settings section renders a **Data directory** control on a loopback page: the resolved `$DSH_HOME` path, an open-location icon button, a target-path field, and a **Migrate** action that shows a restart notice on success.

Relocation is a copy-then-deferred-delete completed across a restart, not a live move:

1. `settings.migrateDataDirectory(target)` on the host `SettingsController` calls `migrateDataDirectory` in `dsh-home-paths`, which copies the current `$DSH_HOME` to the chosen directory, then writes a pointer file `.data-location` and a cleanup marker `.data-cleanup` at the fixed default root (`~/.dsh`).
2. The UI shows the restart notice.
3. On the next launch `apps/cli` calls `applyDataDirectoryRedirect(process.env)` before anything resolves `$DSH_HOME`: it deletes the directory the marker records, clears the marker, and — when `$DSH_HOME` is not explicitly set — points the environment at the recorded directory.

The launcher, not `resolveDshHome`, honors the pointer: `resolveDshHome` runs synchronously in many hot paths, so the launcher reads the pointer once and sets `process.env.DSH_HOME`, leaving every existing consumer unchanged. An explicit `$DSH_HOME` always wins and is never overridden. The control files live at the fixed default root, never inside the movable data, so the launcher finds them after the data moves and deleting the old data never removes them; when the old home is the default root itself, cleanup clears its contents but keeps the two control files.

## Seams

- `@deepseek-ai/dsh-home-paths`: `migrateDataDirectory`, `applyDataDirectoryRedirect`, `dataLocationPointerPath`, `dataCleanupMarkerPath`. The control-root parameter defaults to the default home; tests pass a temporary root so they never touch the real `~/.dsh`.
- `@deepseek-ai/dsh-api-settings-controller`: `@Remote describeDataDirectory` / `openDataDirectory` / `migrateDataDirectory` on the existing `settings` namespace.
- `@deepseek-ai/dsh-client-ui-settings-general`: `DataDirectoryStore` and `DataDirectoryRow`, registered into `settings.general.item` (order 50) only when `ctx.remote.$host.isLoopback`.

## Alternatives considered

**Make `resolveDshHome` read the pointer directly.** Rejected: it is called synchronously across many packages and hot paths, so a per-call file read would be a broad performance and behavior change with a large blast radius. Reading once in the launcher and setting the env var keeps every consumer's contract intact.

**Move (rename) the live data instead of copying.** Rejected: the running Host holds open handles (sqlite, logs) on the current directory; renaming or deleting them mid-run is unsafe on Windows and risks corruption. Copy-then-restart-delete is the safe equivalent and satisfies "cut, or copy when cut is impossible".

**Persist a real OS-level `DSH_HOME` environment variable.** Rejected for this scope: cross-platform persistent env editing (registry, shell rc) is fragile. The pointer file at the fixed default root is portable and needs no OS-level change; "restart" means restarting `dsh web`.

**Store the pointer inside the data directory.** Rejected: the launcher must find it after the data has moved away, and deleting the old directory would remove it. The fixed default root is the only stable anchor.

## Consequences

The relocation is safe against a failed copy: the pointer and marker are written only after the copy returns, and the delete is deferred to the next launch, so the source is never destroyed before a verified copy exists, and after the restart only one copy remains. Re-selecting a directory before restarting removes the earlier staged-but-unactivated target, avoiding accumulation.

Scope is the Web GUI. Desktop's self-managed relaunch and `$DSH_HOME`, and an OS-level persistent variable, are out of scope. During the window between migrating and restarting, both copies exist; this is unavoidable and safe. Copying a large data tree while the Host holds open handles can fail on Windows (for example EBUSY on an open sqlite file); such a failure surfaces as a migration error and leaves the source intact.

## Testing

`packages/util/home-paths/tests/data-directory.spec.ts` covers the copy, control-file exclusion, staged-target cleanup, nesting rejections, redirect, explicit-home precedence, blank/missing pointer, and both cleanup shapes. `packages/api/settings-controller/tests/settings-controller.host.spec.ts` covers describe/open/migrate including the absent-file-manager and failure paths. `packages/client/ui-settings-general/tests/data-directory-store.client.spec.ts` and `data-directory-row.client.spec.tsx` cover the store and row.
