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

## 1. Stash or commit local work first

Never merge onto a dirty tree. Ask the user whether to commit or stash; default to committing so the merge stays traceable and reversible. Commit with `--no-verify` (see step 0) after a manual typecheck of the changed package.

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

## Attribution

End the commit message with the `Co-Authored-By:` line the session's active attribution reminder specifies.

