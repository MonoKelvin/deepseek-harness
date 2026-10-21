---
name: dsh-sync-fork
description: 同步 fork 上游（sync fork / 同步fork / 拉取上游 / merge upstream）。当用户提到「同步fork」「同步上游」「sync fork」「拉取/合并 upstream」或要求把 deepseek-ai/deepseek-harness 的新提交合并进本 fork 时使用。覆盖上游拉取、代理修正、Windows 钩子绕过、冲突解决热点、锁文件与双语记录重建、按面验证。
---

# DSH Sync Fork

Bring new commits from the upstream `deepseek-ai/deepseek-harness` into this fork's `master`, resolve conflicts without regressions, then verify the surfaces the merge touched. Follow the steps in order; each records a fact learned from a prior sync that is not obvious from the tree.

## 0. Preconditions specific to this host

- **Upstream remote:** `https://github.com/deepseek-ai/deepseek-harness`. Add it once: `git remote add upstream <url>` (idempotent — ignore "already exists").
- **Git proxy gotcha:** this machine sets only `https.proxy` in git config, which git IGNORES (git honors `http.proxy` for every scheme). All GitHub fetches time out unless you pass the proxy explicitly. Read the configured proxy and reuse it:
  ```sh
  PROXY=$(git config --get https.proxy)   # e.g. http://127.0.0.1:7897
  git -c http.proxy="$PROXY" fetch upstream
  ```
  Also export `https_proxy=$PROXY http_proxy=$PROXY` for `pnpm`/`npx` steps.
- **Pre-commit hooks crash here:** lefthook spawns `sh.exe`, and msys fails with `NtCreateDirectoryObject … 0xC0000022` (an environment fork fault, NOT a lint failure). Commit with `--no-verify` and run the equivalent checks manually (this skill does). CI still runs the full gate set.
- **Sandbox:** GitHub, the local proxy port, and `pnpm install` need network/IPC; run these commands with the sandbox disabled.
- **Never run `pnpm install` while the DSH host is running.** The host holds `node-pty`'s native module open, and pnpm then aborts with `[ERR_PNPM_EPERM] … rename '…node-pty_tmp_…' -> '…node-pty'`, leaving `node_modules` half-linked. Every harness command fails afterwards with `subprocess-local: Windows Job runner exited with exit code 1 before proving its managed range empty` (the child cannot load `tsx`/`koffi`). Recovery: stop the Web host, run `pnpm install` from a plain PowerShell window with the proxy exported, restart the host.
- **Interrupted `pnpm install` is unrecoverable from inside the harness:** with `node_modules` broken the harness cannot spawn anything, so it cannot run `pnpm install` itself. Ask the user to run the install externally.

## 1. Stash or commit local work first

Never merge onto a dirty tree. Ask the user whether to commit or stash; default to committing so the merge stays traceable and reversible. Commit with `--no-verify` (see step 0) after a manual typecheck of the changed package.

## 1a. Keep the fork's source tree upstream-identical

The fork ships exactly two differences from upstream: the Tauri launcher (`apps/web/launcher/`) and this skill. Every other product feature lives in an external plugin under `E:\Project\DSH-Data\plugins`, so upstream merges never conflict.

Before merging, move any fork-only product code out of the repository:

```sh
git diff --name-only upstream/master...master   # every fork difference
git checkout upstream/master -- <upstream-shared paths>   # restore upstream content
git rm -- <fork-only paths>                            # delete files upstream does not have
```

The tree is upstream-identical when this prints nothing:

```sh
git diff --name-only upstream/master | grep -v '^apps/web/launcher/' | grep -v '^\.agents/skills/dsh-sync-fork/'
```

A feature that a plugin cannot reach on its own has no home in the repository either: session deletion needs `SessionPersistence.delete()` and `WorkspaceRegistry.deleteSession()`, and the harness exposes neither to a plugin. Upstream owns that surface, so the fork drops the feature rather than patching upstream for it.

## 1b. Wire an external plugin into the profile

A plugin outside the repository is a profile bundle. Three steps, no package install (the running host locks `node-pty`, so `pnpm install` would fail — step 0):

```sh
# 1. Link the package into the profile's node_modules (Windows junction)
New-Item -ItemType Junction -Path "$env:DSH_HOME\profiles\web\node_modules\@scope\dsh-plugin" `
  -Target "E:\Project\DSH-Data\plugins\dsh-plugin"
# 2. Declare it in the profile manifest: "dsh".profile.bundles += "@scope/dsh-plugin"
#    and "dependencies" += { "@scope/dsh-plugin": "link:E:/…/dsh-plugin" }
```

Package manifest shape: `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web", "immediately": true, "inject": [...] } }`; the patch file inserts the host entry (`- insert: [{ id, name }]`). The client half bundles to `window.__ModuleLoader__.load({ id, factory: function (require) {…} })` (esbuild, `react` external) and reaches the host through the harness `webServer` service: `ctx.inject(['webServer'], scope => scope.effect(() => scope.webServer.register({ kind: 'prefix', path, handler })))`.

The launcher resolves the recorded data home before the harness does: `apps/web/launcher/src-tauri/src/data_home.rs` reads `~/.dsh/.data-location` and exports `DSH_HOME` to the spawned `pnpm dsh web`, and removes the directory recorded in `~/.dsh/.data-cleanup` once the pointer confirms the move.

## 2. Fetch and assess divergence

```sh
git -c http.proxy="$PROXY" fetch upstream
git rev-list --left-right --count master...upstream/master   # left=fork-only, right=upstream-only
git log --oneline upstream/master..master                     # the fork-only commits at risk of conflict
```

## 3. Merge and resolve conflicts

