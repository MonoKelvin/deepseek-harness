# Create the dsh-web.lnk shortcut with correct absolute paths.
# Usage: right-click this file -> "Run with PowerShell"
#   or:  powershell -ExecutionPolicy Bypass -File create-shortcut.ps1
$ErrorActionPreference = 'Stop'
$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $launcherDir '..\..\..')
$bat = Join-Path $launcherDir 'launch.bat'
$ico = Join-Path $launcherDir 'dsh-web.ico'
$lnk = Join-Path $launcherDir 'dsh-web.lnk'

if (-not (Test-Path $bat)) { Write-Error "launch.bat not found next to this script."; exit 1 }
if (-not (Test-Path $ico)) { Write-Warning "dsh-web.ico not found; falling back to the bat icon."; $ico = $bat }

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = 'C:\Windows\System32\cmd.exe'
$sc.Arguments = "/d /c ""$bat"""
$sc.WorkingDirectory = $repoRoot.Path
$sc.IconLocation = "$ico,0"
$sc.Description = 'DeepSeek Harness Web (dsh web) one-click launcher'
$sc.WindowStyle = 1
$sc.Save()

Write-Host "Created shortcut: $lnk"
Write-Host "  Target : $bat"
Write-Host "  Workdir: $($repoRoot.Path)"
Write-Host "  Icon   : $ico"
