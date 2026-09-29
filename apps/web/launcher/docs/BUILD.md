# Build Guide

## Prerequisites

- **Node.js** `^22.19` or `>=24`
- **pnpm** `11.7.0`
- **Rust** toolchain (>=1.98), including `cargo` and `rustc`
- **WebView2 Runtime** (pre-installed on Windows 10+; the Tauri window uses it directly)
- **tauri CLI** (global): `npm i -g @tauri-apps/cli`

## Install dependencies

```sh
# In the launcher directory
pnpm install
```

## Development

```sh
# Start the Vite dev server + Tauri window
pnpm tauri dev
```

The Vite dev server runs on `http://localhost:5173`; Tauri connects to it in dev mode and hot-reloads on save.

## Production build

```sh
pnpm tauri build
```

This produces:

- A binary at `src-tauri/target/release/dsh-web-launcher.exe`
- A bundled installer at `src-tauri/target/release/bundle/msi/`

### Single-file portable exe

Tauri's standard bundle produces an MSI installer. For a truly portable single-file exe, install and use [`tauri-plugin-singlefile`](https://github.com/tauri-apps/tauri-plugin-singlefile):

```sh
pnpm add -D tauri-plugin-singlefile
```

Then add to `src-tauri/Tauri.toml`:

```tomlc
[tauri]
bundle = { targets = "msi", active = true }

[tauri.plugins.singlefile]
enabled = true
```

### Inno Setup fallback (Windows)

If single-file is unavailable, an Inno Setup `.nsi` script is provided at `src-tauri/bundle/dsh-web-launcher.nsi`. To build:

1. Install [Inno Setup](https://jrsoftware.org/isinfo.php)
2. Build the Rust binary: `cd src-tauri && cargo build --release`
3. Compile the installer:
   ```
   iscc /D AppVersion=0.1.0 /D SourceDir=target\release dsh-web-launcher.nsi
   ```

## Repository discovery

The launcher determines the repository root from its own binary path: it walks up from the executable location to find the repo root. In development (via `pnpm tauri dev`), the process runs from the workspace root, so `pnpm` commands execute correctly. For production builds, the binary is expected to live at or near `apps/web/launcher/dist/` for auto-discovery to work.
