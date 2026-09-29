# dsh web one-click launcher

English | [中文](README.zh.md)

A standalone Tauri GUI application for managing the DeepSeek Harness web development server lifecycle.

## Directory contents

- `package.json` — Node.js project manifest with React frontend and Tauri build scripts
- `src/` — React frontend source code
- `public/` — Static assets
- `src-tauri/` — Rust/Tauri backend source code
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `tailwind.config.cjs` — Tailwind CSS configuration

## Usage

This launcher provides a graphical interface to manage the dsh web server:

1. **Install dependencies** — Click "Install" to run `pnpm install`
2. **Build frontend** — Click "Build" to compile the web frontend
3. **Start server** — Click "Start" to launch `pnpm dsh web` on port 3080
4. **Stop server** — Click "Stop" to terminate the running server
5. **Restart server** — Click "Restart" to restart the server

The application automatically detects if a server is already running on port 3080 and opens the existing instance.

## Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build frontend
pnpm run build

# Build Tauri app (requires Rust)
pnpm tauri build
```

## Notes

- `dsh web` listens on `http://127.0.0.1:3080` by default
- The launcher manages server processes through the Tauri backend
- Closing the app window does not stop the running server