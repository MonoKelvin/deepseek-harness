use std::sync::Arc;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconEvent},
  tray::TrayIconBuilder,
  AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tokio::sync::Mutex;

use process::{
  append_log, attach_log_emitter, build_status, clear_logs as clear_log_buffer, log_command_result, run_pnpm,
  start_dsh_web, stop_dsh_web,
  CommandOutput, LogSeverity, LogSource, ServerManager, ServerStatusInfo, SharedLogBuffer,
  SharedManager,
};
use state::{save_settings, AppSettings, SharedSettings};

mod process;
mod state;
#[cfg(target_os = "windows")]
mod window;

pub struct AppState {
  manager: SharedManager,
  logs: SharedLogBuffer,
  settings: SharedSettings,
}

#[tauri::command]
async fn get_status(state: State<'_, AppState>) -> Result<ServerStatusInfo, String> {
  let settings = state.settings.lock().await.clone();
  let dsh_valid = state::resolve_dsh_root(&settings).is_some();
  let mut info = build_status(&state.manager, dsh_valid).await;
  info.error = if dsh_valid {
    None
  } else {
    Some(state::t_log(&state::current_locale(&settings), "dsh.unknown", &[]))
  };
  Ok(info)
}

/// Read the persisted settings, with `autostart` filled from the live OS entry
/// rather than from `settings.json`.
#[tauri::command]
async fn get_settings(state: State<'_, AppState>, app_handle: AppHandle) -> Result<AppSettings, String> {
  let mut settings = state.settings.lock().await.clone();
  settings.autostart = app_handle.autolaunch().is_enabled().unwrap_or(false);
  Ok(settings)
}

#[tauri::command]
async fn set_dsh_directory(state: State<'_, AppState>, app_handle: AppHandle, path: String) -> Result<AppSettings, String> {
  let result = {
    let mut settings = state.settings.lock().await;
    settings.dsh_directory = Some(path);
    settings.clone()
  };
  save_settings(&app_handle, &result);
  let locale = state::current_locale(&result);
  if state::is_valid_dsh_root(std::path::Path::new(result.dsh_directory.as_deref().unwrap_or(""))) {
    append_log(&state.logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, "dsh.set.success", &[])).await;
  } else {
    append_log(&state.logs, LogSource::Launcher, LogSeverity::Error, state::t_log(&locale, "dsh.set.invalid", &[])).await;
  }
  Ok(result)
}

#[tauri::command]
async fn set_theme(state: State<'_, AppState>, app_handle: AppHandle, theme: String) -> Result<(), String> {
  let result = {
    let mut settings = state.settings.lock().await;
    settings.theme = theme;
    settings.clone()
  };
  save_settings(&app_handle, &result);
  Ok(())
}

#[tauri::command]
async fn set_locale(state: State<'_, AppState>, app_handle: AppHandle, locale: String) -> Result<(), String> {
  let result = {
    let mut settings = state.settings.lock().await;
    settings.locale = locale;
    settings.clone()
  };
  save_settings(&app_handle, &result);
  Ok(())
}

/// Write or remove the OS autostart entry and report the launcher-wide settings
/// with the applied value.
#[tauri::command]
async fn set_autostart(state: State<'_, AppState>, app_handle: AppHandle, enabled: bool) -> Result<AppSettings, String> {
  let manager = app_handle.autolaunch();
  let applied = if enabled { manager.enable() } else { manager.disable() };
  applied.map_err(|error| error.to_string())?;
  let mut settings = state.settings.lock().await.clone();
  settings.autostart = enabled;
  let locale = state::current_locale(&settings);
  let key = if enabled { "autostart.enabled" } else { "autostart.disabled" };
  append_log(&state.logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, key, &[])).await;
  Ok(settings)
}

#[tauri::command]
async fn open_directory_picker(window: tauri::Window) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  let picked = window
    .dialog()
    .file()
    .set_title("Select DSH directory")
    .blocking_pick_folder();
  match picked {
    Some(tauri_plugin_dialog::FilePath::Path(path)) => Ok(Some(path.to_string_lossy().to_string())),
    Some(tauri_plugin_dialog::FilePath::Url(url)) => Ok(Some(url.to_string())),
    None => Ok(None),
  }
}

#[tauri::command]
async fn clear_logs(state: State<'_, AppState>) -> Result<(), String> {
  clear_log_buffer(&state.logs).await;
  Ok(())
}

#[tauri::command]
async fn install_deps(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  Ok(run_pnpm(&["install"], &state.logs, &settings).await)
}

#[tauri::command]
async fn build_frontend(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  Ok(run_pnpm(&["--filter", "@deepseek-ai/dsh-web-frontend", "build"], &state.logs, &settings).await)
}

