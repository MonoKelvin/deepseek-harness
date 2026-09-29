# dsh-web-launcher

A standalone Tauri desktop application for managing the DeepSeek Harness web development server (`dsh web`) — install, build, start, stop, and restart — from a minimal GUI. Built with pnpm + Vite/React + Tauri + Rust.

## Why

Unlike the installed or desktop editions which launch with a double-click, the web version (`dsh web`) requires starting from the command line. This launcher provides a GUI wrapper so developers can manage the web server lifecycle without touching the terminal.

## Features

- **One-click lifecycle management**: Install dependencies, build frontend, start, stop, and restart the `dsh web` server.
- **Real-time status**: Live status display showing whether the server is running, the port, URL, and PID. If the server was started externally (e.g., from a CLI terminal), the launcher auto-detects it via port polling.
- **Web-based logging**: Console output from the server process is captured and displayed in a log viewer within the UI.
- **Lightweight**: Uses Tauri's built-in WebView2 on Windows — no separate browser process. Memory footprint stays low.
- **Portable**: Ships as a single-file executable. If the single-file build is unavailable on the build host, an Inno Setup installer is used as a fallback.

## Requirements

- [Node.js](https://nodejs.org/) `^22.19` or `>=24`
- [pnpm](https://pnpm.io/) `11.7.0`
- [Rust](https://www.rust-lang.org/) toolchain (for the Tauri backend)
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually pre-installed on Windows 10+)

## Development

```sh
# From the repository root, install the launcher's own dependencies
pnpm --filter @deepseek-ai/dsh-web-launcher install

# Start the development server (hot-reloads the frontend + Rust backend)
pnpm --filter @deepseek-ai/dsh-web-launcher tauri dev

# Build for production
pnpm --filter @deepseek-ai/dsh-web-launcher tauri build
```

See [`BUILD.md`](./BUILD.md) for detailed build and packaging instructions.

## Architecture

The project is fully standalone — it does not reference any workspace packages from the parent repository. It has its own `package.json`, `Cargo.toml`, and `tauri.conf.toml`.

### Directory layout

```
apps/web/launcher/
├── Cargo.toml              # Root Rust manifest
├── package.json            # Frontend manifest (pnpm)
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
├── src/                    # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   └── lib/
└── src-tauri/              # Tauri/Rust backend
    ├── Tauri.toml
    ├── Cargo.toml
    ├── icons/
    └── src/
        ├── lib.rs
        ├── main.rs
        └── process.rs
```

### Rust backend

The Rust backend manages the `dsh web` process lifecycle. Each Tauri command handler corresponds to a UI action:

| Command | Action |
|---|---|
| `install_deps` | Runs `pnpm install` at the repository root |
| `build_frontend` | Runs `pnpm --filter @deepseek-ai/dsh-web-frontend build` |
| `start_server` | Spawns `pnpm dsh web` as a child process |
| `stop_server` | Terminates the tracked child process |
| `restart_server` | Stop + start |
| `get_status` | Returns running state, port, URL, PID, and log tail (auto-detects external servers via port polling) |

See [`BUILD.md`](./BUILD.md) for build details.
