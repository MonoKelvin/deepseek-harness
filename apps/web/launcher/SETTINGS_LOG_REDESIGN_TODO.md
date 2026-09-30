# DSH 启动器设置界面 / 日志改造 — 未完成工作交接

> 状态：**进行中（未完成）**。代码已大量改动，但存在编译/类型错误，尚未验证运行。
> 本文档用于跨会话继续。**全部完成后请删除本文档。**

## 一、任务目标（用户原始需求）

1. **设置界面改为左右布局的 key-value 形式**：左侧标题文字（部分带副标题说明），右侧设置控件。
2. **外观、语言切换控件高度太大** — 改为与「运行日志/软件设置」标签同样的紧凑样式。
3. **简介放到最上面**：软件图标 + 更清楚的软件介绍。
4. **版本放最上面**，之后是作者、仓库地址。
5. **新增 DSH 目录设置**（重点）：
   - 软件启动时自动识别 dsh 安装目录 / 源码目录
   - 支持用户手动指定（输入框内部右侧提供图标按钮，点击后选择路径）
   - 识别错误或指定错误 → 软件相关功能全部置灰（启动、构建等）
   - 右上角「未启动」右侧加「请指定DSH目录」链接文字，点击跳转到 DSH 目录设置项
   - 控制台输出对应日志
6. **日志改造**：
   - 输出时间、日志类型（警告/错误/调试/信息），不同颜色区分
   - 信息、操作日志普通颜色；警告橙黄；调试草绿；错误朱砂
   - 日志页面右上角提供「清空」「复制」图标并实现功能
   - 日志信息支持中英文翻译
   - 参考格式：`2026-09-30 14:00:54.123 [错误] 运行错误：无法识别系统中的DSH目录或指定无效的DSH目录，软件无法正常运行`

## 二、已完成的部分

### Rust 后端 (`src-tauri/src/`)

**新增 `state.rs`**：
- `AppSettings { dsh_directory: Option<String>, theme: String, locale: String }`
- `SharedSettings = Arc<Mutex<AppSettings>>`
- `load_settings()` / `save_settings()` — 持久化到 `%APPDATA%/deepseek-harness-launcher/settings.json`
- `detect_dsh_directory()` — 从 exe 路径向上 4 层 + CWD + `~/code/deepseek-harness` 查找
- `is_valid_dsh_root(dir)` — 校验含 `pnpm-workspace.yaml` 且含 `apps/cli` 目录
- `resolve_dsh_root(settings)` — 优先用户指定，否则自动检测

**修改 `process.rs`**：
- `LogEntry` 增加 `severity: LogSeverity` 和 `timestamp: String` 字段
- 新增 `LogSeverity { Info, Warn, Error, Debug }` 枚举
- `append_log(logs, source, severity, message)` — 新增 severity 参数
- `now_timestamp()` — 用 chrono 生成 `YYYY-MM-DD HH:MM:SS.mmm`
- 新增 `clear_logs(logs)`
- `repo_root_from_settings(settings)` — 用配置的 DSH 目录
- `run_pnpm(args, logs, settings)` / `start_dsh_web(manager, settings)` — 增加 settings 参数
- stderr 流自动标记为 `Warn`，读取失败标记为 `Error`
- 测试已更新（增加了 severity 断言）

**修改 `lib.rs`**：
- `AppState` 增加 `settings: SharedSettings`
- 新增命令：`get_settings`、`set_dsh_directory`、`set_theme`、`set_locale`、`clear_logs`、`open_directory_picker`
- `AppState::run()` 中加载 settings、自动检测 DSH 目录并写日志
- `get_status` 在 DSH 目录无效时设置 `error = "DSH directory not configured"`

**修改 `Cargo.toml`**：增加 `chrono = { version = "0.4", features = ["clock"] }`

### 前端 (`src/`)

