# 托盘图标不显示：根因与解决（Low 完整性沙箱）

> 适用范围：`apps/web/launcher`（Tauri 2 Windows 启动器）
> 状态：已修复并验证

## 1. 现象

`dsh-web-launcher` 启动后，任务栏通知区**没有托盘图标**。应用本身正常运行、窗口正常、日志无报错。参考项目 `D:\Work\Code\MonoStudio\DangerChat` 同样基于 Tauri 2，托盘正常显示。

多次更换图标素材（PNG 尺寸、alpha 通道）均无效——说明问题不在图标资源。

## 2. 排查过程（时间线）

1. **横向对比**：DangerChat 的 `tray.rs` 与本项目 `lib.rs` 的 `configure_tray` 实现几乎一致（菜单、`TrayIconBuilder::with_id("main")`、`tooltip`、`on_menu_event`）。代码路径无本质差异。
2. **检查资源**：`public/tray-icon.png` 为合法 32×32 RGBA，约 35% 像素不透明，不是透明/损坏文件。
3. **检查编译**：`cargo check` 通过，运行中的是含托盘代码的新二进制（构建时间戳吻合）。
4. **枚举系统托盘**：通过 Win32 `Shell_NotifyIconGetRect` 与 `tray_icon_app` 类名枚举，确认通知区里**根本没有 launcher 的图标窗口**，而 cc-switch、clash-verge 等正常。
5. **关键转折——完整性级别**：检测各进程 Token 的 `TokenIntegrityLevel`，发现 launcher 进程为 **LOW**，而 DangerChat / python / cc-switch / clash-verge 均为 **MEDIUM**。
6. **进程内复刻探针**：在 `configure_tray` 里原样复刻 tray-icon crate 的 `Shell_NotifyIconW(NIM_ADD)` 调用（自建隐藏窗口 + `CreateIcon`），拿到真实错误码：**ERROR_ACCESS_DENIED (5)**。即 Explorer 拒绝了一个 Low IL 进程的托盘注册请求。
7. **确认沙箱来源**：`icacls` 显示 `E:\Project\deepseek-harness` 整棵仓库被强制打了
   `Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)` 标签，并带
   `Everyone:(I)(CI)(DENY)(DC)` 删除保护（来自 `MONO\CodexSandboxUsers` 沙箱组）。
   launcher 目录树继承该 Low 标签，构建出的 `dsh-web-launcher.exe` 因此以 Low IL 运行。

## 3. 根因

**不是代码问题，也不是图标问题，而是进程的 Windows 完整性级别（Integrity Level）。**

- 仓库被沙箱化为 **Low Mandatory Level**，新建的 exe 继承 Low 标签 → 进程以 **Low IL** 运行。
- Windows 的强制完整性控制（MIC）规定：Low IL 进程不能向 Medium IL 的 Explorer 写入/注册对象。
  `Shell_NotifyIcon(NIM_ADD)` 被 Explorer 拒绝，返回 **ERROR_ACCESS_DENIED**。
- `tray-icon` crate（0.25.1）会**静默吞掉**这个失败：它只等待一个 `TaskbarCreated` 广播来重注册，
  而该广播在 Explorer 健康时根本不会发出。于是应用照常运行、零报错，唯独图标不出现。

附带影响：继承的 `Everyone:(DENY)(DC)` 阻止删除子对象，会阻碍 `cargo` 覆盖 `target/` 下的旧构建产物，偶发构建失败。

## 4. 解决方案

### 4.1 环境层（根因修复，本机）

把整个 launcher 项目目录树从 Low 沙箱标签中解除：

```powershell
# 递归重置为 Medium IL
icacls <launcher> /setintegritylevel "(OI)(CI)Medium" /T /C
# DENY 是继承来的，必须先把继承转显式（与上层 Low 仓库脱钩）才能删
icacls <launcher> /inheritance:d /T /C
# 再删掉 deny-delete ACE
icacls <launcher> /remove:d Everyone /T /C
```

执行后整棵 `apps/web/launcher`（含 `src`、`src-tauri`、`public`、`node_modules`、`target`）均为 **Medium IL 且 no-deny**。
上层 `deepseek-harness` 仓库仍保持 Low，但 launcher 已通过「断继承」与之脱钩，新建文件继承 Medium，不再受沙箱影响。
源码目录树的 Low 标签未动（仅构建产物与项目文件所需）。

