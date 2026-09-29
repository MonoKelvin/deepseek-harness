# dsh web one-click launcher

English | [中文](README.zh.md)

Double-click `dsh-web.lnk` (or right-click → "Pin to taskbar") to start the DeepSeek Harness Web interface (`pnpm dsh web`); the default browser opens once the server is ready.

## Directory contents

- `launch.bat` — launch script. Switches to the repository root, installs dependencies and builds the frontend as needed, detects the port (default `3080`), and starts `pnpm dsh web`.
- `dsh-web.ico` — taskbar / shortcut icon (rounded-rectangle background).
- `create-shortcut.ps1` — rebuilds the `dsh-web.lnk` shortcut on this machine (the `.lnk` holds absolute paths, so rerun this script on another computer).
- `dsh-web.lnk` — the generated shortcut, **already in `.gitignore` and never committed**.

## Usage

1. Double-click `dsh-web.lnk` directly.
2. Pin to the taskbar: right-click `dsh-web.lnk` → "Pin to taskbar".

## After moving computers or changing the path

The repository does not store the `.lnk` (its absolute path depends on this machine). On a new machine:

- Enter this directory, right-click `create-shortcut.ps1` → "Run with PowerShell", which regenerates `dsh-web.lnk` for the current path.

## Notes

- `dsh web` listens on `http://127.0.0.1:3080` by default and opens the browser once ready; closing the launch window stops the server.
- If the port is already in use, the launcher opens the existing page instead of starting the server again.