- `types/server-status.ts`：`LogEntry` 增加 `severity`/`timestamp`；新增 `LogLevel`、`AppSettings` 类型
- `types/index.ts`：导出新类型
- `lib/tauri-api.ts`：新增 `getSettings`、`setDshDirectory`、`setTheme`、`setLocale`、`clearLogs`、`openDirectoryPicker`
- `lib/TablerIcon.tsx`：新增 `copy`、`folder`、`trash` 图标
- `components/ui/button.tsx`：新增 `tab-sm` variant（紧凑标签按钮）
- `components/SettingsPanel.tsx`：**已重写**为 key-value 布局（`.setting-row` grid），含 DSH 目录输入框 + 文件夹图标按钮、紧凑主题/语言选择、顶部图标+简介、底部版本/作者/GitHub
- `components/LogViewer.tsx`：**已重写**，含 `.log-toolbar`（清空/复制按钮）+ 时间戳 + 级别标签 + 颜色
- `components/ServerStatus.tsx`：新增 `dshDirectoryValid` 和 `onNavigateToSettings` props，「请指定DSH目录」链接
- `components/ControlPanel.tsx`：新增 `dshDirectoryValid` prop，无效时禁用所有操作
- `App.tsx`：**已重写**，接入 settings 状态、DSH 目录校验、清空/复制日志、locale 切换
- `i18n/locales/zh.ts` / `en.ts`：新增 `app.description`、`status.dshMissing`、`log.clear`、`log.copy`、`log.level.*`、`settings.dshDirectory*` 等键
- `index.css`：新增 `.log-toolbar`、`.log-viewer`、`.log-line`、`.log-timestamp`、`.log-level-*`、`.settings-header`、`.settings-fields`、`.setting-row`、`.setting-label`、`.setting-control`、`.setting-input`、`.compact-choice`、`.dsh-missing` 等样式

## 三、剩余问题 / 待办

### 必须修复（阻塞编译/运行）

1. **`open_directory_picker` 的 Tauri dialog API 可能不存在**
   - 文件：`src-tauri/src/lib.rs:70-81`
   - 当前用了 `tauri::api::dialog::FileDialogBuilder`，这是 **Tauri 1.x** 的 API。
   - Tauri 2.x 需要 `tauri-plugin-dialog` crate，或改用其他方式。
   - **候选方案**：
     - (a) 添加 `tauri-plugin-dialog` 依赖并在 builder 中 `.plugin(tauri_plugin_dialog::init())`，前端用 `@tauri-apps/plugin-dialog` 的 `open({ directory: true })`。
     - (b) 用 Windows 原生 `IFileOpenDialog`（参考仓库内已有实现：`packages/host/directory-picker-native/`，含 `win32-dialog-logic.ts` 和 `win32-dialog-bindings.ts`）。
     - (c) 简化为纯文本输入（去掉文件夹按钮），先跑通再补。
   - 注：`@tauri-apps/api` 2.12.0 **没有** `dialog` 子模块（已确认 index.d.ts 只导出 app/core/dpi/event/image/menu/mocks/path/tray/webview/webviewWindow/window）。

2. **Rust 未编译验证** — 需运行 `cd src-tauri && cargo check` 修复所有编译错误。

3. **前端类型检查未通过** — 运行 `cd apps/web/launcher && npx tsc --noEmit`，之前已知错误：
   - `ServerStatus.tsx` 的 `onNavigateToSettings` 未解构（**已修复**）
   - `en.ts` 缺少 `import { zh } from './zh'`（**已修复**）
   - `tauri-api.ts` 的 `@tauri-apps/api/dialog` 不存在（**已改为 invoke**，待验证）

### 功能待完善

4. **DSH 目录有效性判断逻辑不严谨**
   - `App.tsx` 中 `dshDirectoryValid = !!(settings?.dshDirectory) && !status?.error`
   - 更合理：后端 `get_status` 应返回一个明确的 `dshDirectoryValid: bool` 字段，而不是靠 `error` 字符串推断。

