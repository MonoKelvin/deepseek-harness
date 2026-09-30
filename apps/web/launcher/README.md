# dsh web one-click launcher

English | [中文](README.zh.md)

A standalone Tauri GUI application for managing the DeepSeek Harness web development server lifecycle.

## Directory contents

- `package.json` — Node.js project manifest with React frontend and Tauri build scripts
- `src/` — React frontend source code
- `public/` — Static assets
- `scripts/` — Icon generation and browser UI checks
- `src-tauri/` — Rust/Tauri backend source code
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `tailwind.config.cjs` — Tailwind CSS configuration

## Usage

The main button starts a stopped service or opens a running service. Stop and Restart are available only for a service managed by this launcher. Install dependencies and Build pages are available while the service is stopped.

Activity shows the latest operation result, including failures and successful operations without output. Install and build output arrives after the operation finishes. Server logs shows the latest server log snapshot without duplicating lines on each refresh.

The launcher detects listeners on port 3080. A service started outside the launcher can be opened, but cannot be stopped or restarted here.

## Development

Run these commands in `apps/web/launcher` using a repository-supported Node version (`^22.19` or `>=24`). This standalone npm project is not a member of the repository's pnpm workspace.

```bash
npm install
npm run tauri:dev
npm run build
npm run tauri:build
```

Tauri commands require Rust and the platform's native build tools. For frontend-only development, use `npm run dev`; server controls require Tauri.

## UI checks

With the repository's dependencies installed and the launcher frontend running, run `npm run test:ui`. The checks reuse `apps/web`'s Playwright dependency and simulate Tauri responses; they do not execute real install, build, start, or stop operations. Windows uses installed Microsoft Edge; other platforms require Playwright Chromium. Set `LAUNCHER_TEST_URL` to test a different frontend URL.

Checks cover service ownership, operation feedback, repeated clicks, long logs, Chinese/English layouts, and background pointer motion. Screenshots are written to the system temporary directory under `dsh-launcher-ui`.

## Notes

- `dsh web` listens on `http://127.0.0.1:3080` by default.
- Closing the window hides it to the system tray; use the tray menu to exit.
- The translucent background artwork responds subtly to mouse movement, but stays still for touch input or reduced-motion preferences.
