# dsh web 一键启动器

[English](README.md) | 中文

双击 `dsh-web.lnk`（或右键 → “固定到任务栏”）即可启动 DeepSeek Harness 的 Web 界面（`pnpm dsh web`），服务就绪后会自动打开默认浏览器。

## 目录内容

- `launch.bat` — 启动脚本。自动切到仓库根目录、按需安装依赖与构建前端、检测端口（默认 `3080`）、启动 `pnpm dsh web`。
- `dsh-web.ico` — 任务栏 / 快捷方式图标（圆角矩形背景）。
- `create-shortcut.ps1` — 在本机重建 `dsh-web.lnk` 快捷方式（因 `.lnk` 含绝对路径，换电脑后需重跑本脚本）。
- `dsh-web.lnk` — 生成的快捷方式，**已加入 `.gitignore`，不进入版本控制**。

## 使用

1. 直接双击 `dsh-web.lnk`。
2. 固定到任务栏：右键 `dsh-web.lnk` → “固定到任务栏”。

## 换电脑 / 路径变化后

仓库不保存 `.lnk`（绝对路径依赖本机）。在新的机器上：

- 进入本目录，右键 `create-shortcut.ps1` → “使用 PowerShell 运行”，即会按当前路径重新生成 `dsh-web.lnk`。

## 说明

- `dsh web` 默认监听 `http://127.0.0.1:3080`，启动就绪后自动打开浏览器；关闭启动窗口即停止服务。
- 若端口已被占用，启动器会直接打开已有页面而不会重复启动。