5. **「请指定DSH目录」链接点击跳转到设置项**
   - 当前只做了 `setTab('settings')`，未滚动/高亮到 DSH 目录设置项。用户要求「点击后跳转到DSH目录设置项提示用户指定」。

6. **DSH 目录无效时的日志输出**
   - 后端 `run()` 里已写「自动检测」日志，但用户要求的格式是：
     `2026-09-30 14:00:54.123 [错误] 运行错误：无法识别系统中的DSH目录或指定无效的DSH目录，软件无法正常运行`
   - 需要确保用户在设置里指定无效目录时也输出对应错误日志。

7. **日志中英文翻译**
   - 当前后端日志是硬编码英文（如 `Command succeeded: xxx`、`Failed to read xxx`）。
   - 用户要求「日志信息尽量也要支持中英文翻译（可以单独一个日志分组翻译）」。
   - 需设计：后端返回日志 key + 参数，前端按 locale 翻译；或在后端加消息类型枚举。

8. **`chrono` 依赖未确认能正常拉取**（离线/锁文件问题）。

9. **`clear_logs` 后前端刷新** — `handleClearLogs` 调 `refresh()`，但 `useServerStatus` 轮询间隔 2s，立即刷新 OK，待验证。

10. **UI 测试需更新** — `scripts/ui.test.mjs` 中多处断言基于旧 DOM/文案，会失败：
    - `.settings-options` 选择器已不存在
    - 主题/语言按钮文案与层级变了
    - `[data-log-id]` 结构变了（现在是 `.log-line` 内含子 span）
    - mock 的 `invoke` 未处理新命令 `get_settings`、`clear_logs`、`open_directory_picker` → 需在 `pageFor` 的 initScript 里补充 mock 返回值，否则 `getSettings()` 会 reject。

## 四、关键文件清单

| 文件 | 状态 |
|---|---|
| `src-tauri/src/state.rs` | 新增，基本完成 |
| `src-tauri/src/process.rs` | 已改，需 cargo check |
| `src-tauri/src/lib.rs` | 已改，dialog API 待定，需 cargo check |
| `src-tauri/Cargo.toml` | 已加 chrono |
| `src/types/server-status.ts` | 完成 |
| `src/lib/tauri-api.ts` | 完成（dialog 已改 invoke） |
| `src/components/SettingsPanel.tsx` | 已重写 |
| `src/components/LogViewer.tsx` | 已重写 |
| `src/components/ServerStatus.tsx` | 已改 |
| `src/components/ControlPanel.tsx` | 已改 |
| `src/components/ui/button.tsx` | 已加 tab-sm |
| `src/App.tsx` | 已重写 |
| `src/i18n/locales/{zh,en}.ts` | 已加键 |
| `src/index.css` | 已加样式 |
| `scripts/ui.test.mjs` | **未更新** |

## 五、验证方式

1. `cd apps/web/launcher && npx tsc --noEmit` — 前端类型检查
2. `cd apps/web/launcher/src-tauri && cargo check` — Rust 编译检查
3. `cd apps/web/launcher && npm run tauri:dev` — 启动应用手测：
   - 设置页 key-value 布局、紧凑切换控件
   - 顶部图标+简介+版本，底部作者+GitHub
   - DSH 目录输入 + 文件夹按钮选目录
   - 无效目录 → 操作置灰 + 「请指定DSH目录」链接 + 错误日志
   - 日志时间戳/[级别]/颜色、清空、复制
4. `cd apps/web/launcher && npm run test:ui` — UI 测试（**需先更新**）

## 六、注意事项

- 前端不走 pnpm workspace，独立用 npm：`apps/web/launcher` 自己一套 `node_modules`。
- `@/` 别名指向 `src/`。
- 关闭窗口是隐藏到托盘，不是退出。
- 本次改动**尚未提交推送**（见下方 git 提示）—— 若你看到本文档时改动仍未提交，请先 `git status` 确认。

---

**✅ 全部完成后请删除本文档。**
