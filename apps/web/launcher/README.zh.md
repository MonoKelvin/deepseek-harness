<p align="center">
  <img src="public/appicon-512.png" alt="DSH Web 启动器" width="112" height="112" />
</p>

<h1 align="center">DSH Web 启动器</h1>

<p align="center">
  一个小巧的桌面应用，一键启动、停止并监控本地的
  <b>DeepSeek&nbsp;Harness</b> web 服务 —— 无需终端。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/平台-Windows-0078D6?logo=windows&logoColor=white" alt="平台：Windows" />
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Rust-stable-000000?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/版本-0.1.0-blue" alt="版本 0.1.0" />
  <img src="https://img.shields.io/badge/许可证-MIT-green" alt="许可证：MIT" />
</p>

<p align="center">
  <a href="README.md">English</a> · <b>中文</b>
</p>

---

## 📖 这是什么？

`dsh web` 是 DeepSeek Harness 的本地 web 服务，通常需要在终端里执行
`pnpm dsh web` 启动。**DSH Web 启动器**把它装进一个小小的桌面窗口，让你无需命令行
就能管理服务、安装依赖、构建前端。

## ✨ 功能特性

- 🟢 **一键生命周期** —— 主按钮随状态变化（启动 → 打开 → 重启 / 停止）；服务停止时
  可使用安装与构建。
- 🔌 **感知外部服务** —— 端口 `3080` 上由其他程序启动的服务，同样可以打开、重启或停止
  （标注为「外部启动」）。
- 📜 **合并实时日志** —— 后端、前端与 IPC 消息汇入同一视图，随产生即时显示；警告和错误
  只留在日志里（不弹窗、不 toast），复制与清空位于工具栏。
- ⚙️ **持久化设置** —— 项目目录、主题、语言、开机自启（默认关闭）、退出时停止服务
  （默认开启，仅停止由本启动器启动的服务）。
- 🖥️ **系统托盘** —— 关闭窗口会隐藏到托盘，从托盘菜单退出。
- 🌏 **双语界面** —— 简体中文与 English。

## 🏗️ 技术架构

一个轻量的 **Rust 内核**（基于 [Tauri 2](https://tauri.app)）负责管理服务进程与设置，**React + TypeScript** 前端负责渲染窗口，并通过 Tauri 的类型化 IPC 与内核通信；前端构建与样式由 Vite 和 Tailwind CSS 处理。

## 📂 目录结构

```text
apps/web/launcher/
├─ src/                    React 前端
│  ├─ components/          界面：状态徽标、控制面板、日志视图、设置面板
│  ├─ hooks/               服务状态轮询、日志流、主题
│  ├─ i18n/                中 / 英 文案字典
│  └─ lib/tauri-api.ts     对 Rust IPC 命令的类型化封装
├─ src-tauri/              Rust 后端（Tauri 2）
│  ├─ src/lib.rs           应用初始化、托盘、窗口、IPC 命令处理
│  ├─ src/process.rs       dsh-web 生命周期 + 进程树终止
│  ├─ src/state.rs         设置读写、后端日志文案（i18n）
│  ├─ bundle/*.iss         Inno Setup 安装包脚本
│  └─ Tauri.toml           窗口、打包与安全配置
├─ scripts/                打包、图标生成、UI 测试、维护脚本
├─ public/                 应用图标与图片
├─ docs/                   打包指南与深入说明
└─ package.json            脚本与依赖
```

## 🚀 快速开始

> 所有命令都在 `apps/web/launcher` 目录内执行。这是一个**独立的 npm 项目**，
> 不属于仓库的 pnpm 工作区。

### 1. 环境要求

- **Node.js** `^22.19` 或 `>=24`
- **Rust**（stable）及平台构建工具（Windows 需 MSVC）—— Tauri 必需
- **pnpm** 已加入 `PATH` —— 被管理的服务通过 `pnpm dsh web` 启动
- **Windows**，并安装 Microsoft Edge **WebView2** 运行时（Win 10/11 自带）

### 2. 安装与运行

```bash
npm install          # 安装前端依赖
npm run tauri:dev    # 启动完整应用（热重载）
```

### 3. 构建

```bash
npm run tauri:build  # 编译 release 版本（并生成 Tauri 的 MSI）
```

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 仅在浏览器中运行前端（无法控制服务） |
| `npm run tauri:dev` | 热重载的完整桌面应用 |
| `npm run tauri:build` | release 构建 + Tauri MSI 安装包 |
| `npm run package` | 免安装 exe **和** Inno Setup 安装包（Windows） |
| `npm run test:ui` | Playwright 界面检查 |
| `npm run clean:port` | 释放被占用的开发端口 `5173` |

## 📦 打包发布（Windows）

一条命令即可生成两种交付物到 `release/`：

```bash
npm run package            # 构建一次，随后同时生成两种包
npm run package:portable   # 仅生成免安装单文件 exe
npm run package:installer  # 仅生成 Inno Setup 安装包
```

| 交付物 | 说明 |
| --- | --- |
| **免安装 exe** | 即 Tauri 二进制本身 —— 前端与图标已嵌入，可直接运行：无需安装、无需解压、不释放文件夹。只依赖系统 WebView2 运行时。 |
| **Inno Setup 安装包** | 封装同一个 exe，允许用户选择安装目录，按用户安装、不需要提权。需要 Inno Setup 编译器（`winget install JRSoftware.InnoSetup`）。 |

👉 体积调优、选项与 WebView2 要求详见 **[docs/packaging.md](docs/packaging.md)**。

## 🧪 测试

启动启动器前端后，运行界面检查：

```bash
npm run test:ui
```

- 复用 `apps/web` 的 Playwright 依赖，并**模拟** Tauri 响应 —— 不会真正执行
  安装 / 构建 / 启动 / 停止操作。
- Windows 使用已安装的 Microsoft Edge，其他平台需要 Playwright Chromium。
- 可设置 `LAUNCHER_TEST_URL` 指向其他前端地址。
- 截图保存在系统临时目录下的 `dsh-launcher-ui` 中。

## 💡 说明与常见问题

- **端口** —— `dsh web` 默认监听 `http://127.0.0.1:3080`。
- **需要 pnpm** —— 服务与依赖操作在 DSH 项目根目录下执行 `pnpm`，因此必须安装 pnpm
  并可通过 `PATH` 找到。

## 📄 许可证

[MIT](https://opensource.org/licenses/MIT) © MonoStudio