```sh
git merge upstream/master --no-edit
git diff --name-only --diff-filter=U    # the conflicted files
```

Resolve each by intent, not by picking a side blindly. Recurring hotspots and their rule:

- **Signature vs. body edits (`apps/cli/src/bin.ts`):** take upstream's new parameters, keep the fork's added statements. The merged body already references upstream's params.
- **`ui-model-selection` (`ModelSelect.tsx`):** the fork adds a persistent "add custom model" entry (`addEntryRef`, `IconPlusOutlineRegular`, `openAddModel`); upstream reworks search/roving focus. Union the icon imports. Prefer the fork's **named** root-cell refs (`modelCellRef`/`effortCellRef`) over upstream's `itemRefs[0/1]` — the add-entry occupies roving slot 0, so index math is wrong. Keep upstream's extra effects and `showSearch` deps.
- **`ui-model-selection` tests:** the add-entry label "添加自定义模型" matches `/模型/`. Anchor every model-drill `menuitem` query to `/^模型/` so it does not collide (getMultipleElementsFoundError is this bug).
- **Locale dictionaries (`*/locales.ts`):** keep the fork's new keys AND take upstream's changed values for shared keys; keep zh and en in lockstep.
- **Bilingual READMEs + `README.i18n.yaml`:** merge the prose (do not drop the fork's feature sentences), then REGENERATE the pairing hashes (step 5) — never hand-edit the hashes.
- **`pnpm-lock.yaml`:** do not hand-merge. `git checkout --theirs pnpm-lock.yaml`, then reconcile in step 4.
- **Reverted fork packages:** a file that step 1a restored to upstream can still appear as a conflict. Take upstream's version outright (`git checkout --ours` is wrong here — after a revert the "ours" side is the upstream content) and confirm `git diff upstream/master --stat` lists only the launcher and this skill.

## 4. Reconcile the lockfile with the merged manifests

After taking upstream's `pnpm-lock.yaml`, the merged workspace `package.json`s may add importer links the lockfile lacks (fork-only cross-package deps).

```sh
pnpm install --lockfile-only   # rewrites the lock to match merged manifests
pnpm install                   # full install: LINKS new upstream workspace packages into node_modules
```

The full install is required, not optional: a new upstream package (e.g. a new `ui-settings-*` plugin) that is unlinked makes client tests fail with `client-test-runtime: cannot resolve plugin package …`. That error means "run a full install", not "the merge is wrong".

## 5. Regenerate bilingual pairing records

For each README whose prose you merged:

```sh
npx tsx scripts/verify-translation-pairing.ts --write <path/to/README.md>
npx tsx scripts/verify-translation-pairing.ts <path/to/README.md>   # validate
```

## 6. Verify the surfaces the merge touched

Match evidence to what changed; do not run the whole repo suite (CI owns that). For each conflicted or fork-adjacent package:

```sh
./node_modules/.bin/tsc -p <pkg>/tsconfig.json --noEmit       # types
./node_modules/.bin/vitest run <pkg-or-spec>                  # behavior
```

Fix any failure before committing — a merged test must describe the merged behavior. Anchoring test queries (step 3) is legitimate test maintenance; explain it in the commit.

## 7. Commit the merge

```sh
git status --short --branch          # confirm no unmerged paths, tree otherwise staged
git commit --no-verify --no-edit -m "Merge upstream/master into master

<one line per non-trivial conflict resolution>"
```

Confirm `master` is `0` behind upstream (`git rev-list --left-right --count master...upstream/master` → right side `0`). Do NOT push unless the user asks; pushing to `master` needs explicit confirmation.

## 8. Post-merge summary (REQUIRED)

After the merge is complete and pushed, ALWAYS provide a structured summary in the final response:

### Fork-only commits analysis
List the fork-only commits by category with counts and purposes:

```sh
git log --oneline upstream/master..master | ForEach-Object { $commit = $_ -split ' ', 2; "$($commit[0]) | $($commit[1])" }
```

Group by pattern:
- **Launcher features** (`web-launcher`, `apps/web/launcher`): Tauri GUI, tray app, packaging, UI polish
- **Client features** (`ui-*`, `packages/client`): model selection, chat enhancements, settings
- **Session/Workspace**: data directory, session deletion, persistence fixes
- **Build/Scripts**: verification scripts, toolchain support
- **Documentation**: release notes, READMEs, i18n

State which of those groups now live in an external plugin under `E:\Project\DSH-Data\plugins` instead of the repository, and which were dropped because no plugin can reach the upstream surface they need.

### Upstream changes summary
Summarize what the upstream brought (from `git log upstream/master --oneline` since last sync):
- Major version bumps and breaking changes
- New features or capabilities
- Architecture changes
- Package renames or moves

### Conflict resolution log
For each conflicted file, record:
- **File path**
- **Fork intent**: what the fork was trying to do
- **Upstream intent**: what upstream changed
- **Resolution**: how you merged them (union, prefer-fork, prefer-upstream, custom)
- **Rationale**: why this resolution preserves both intents

### Verification results
- Typecheck status (all gates pass/fail)
- Any manual checks run
- Known issues or follow-ups

## 9. Update this skill with new learnings

After completing a sync, if you encountered new conflict patterns, hot spots, or gotchas not covered above, ADD them to the relevant section:

- New conflict file patterns → add to step 3 (Merge and resolve conflicts)
- New package-specific rules → add to step 3 hotspots
- New verification requirements → add to step 6
- New proxy/toolchain issues → add to step 0

Keep entries concise: one line per pattern, with the exact command or file path.

## Attribution

End the commit message with the `Co-Authored-By:` line the session's active attribution reminder specifies.

