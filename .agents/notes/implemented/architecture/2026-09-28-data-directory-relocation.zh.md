# Agent Note: One-click data-directory relocation for the Web GUI

Status: implemented

[English](2026-09-28-data-directory-relocation.md) | 中文

## Problem

DeepSeek Harness 的数据树——`$DSH_HOME`：会话、设置、凭据、插件——存放在启动器解析出的位置，迁移它意味着停止 dsh、手动复制文件并设置 `DSH_HOME`。用户希望在 GUI 里一键迁移，且复制失败时不丢数据、迁移后不残留冗余副本。

## Decision

在 loopback 页面上，通用设置渲染一个**数据目录**控件：展示解析出的 `$DSH_HOME` 路径、一个打开目录位置的图标按钮、一个目标路径输入框，以及一个成功后显示重启提示的**迁移**操作。

迁移是跨重启完成的“复制—延迟删除”，而非实时移动：

1. 宿主 `SettingsController` 的 `settings.migrateDataDirectory(target)` 调用 `dsh-home-paths` 的 `migrateDataDirectory`，它把当前 `$DSH_HOME` 复制到所选目录，然后在固定的默认根目录（`~/.dsh`）写入指针文件 `.data-location` 与清理标记 `.data-cleanup`。
2. UI 显示重启提示。
3. 下次启动时 `apps/cli` 在任何代码解析 `$DSH_HOME` 之前调用 `applyDataDirectoryRedirect(process.env)`：它删除标记记录的目录、清除标记，并在 `$DSH_HOME` 未显式设置时把环境指向已记录的目录。

由启动器而非 `resolveDshHome` 处理指针：`resolveDshHome` 在许多热路径中同步调用，因此启动器只读一次指针并设置 `process.env.DSH_HOME`，保持所有既有消费者不变。显式的 `$DSH_HOME` 始终优先、绝不被覆盖。控制文件位于固定的默认根目录、绝不放在可移动的数据内部，因此数据移走后启动器仍能找到它们，删除旧数据也绝不会移除它们；当旧 home 即默认根目录时，清理会清空其内容但保留这两个控制文件。

## Seams

- `@deepseek-ai/dsh-home-paths`：`migrateDataDirectory`、`applyDataDirectoryRedirect`、`dataLocationPointerPath`、`dataCleanupMarkerPath`。控制根参数默认为默认 home；测试传入临时根，绝不触碰真实 `~/.dsh`。
- `@deepseek-ai/dsh-api-settings-controller`：现有 `settings` namespace 上的 `@Remote describeDataDirectory` / `openDataDirectory` / `migrateDataDirectory`。
- `@deepseek-ai/dsh-client-ui-settings-general`：`DataDirectoryStore` 与 `DataDirectoryRow`，仅当 `ctx.remote.$host.isLoopback` 时注册进 `settings.general.item`（order 50）。

## Alternatives considered

**让 `resolveDshHome` 直接读指针。** 拒绝：它跨众多包与热路径同步调用，逐次读文件会带来大范围的性能与行为变化、影响面很广。在启动器中只读一次并设置环境变量可保持每个消费者的契约不变。

**移动（rename）实时数据而非复制。** 拒绝：运行中的 Host 持有当前目录的打开句柄（sqlite、日志），运行期重命名或删除在 Windows 上不安全、有损坏风险。复制—重启删除是安全等价方案，且满足“剪切，无法剪切时复制”。

**持久化真正的 OS 级 `DSH_HOME` 环境变量。** 在此范围内拒绝：跨平台持久修改环境变量（注册表、shell rc）很脆弱。固定默认根目录下的指针文件可移植、无需 OS 级修改；“重启”指重启 `dsh web`。

**把指针存放在数据目录内部。** 拒绝：启动器必须在数据移走后仍能找到它，而删除旧目录会移除它。固定的默认根目录是唯一稳定锚点。

## Consequences

该迁移对复制失败是安全的：指针与标记仅在复制返回后才写入，删除延迟到下次启动，因此在存在经校验的副本之前源数据绝不被删除，重启后也只保留一份。重启前再次选择目录会移除此前暂存但未激活的目标，避免累积。

范围是 Web GUI。Desktop 自管的重启与 `$DSH_HOME`，以及 OS 级持久变量，均不在范围内。迁移与重启之间的窗口期两份副本并存；这不可避免且安全。当 Host 持有打开句柄时复制大数据树在 Windows 上可能失败（例如打开的 sqlite 文件出现 EBUSY）；此类失败以迁移错误呈现，源数据保持不变。

## Testing

`packages/util/home-paths/tests/data-directory.spec.ts` 覆盖复制、控制文件排除、暂存目标清理、嵌套拒绝、重定向、显式 home 优先、空/缺失指针，以及两种清理形态。`packages/api/settings-controller/tests/settings-controller.host.spec.ts` 覆盖 describe/open/migrate，包括无文件管理器与失败路径。`packages/client/ui-settings-general/tests/data-directory-store.client.spec.ts` 与 `data-directory-row.client.spec.tsx` 覆盖 store 与行。
