@echo off
setlocal EnableExtensions
:: ============================================================================
:: dsh web one-click launcher
:: Repo root is three levels up from this script: apps/web/launcher -> root
:: ============================================================================
set "LAUNCHER_DIR=%~dp0"
set "REPO_ROOT=%LAUNCHER_DIR%..\..\.."
set "PORT=3080"

:: Move to the repo root (pnpm workspace commands must run there).
cd /d "%REPO_ROOT%" 2>nul || (echo [ERROR] Cannot locate repo root from %LAUNCHER_DIR%. & pause & exit /b 1)

:: pnpm is required.
where pnpm >nul 2>nul || (echo [ERROR] pnpm not found. Install Node.js + pnpm first. & pause & exit /b 1)

:: Install workspace dependencies only when they are missing.
if not exist "node_modules" (
  echo [INFO] Dependencies missing, running pnpm install...
  call pnpm install
  if errorlevel 1 (echo [ERROR] pnpm install failed. & pause & exit /b 1)
) else (
  echo [INFO] Dependencies present, skipping pnpm install.
)

:: Build the web frontend only when its dist is missing (dsh web serves built files).
if not exist "apps\web\dist\index.html" (
  echo [INFO] Frontend dist missing, building web frontend...
  call pnpm --filter @deepseek-ai/dsh-web-frontend build
  if errorlevel 1 (echo [ERROR] Frontend build failed. & pause & exit /b 1)
) else (
  echo [INFO] Frontend dist present, skipping build.
)

:: If a server is already listening on PORT, just open it instead of starting a second one.
powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port %PORT% -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>nul
if %errorlevel%==0 (
  echo [INFO] dsh web already running on port %PORT%. Opening browser...
  start "" "http://127.0.0.1:%PORT%/"
  exit /b 0
)

:: Launch. dsh web auto-opens the default browser once the UI is ready.
echo [INFO] Starting dsh web at http://127.0.0.1:%PORT%/
echo [INFO] Close this window to stop the server.
call pnpm dsh web
if errorlevel 1 (echo [ERROR] dsh web exited with an error. & pause)
endlocal
