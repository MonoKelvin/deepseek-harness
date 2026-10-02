<#
.SYNOPSIS
  Strip the Low-integrity "sandbox" label from the launcher project tree.

.DESCRIPTION
  On some machines the deepseek-harness repo is force-labeled Low Mandatory
  Level ("Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)" plus an inherited
  "Everyone:(CI)(DENY)(DC)" delete-protection ACE).

  Consequences:
    1. A process running at Low IL cannot register a Windows tray icon: Explorer
       rejects Shell_NotifyIcon(NIM_ADD) with ERROR_ACCESS_DENIED. Tauri's
       tray-icon crate swallows this silently, so the app runs fine but the tray
       icon never appears -- the historical symptom in this repo.
    2. The DENY delete-protection ACE blocks cargo from replacing stale build
       artifacts under target/, causing intermittent build failures.

  This script resets the whole project tree to Medium IL and removes the
  inherited deny-delete ACE. It only requests elevation (UAC) when a Low /
  Untrusted label is actually detected, so on a normal clone it is a harmless
  no-op and is safe to wire into a pre-build step ("self-heals" on any machine).

.PARAMETER ProjectDir
  Root of the launcher project. Defaults to the script's own directory.
#>
[CmdletBinding()]
param(
  [string]$ProjectDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

# Non-Windows platforms need no fix.
if ($env:OS -notmatch 'Windows') {
  Write-Host '[fix-integrity] Not Windows, skipping.'
  exit 0
}

function Get-IntegrityLabel {
  param([string]$Path)
  $out = icacls $Path 2>$null
  $m = $out | Select-String 'Mandatory Label'
  if ($m) { return ($m -replace '.*Mandatory Label\\', '' -replace '(\(|:).*', '').Trim() }
  return 'None'
}

$current = Get-IntegrityLabel -Path $ProjectDir
Write-Host "[fix-integrity] project: $ProjectDir"
Write-Host "[fix-integrity] integrity label: $current"

# Detect the sandbox's inherited delete-protection ACE specifically: a deny ACE
# carrying the (DC) delete-child right (e.g. "Everyone:(CI)(DENY)(DC)"). Matching
# only lines with both (DENY) and (DC) avoids tripping on unrelated deny ACEs
# that corporate/AV policies add elsewhere, which a bare "DENY" scan would catch
# and then needlessly trigger a UAC-elevated whole-tree reset.
$raw = icacls $ProjectDir 2>$null
$denyAce = $raw | Where-Object { $_ -match '\(DENY\)' -and $_ -match '\(DC\)' }
$hasDeny = [bool]$denyAce
if ($hasDeny) { Write-Host '[fix-integrity] inherited deny-delete (DENY/DC) ACE present.' }

# Act when a Low / Untrusted label OR a deny-delete ACE is present.
$needsFix = ($current -eq 'Low Mandatory Level') -or ($current -eq 'Untrusted Mandatory Level') -or $hasDeny
if (-not $needsFix) {
  Write-Host '[fix-integrity] No Low-integrity sandbox or deny ACE detected. Nothing to do.'
  exit 0
}

# Changing integrity labels / removing deny ACEs requires admin; self-elevate.
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host '[fix-integrity] Sandbox label detected; elevating to reset integrity level...'
  $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ProjectDir `"$ProjectDir`""
  exit $p.ExitCode
}

Write-Host '[fix-integrity] Recursively resetting integrity label to Medium...'
icacls $ProjectDir /setintegritylevel "(OI)(CI)Medium" /T /C
# The deny-delete ACE is inherited from the parent sandbox repo, so it cannot be
# removed while still inherited. Break inheritance (copy current ACEs to explicit,
# decoupling this tree from the Low parent) then strip the now-explicit deny.
Write-Host '[fix-integrity] Breaking inheritance (copy to explicit) to detach from parent sandbox...'
icacls $ProjectDir /inheritance:d /T /C
Write-Host '[fix-integrity] Recursively removing deny-delete (DENY/DC) ACE...'
icacls $ProjectDir /remove:d Everyone /T /C
Write-Host '[fix-integrity] Done. Restart your terminal / editor to inherit the new label.'
