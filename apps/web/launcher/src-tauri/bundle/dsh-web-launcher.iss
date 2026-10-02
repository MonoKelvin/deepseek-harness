; Inno Setup script for dsh-web-launcher — directory-choosing Windows installer.
;
; The payload is the single self-contained Tauri binary (frontend assets and
; icons are embedded at compile time), so the installer ships exactly one exe
; plus shortcuts. Driven by scripts/package.mjs, which supplies the defines:
;
;   iscc /DMyAppVersion=0.1.0 /DAppExe=<path> /DIconFile=<path> \
;        /DOutputDir=<dir> /DOutputBaseFilename=<name> [/DLicenseFile=<path>] \
;        dsh-web-launcher.iss

#define MyAppName "DSH Web Launcher"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef AppExe
  #define AppExe "..\target\release\dsh-web-launcher.exe"
#endif
#define MyAppPublisher "DeepSeek AI"
#define MyAppURL "https://github.com/MonoKelvin/deepseek-harness"
#define MyAppExeName "dsh-web-launcher.exe"

[Setup]
AppId={{9C7D2F4E-5A3B-4C1D-8E6F-2A9B4D7C1E53}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Install per-user without elevation by default; a user can still choose a
; machine-wide location, which prompts for elevation only then.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
#ifdef IconFile
SetupIconFile={#IconFile}
#endif
#ifdef OutputDir
OutputDir={#OutputDir}
#endif
#ifdef OutputBaseFilename
OutputBaseFilename={#OutputBaseFilename}
#endif
#ifdef LicenseFile
LicenseFile={#LicenseFile}
#endif

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#AppExe}"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
// The app renders through the system WebView2 runtime (standard on Windows
// 10/11). Detect it across the per-machine and per-user registration keys so a
// missing runtime is reported instead of surfacing as a blank window later.
function WebView2Installed(): Boolean;
var
  version: String;
begin
  Result :=
    RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version) or
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version) or
    RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', version);
end;

function InitializeSetup(): Boolean;
var
  errorCode: Integer;
begin
  Result := True;
  if not WebView2Installed() then
  begin
    if MsgBox('This application needs the Microsoft Edge WebView2 runtime, which was not detected on this system.'
      + #13#10#13#10 + 'Open the download page now? You can continue the installation and install the runtime afterwards.',
      mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://developer.microsoft.com/microsoft-edge/webview2/', '', '', SW_SHOW, ewNoWait, errorCode);
  end;
end;