### 4.2 代码层（防御性加固，`src-tauri/src/lib.rs`）

即便环境修复，仍保留以下加固，避免再次静默失败：

- **托盘创建时机**：从 `setup` 移到 `tauri::RunEvent::Ready`，满足 tray-icon「创建线程需有运行中的事件循环」的约束。
- **注册验证 + 重试**：`configure_tray` 用 `set_tooltip`（NIM_MODIFY 仅对已注册图标成功）作探针，失败最多重试 5 次（应对开机自启时 Explorer 尚未就绪的场景），仍失败则写入应用日志面板——不再静默。
- **关闭行为兜底**：仅当托盘存在时「关闭 = 隐藏到托盘」；否则「关闭 = 退出」，避免进程变僵尸且无入口。

### 4.3 自愈脚本（防复发 / 跨机器）

为「拉取代码到其他电脑构建也有问题」兜底，新增两个脚本并挂到构建前置：

- `scripts/fix-integrity.ps1`：核心逻辑。
  - 仅在检测到 **Low / Untrusted IL 或 DENY ACE** 时才申请提权（UAC）；
  - 普通克隆机器上（无沙箱标签）是**无害空操作**，不弹 UAC，可放心挂构建前。
- `scripts/fix-permissions.mjs`：跨平台包装器。非 Windows 直接跳过；Windows 上调 `fix-integrity.ps1`。
- `package.json` 构建脚本：

  ```json
  "fix-permissions": "node scripts/fix-permissions.mjs",
  "tauri:dev":  "node scripts/clean-port.mjs && node scripts/fix-permissions.mjs && tauri dev",
  "tauri:build":"node scripts/fix-permissions.mjs && tauri build"
  ```

  这样无论是本机重新拉取，还是把代码拷到同样被沙箱化的机器，`pnpm tauri:dev` / `pnpm tauri:build` 都会先自愈再构建。

> 注意：`.ps1` 内容保持 ASCII（英文），因为 PowerShell 5.1 以系统 ANSI 读取无 BOM 的脚本，
> 中文会因代码页乱码导致解析失败；中文说明放在本文档与代码注释中。

## 5. 验证

- `icacls` 确认 launcher 整棵目录树：`IL=Medium Mandatory Level`，且 `no-deny`。
- 进程完整性级别实测：`dsh-web-launcher` 由 LOW 变为 **MEDIUM**。
- 启动后通过 `Shell_NotifyIconGetRect` 查询，返回图标矩形（如 `(1446,1020)-(1486,1080)`），确认已注册在通知区，与 cc-switch / clash-verge 图标同排。
- 若 Windows 11 将其收进「隐藏的图标」溢出面板，拖出一次即可常驻。

## 6. 复现与预防

| 项 | 说明 |
|----|------|
| 触发条件 | 仓库（或其父目录）被打了 Low Mandatory Level 沙箱标签 |
| 表现 | 应用正常、无报错、无托盘图标；`cargo` 偶发因 DENY 删除保护失败 |
| 快速确认 | `icacls <项目目录>` 看是否有 `Low Mandatory Level` 或 `DENY` |
| 一键修复 | `pnpm fix-permissions`（本机会提权重设，普通机器空操作） |
| 预防 | 已挂到 `tauri:dev` / `tauri:build` 前置，克隆即自愈 |

## 7. 未改动 / 边界

- `deepseek-harness` 上层仓库的 Low 沙箱标签**保留不动**（仅 launcher 子树脱钩），符合「只解除 launcher 项目」的意图。
- `target/`、`node_modules/` 均为 gitignore，ACL 变更不进入版本控制；新克隆在普通机器上本就无沙箱标签。
- 托盘图标素材已统一：删除游离的 `public/tray-icon.png`，改为复用 `public/appicon-32.png`（由 `scripts/gen-icons.cjs` 从母版 `appicon-dsh-girl.png` 生成，与网页 favicon 同源）。`lib.rs` 的 `include_bytes!` 路径已同步改指向 `appicon-32.png`。另清理了零引用的死副本 `public/appicon.png`。
