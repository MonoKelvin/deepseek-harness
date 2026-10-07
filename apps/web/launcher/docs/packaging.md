# Packaging (Windows)

`dsh-web-launcher` packages into two Windows deliverables from one command. Run
everything from `apps/web/launcher`.

```bash
npm run package              # build once, then produce both deliverables
npm run package:portable     # portable single-file exe only
npm run package:installer    # Inno Setup installer only
npm run package:portable:gnu # portable single-file exe with GNU toolchain
```

Both land in `release/` (git-ignored), named with the `package.json` version:

- `dsh-web-launcher-<version>-portable.exe`
- `dsh-web-launcher-<version>-setup.exe`

## Portable single-file exe

The portable deliverable is the Tauri release binary itself, copied verbatim.
Tauri embeds the built frontend assets and the window/tray icons into the
executable at compile time, and the launcher declares no sidecar resources or
external binaries, so the result is genuinely one file: it runs directly with
no installer, no unpacking, and no extracted folder — all application resources
live inside the single exe.

Its one external dependency is the Microsoft Edge **WebView2 runtime**, a system
component that ships with Windows 10 (recent updates) and Windows 11. On a
machine without it the window renders blank; install it from
<https://developer.microsoft.com/microsoft-edge/webview2/>. This is why a true
single-exe is possible without bundling a browser engine — the OS provides it.

## Inno Setup installer

The installer wraps the same single exe and shows the standard directory-choosing
wizard. It installs per-user without elevation by default; choosing a machine-wide
location prompts for elevation only then. It creates Start Menu and optional
desktop shortcuts, registers a clean uninstaller, and checks for the WebView2
runtime up front, offering the download page when it is missing.

The installer requires the Inno Setup compiler (`ISCC.exe`), version 6.3+ or 7.
Install it once:

```bash
winget install JRSoftware.InnoSetup
```

`scripts/package.mjs` resolves `ISCC.exe` from, in order: the `ISCC` environment
variable, `PATH`, the default install directories (Inno Setup 6/7 under Program
Files), and the Inno Setup uninstall registry entry (so a non-default drive or
version is found automatically). The script in
`src-tauri/bundle/dsh-web-launcher.iss` receives the version, binary path, icon,
output directory, and (when present) the repository `LICENSE` as defines.

## GNU Toolchain

For users who cannot or prefer not to use MSVC, the project supports building with
the GNU toolchain (MinGW-w64). This is useful when:

- You cannot or do not want to install Visual Studio/Build Tools
- You need a portable toolchain that doesn't include MSVC components
- You're using a minimal development environment

### Prerequisites

```bash
# 1. Install MinGW-w64 (provides x86_64-w64-mingw32-gcc)
#    On Windows, download from https://www.mingw-w64.org/ or use:
winget install MSYS2.MSYS2

# Then run in MSYS2 UCRT64 shell:
pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-binutils

# 2. Add MinGW bin to PATH:
#    C:\msys64\ucrt64\mingw64\bin

# 3. Install Rust GNU target:
rustup target add x86_64-pc-windows-gnu
```

### Build with GNU toolchain

```bash
npm run package:portable:gnu
```

This uses the `x86_64-pc-windows-gnu` target and expects the MinGW-w64 GCC
toolchain to be available on PATH.

See `src-tauri/.cargo/config.toml` for linker configuration.

## Size

The release profile in `src-tauri/Cargo.toml` optimizes for size: `opt-level="s"`,
`lto=true`, `codegen-units=1`, `panic="abort"`, and `strip=true` (no debug
symbols). The installer compresses with solid LZMA2. Because each deliverable is
a single exe, there are no redundant files to prune.

`--upx` optionally compresses the binary further with [UPX](https://upx.github.io/)
when it is on `PATH`. It is off by default: UPX-packed executables sometimes
trigger antivirus false positives.

## Options

```
node scripts/package.mjs [--portable] [--installer] [--skip-build] [--upx] [--gnu]
```

- `--gnu` uses the GNU toolchain (`x86_64-pc-windows-gnu`) instead of MSVC
- `--skip-build` reuses the existing `src-tauri/target/release` binary instead of
  rebuilding — useful when iterating on the installer alone.
- With neither `--portable` nor `--installer`, both deliverables are produced.

## Notes

- Packaging is Windows-only; the script exits early on other platforms.
- `npm run tauri:build` still produces Tauri's own MSI (its configured bundle
  target) and is independent of this packaging path.