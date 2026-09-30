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

The Logs tab combines the latest 200 backend and frontend entries, including IPC failures. Warnings and errors stay in the log rather than opening dialogs or toasts. The status badge contains a localized error tooltip; an unavailable status can be retried there. Log timestamps show UTC time to milliseconds, with the full timestamp in the tooltip and copied text. Copy and Clear share the tab toolbar; clearing removes both frontend and backend entries. Install and build output arrives after the operation finishes.

App settings shows the version beside the application name, with left-aligned labels and right-aligned controls. Choose the DSH project root using the button inside the path input, or type a path and save it with Enter or by leaving the field. Appearance and language preferences are persisted.

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