#[tauri::command]
async fn start_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  let locale = state::current_locale(&settings);
  let mut manager = state.manager.lock().await;
  match start_dsh_web(&mut manager, &settings).await {
    Ok(pid) => Ok(CommandOutput { success: true, stdout: state::t_log(&locale, "process.started", &[("pid", &pid.to_string())]), stderr: String::new() }),
    Err(error) => Ok(CommandOutput { success: false, stdout: String::new(), stderr: error }),
  }
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  let mut manager = state.manager.lock().await;
  match stop_dsh_web(&mut manager, &settings).await {
    Ok(()) => Ok(CommandOutput { success: true, stdout: String::new(), stderr: String::new() }),
    Err(error) => Ok(CommandOutput { success: false, stdout: String::new(), stderr: error }),
  }
}

#[tauri::command]
async fn restart_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  let locale = state::current_locale(&settings);
  let mut manager = state.manager.lock().await;
  if let Err(error) = stop_dsh_web(&mut manager, &settings).await {
    return Ok(CommandOutput { success: false, stdout: String::new(), stderr: error });
  }
  match start_dsh_web(&mut manager, &settings).await {
    Ok(pid) => Ok(CommandOutput { success: true, stdout: state::t_log(&locale, "process.restarted", &[("pid", &pid.to_string())]), stderr: String::new() }),
    Err(error) => Ok(CommandOutput { success: false, stdout: String::new(), stderr: error }),
  }
}

/// Whether this process holds an elevated token.
#[cfg(target_os = "windows")]
fn is_elevated() -> bool {
  use windows::Win32::Foundation::{CloseHandle, HANDLE};
  use windows::Win32::Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY};
  use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
  let mut token = HANDLE::default();
  if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) }.is_err() {
    return false;
  }
  let mut elevation = TOKEN_ELEVATION::default();
  let mut size = 0u32;
  let read = unsafe {
    GetTokenInformation(token, TokenElevation, Some(&mut elevation as *mut _ as *mut core::ffi::c_void), size_of::<TOKEN_ELEVATION>() as u32, &mut size)
  };
  let _ = unsafe { CloseHandle(token) };
  read.is_ok() && elevation.TokenIsElevated != 0
}

/// Open an HTTP(S) link in the default browser.
///
/// An installer-packaged browser rejects a URL handed over by an elevated process
/// and offers to restart itself instead, so an elevated launcher routes the URL
/// through Explorer, which runs at the shell's integrity level. Explorer's exit
/// status does not report whether the browser opened, so only a failure to run it
/// is an error. Returns whether the link was handed to the shell.
fn launch_url(value: &str) -> Result<bool, String> {
  let url = tauri::Url::parse(value).map_err(|error| error.to_string())?;
  if !matches!(url.scheme(), "http" | "https") { return Err("Only HTTP and HTTPS links can be opened".into()); }
  #[cfg(target_os = "windows")]
  {
    if is_elevated() {
      std::process::Command::new("explorer.exe").arg(url.as_str()).status().map_err(|error| error.to_string())?;
      return Ok(true);
    }
    use windows::{core::{w, HSTRING}, Win32::{UI::Shell::ShellExecuteW, UI::WindowsAndMessaging::SW_SHOWNORMAL}};
    let result = unsafe { ShellExecuteW(None, w!("open"), &HSTRING::from(url.as_str()), None, None, SW_SHOWNORMAL) };
    if result.0 as isize <= 32 { return Err(format!("Failed to open link (Windows error {})", result.0 as isize)); }
  }
  #[cfg(not(target_os = "windows"))]
  {
    let program = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    let status = std::process::Command::new(program).arg(url.as_str()).status().map_err(|error| error.to_string())?;
    if !status.success() { return Err(format!("Failed to open link: {status}")); }
  }
  Ok(false)
}

#[tauri::command]
async fn open_url(url: String, state: State<'_, AppState>) -> Result<(), String> {
  let settings = state.settings.lock().await.clone();
  let locale = state::current_locale(&settings);
  let result = launch_url(&url);
  if let Ok(true) = result {
    append_log(&state.logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, "link.shell", &[])).await;
  }
  log_command_result(&state.logs, &locale, &format!("open {url}"), result.as_ref().map(|_| ()).map_err(|error| error.as_str())).await;
  result.map(|_| ())
}

fn toggle_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    if window.is_visible().unwrap_or(false) {
      let _ = window.hide();
    } else {
      let _ = window.show();
      let _ = window.set_focus();
    }
  }
}

