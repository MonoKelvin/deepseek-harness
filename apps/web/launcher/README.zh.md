# dsh web 一键启动器

[English](README.md) | 中文

独立的 Tauri GUI 应用程序，用于管理 DeepSeek Harness web 开发服务器的生命周期。

## 目录内容

- `package.json` —— Node.js 项目清单，包含 React 前端和 Tauri 构建脚本
- `src/` —— React 前端源代码
- `public/` —— 静态资源
- `scripts/` —— 图标生成与浏览器界面检查
- `src-tauri/` —— Rust/Tauri 后端源代码
- `tsconfig.json` —— TypeScript 配置
- `vite.config.ts` —— Vite 构建配置
- `tailwind.config.cjs` —— Tailwind CSS 配置

## 使用方法

主按钮在服务未启动时显示「启动服务」，运行后显示「打开服务」。仅由本启动器管理的服务提供「停止」和「重启」。服务停止时可使用「安装依赖」和「构建页面」。

「运行日志」合并显示最近 200 条后端与前端记录，包括 IPC 失败。警告和错误保留在日志中，不使用弹窗或 toast。状态徽标内提供本地化的错误提示，无法获取状态时可在徽标内重试。日志时间显示 UTC 时分秒和毫秒，悬停提示与复制文本保留完整时间戳。复制、清空按钮与标签切换共用工具栏；清空操作同时移除前后端记录。安装和构建的输出在操作结束后显示。

「软件设置」在应用名称旁显示版本，设置名称左对齐、控件右对齐。可通过路径输入框内的按钮选择 DSH 项目根目录，也可输入路径后按 Enter 或移开焦点保存。外观和语言偏好会持久化保存。

启动器检测 3080 端口上的服务。在其他程序中启动的服务可以打开，但不能在此停止或重启。

## 开发

使用仓库支持的 Node 版本（`^22.19` 或 `>=24`），在 `apps/web/launcher` 中执行以下命令。启动器是独立的 npm 项目，不属于仓库的 pnpm 工作区。

```bash
npm install
npm run tauri:dev
npm run build
npm run tauri:build
```

Tauri 命令需要 Rust 和当前平台的原生构建工具。仅开发前端时使用 `npm run dev`；服务控制需要在 Tauri 中运行。

## 界面检查

安装仓库依赖并启动启动器前端后，运行 `npm run test:ui`。检查复用 `apps/web` 的 Playwright 依赖并模拟 Tauri 响应，不会真正执行安装、构建、启动或停止操作。Windows 使用已安装的 Microsoft Edge，其他平台需要 Playwright Chromium。可设置 `LAUNCHER_TEST_URL` 检查其他前端地址。

检查覆盖服务归属、操作反馈、重复点击、长日志、中英文布局以及背景图片跟随。截图保存在系统临时目录下的 `dsh-launcher-ui` 中。

## 说明

- `dsh web` 默认监听 `http://127.0.0.1:3080`。
- 关闭窗口会隐藏到系统托盘；通过托盘菜单退出应用。
- 半透明背景图片会轻微跟随鼠标，触屏输入或系统偏好减少动画时保持静止。
