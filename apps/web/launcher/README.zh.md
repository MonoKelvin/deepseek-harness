# dsh web 一键启动器

[English](README.md) | 中文

独立的 Tauri GUI 应用程序，用于管理 DeepSeek Harness web 开发服务器的生命周期。

## 目录内容

- `package.json` —— Node.js 项目清单，包含 React 前端和 Tauri 构建脚本
- `src/` —— React 前端源代码
- `public/` —— 静态资源
- `src-tauri/` —— Rust/Tauri 后端源代码
- `tsconfig.json` —— TypeScript 配置
- `vite.config.ts` —— Vite 构建配置
- `tailwind.config.cjs` —— Tailwind CSS 配置

## 使用方法

该启动器提供图形化界面来管理 dsh web 服务器：

1. **安装依赖** —— 点击「安装」运行 `pnpm install`
2. **构建前端** —— 点击「构建」编译 web 前端
3. **启动服务器** —— 点击「启动」在 3080 端口启动 `pnpm dsh web`
4. **停止服务器** —— 点击「停止」终止运行中的服务器
5. **重启服务器** —— 点击「重启」重启服务器

启动器会自动检测 3080 端口是否已有服务器运行，如已运行则打开现有实例。

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建前端
pnpm run build

# 构建 Tauri 应用（需要 Rust）
pnpm tauri build
```

## 说明

- `dsh web` 默认监听 `http://127.0.0.1:3080`
- 启动器通过 Tauri 后端管理服务器进程
- 关闭应用窗口不会停止运行中的服务器