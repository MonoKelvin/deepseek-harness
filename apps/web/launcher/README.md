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

The main button starts a stopped service or opens a running service. A running service shows Restart and Stop as icon buttons on the right, whether this launcher or another program started it. Install dependencies and Build pages are available while the service is stopped.

The Logs tab combines the latest 200 backend and frontend entries, including IPC failures. Warnings and errors stay in the log rather than opening dialogs or toasts. The status badge contains a localized error tooltip; an unavailable status can be retried there. Log timestamps show UTC time to milliseconds, with the full timestamp in the tooltip and copied text. Entries appear as they are produced, and installing, building, starting, and stopping all stream into the same view. Copy and Clear share the tab toolbar; clearing removes both frontend and backend entries immediately.

App settings shows the version beside the application name, with left-aligned labels and right-aligned controls. Choose the DSH project root using the button inside the path input, or type a path and save it with Enter or by leaving the field. Appearance and language preferences are persisted. Launch at startup writes or removes the operating system's sign-in entry and is off until switched on; a sign-in launch stays in the system tray instead of opening the window.

The launcher detects listeners on port 3080. A service another program started can be opened, restarted, or stopped like one this launcher started; stopping it terminates the process holding the port. The status badge marks such a service as already running (external).

Open DSH and the GitHub link in App settings open in the default browser. A launcher running elevated hands the link to Explorer, so the browser starts without elevated rights and does not refuse the request.

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

Checks cover service ownership, external-service controls, operation feedback, repeated clicks, long logs, Chinese/English layouts, and background pointer motion. Screenshots are written to the system temporary directory under `dsh-launcher-ui`.

## Notes

- `dsh web` listens on `http://127.0.0.1:3080` by default.
- Service and dependency operations run `pnpm` in the DSH project root, so pnpm must be installed and reachable on `PATH`.
- Closing the window hides it to the system tray; use the tray menu to exit.
- The translucent background artwork responds subtly to mouse movement, but stays still for touch input or reduced-motion preferences.
