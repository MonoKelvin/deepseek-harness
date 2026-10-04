<!--
  RELEASE.md - 版本发布说明
  用 emoji 装饰，标题用图标，内容简洁
-->
<p align="center">
  <img src="public/appicon-512.png" alt="DSH Web Launcher" width="96" height="96" />
</p>

<h1 align="center">🚀 v0.2.1 发布</h1>

<p align="center">
  <b>DeepSeek Harness 本地 Web 服务器的轻量级启动器</b><br/>
  <code>One-click • Tauri 2 • Rust</code>
</p>

---

## 📦 下载

| 文件 | 说明 |
|:--|:--|
| **`dsh-web-launcher-0.2.1-portable.exe`** | 📥 单文件便携版 ‑ 直接运行，零安装 |
| **`dsh-web-launcher-0.2.1-setup.exe`** | 📦 安装版 ‑ 支持自选安装目录 |

> ⚠️ 需要 Windows 10/11 系统，已预装 Microsoft Edge **WebView2** 运行时

---

## ✨ 新增 & 改进

| 功能 | 说明 |
|:--|:--|
| 🟢 一键启动/停止 | 主按钮自动适配状态，Start → Open → Stop |
| 🔌 外部服务识别 | 支持他程序占用端口时的控制 |
| 📜 集中日志面板 | 后端、前端、IPC 三方日志合并显示 |
| ⚙️ 设置持久化 | 项目目录、端口、主题、语言、开机自启、退出停服 |
| 🖥️ 系统托盘 | 窗体最小化到托盘，右键可退出 |
| 🌏 中英双语 | 完整简中/英文界面 |

---

## 🛠️ 使用

### 便携版
```powershell
# 双击运行，或在终端
.\dsh-web-launcher-0.2.1-portable.exe
```

### 安装版
```powershell
# 双击运行安装程序
.\dsh-web-launcher-0.2.1-setup.exe
```

---

## 📖 快速上手

1. **启动** — 点击「Start」启动本地 DSH Web 服务
2. **打开** — 点击「Open」跳转到管理页面 `http://localhost:3080`
3. **停止** — 点击「Stop」结束服务并释放端口
4. **设置** — 「⚙」图标打开设置，修改端口/主题等

---

## 🐛 反馈/report

- 📧 邮箱：<mono-studio@qq.com>
- 🐱 GitHub Issues: https://github.com/MonoKelvin/deepseek-harness/issues

---

<p align="center">
  © MIT © MonoStudio · <a href="https://github.com/MonoKelvin/deepseek-harness">GitHub</a>
</p>