/// Build the tray icon and verify it actually landed in the notification area.
///
/// The tray-icon crate swallows `Shell_NotifyIcon(NIM_ADD)` failures and waits
/// for a "TaskbarCreated" broadcast to re-register — a broadcast that never
/// arrives while Explorer is healthy — so a failed registration is completely
/// silent: the process runs, no error surfaces, and no icon appears. Probe
/// with `set_tooltip` (NIM_MODIFY only succeeds for a registered icon) and
/// rebuild until the shell acknowledges the icon.
fn configure_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&toggle, &quit])?;
  // Reuse the generated 32px favicon asset (public/appicon-32.png, produced by
  // scripts/gen-icons.cjs from the appicon-dsh-girl.png master) as the tray
  // icon. Single source of truth: no separate tray-icon.png to keep in sync.
  let icon = tauri::image::Image::from_bytes(include_bytes!("../../public/appicon-32.png"))?;

  const ATTEMPTS: u32 = 5;
  let mut last_error = None;
  for _ in 0..ATTEMPTS {
    // Event handlers are attached only after registration is confirmed, so a
    // failed attempt leaves no duplicate global listeners behind.
    let tray = TrayIconBuilder::with_id("main")
      .icon(icon.clone())
      .tooltip("DSH 启动器")
      .menu(&menu)
      .show_menu_on_left_click(false)
      .build(app)?;
    match tray.set_tooltip(Some("DSH 启动器")) {
      Ok(()) => {
        tray.on_menu_event(|app, event| match event.id.as_ref() {
          "toggle" => toggle_main_window(app),
          "quit" => app.exit(0),
          _ => {}
        });
        tray.on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            toggle_main_window(tray.app_handle());
          }
        });
        return Ok(());
      }
      Err(error) => {
        last_error = Some(error);
        // Drop the unregistered tray (destroys its hidden window) before retrying.
        let _ = app.remove_tray_by_id("main");
        std::thread::sleep(std::time::Duration::from_millis(200));
      }
    }
  }
  Err(format!("tray icon registration failed after {ATTEMPTS} attempts: {last_error:?}").into())
}

/// Whether this process was started by the sign-in autostart entry rather than
/// by the user, which keeps a login from popping the window open.
fn started_at_sign_in() -> bool {
  std::env::args().any(|arg| arg == "--autostart")
}

pub fn run() {
  let manager = ServerManager::new();
  let logs = manager.logs.clone();
  let settings = Arc::new(Mutex::new(AppSettings::default()));

  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
    .manage(AppState {
      manager: Arc::new(Mutex::new(manager)),
      logs: logs.clone(),
      settings,
    })
    .setup(move |app| {
      let loaded = state::load_settings(app.handle());
      let state = app.state::<AppState>();
      tauri::async_runtime::block_on(async {
        attach_log_emitter(&logs, app.handle().clone()).await;
        *state.settings.lock().await = loaded.clone();
        let locale = state::current_locale(&loaded);
        let dsh_valid = loaded.dsh_directory.as_ref()
          .map(|d| state::is_valid_dsh_root(std::path::Path::new(d)))
          .unwrap_or(false);
        if dsh_valid {
          append_log(&logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, "dsh.using", &[("dir", loaded.dsh_directory.as_deref().unwrap_or(""))])).await;
        } else {
          let detected = state::detect_dsh_directory();
          if let Some(ref dir) = detected {
            append_log(&logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, "dsh.detected", &[("dir", dir)])).await;
          } else {
            append_log(&logs, LogSource::Launcher, LogSeverity::Error, state::t_log(&locale, "dsh.unknown", &[])).await;
          }
        }
      });
      let main_window = app.get_webview_window("main").expect("configured main window");
      #[cfg(target_os = "windows")]
      window::configure(&main_window.as_ref().window())?;
      if !started_at_sign_in() {
        main_window.show()?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_status, get_settings, set_dsh_directory, set_theme, set_locale, set_autostart, clear_logs,
      open_directory_picker,
      install_deps, build_frontend, start_server, stop_server, restart_server, open_url
    ])
    .build(tauri::generate_context!())
    .expect("error building tauri app");
  app.run(|app, event| match event {
    // The tray-icon crate requires a running event loop on the creating thread;
    // build the tray once the event loop is up instead of during setup.
    tauri::RunEvent::Ready => {
      if let Err(error) = configure_tray(app) {
        let message = format!("tray icon registration failed: {error}");
        let logs = app.state::<AppState>().logs.clone();
        tauri::async_runtime::spawn(async move {
          append_log(&logs, LogSource::Launcher, LogSeverity::Error, message).await;
        });
      }
    }
    tauri::RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } => {
      // Without a tray there is no way to summon the window back, so closing
      // must exit the app instead of hiding the window into the void.
      if app.tray_by_id("main").is_some() {
        api.prevent_close();
        if let Some(window) = app.get_webview_window(&label) {
          let _ = window.hide();
        }
      }
    }
    _ => {}
  });
}
