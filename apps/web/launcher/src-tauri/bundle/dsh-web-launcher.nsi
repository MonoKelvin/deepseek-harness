; Inno Setup script — fallback installer for dsh-web-launcher
; Used when single-file packaging via tauri-plugin-singlefile is unavailable.
;
; Usage:
;   iscc /D AppVersion=0.1.0 /D SourceDir=dist dsh-web-launcher.nsi

#define MyAppName "dsh Web Launcher"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "DeepSeek AI"
#define MyAppURL "https://github.com/deepseek-ai/deepseek-harness"
#define MyAppExeName "dsh-web-launcher.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=
OutputName={tmp}\{#MyAppName}-setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64
ArchitecturesPrefered=x64

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{autogroup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeUninstall(): Boolean;
begin
  Result := True;
end

function InitializeSetup(): Boolean;
begin
  Result := True;
end
