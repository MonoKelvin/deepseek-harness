use std::sync::Arc;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconEvent},
  AppHandle, Manager, State, WindowEvent,
};
use tokio::sync::Mutex;

use process::{
  append_log, build_status, clear_logs as clear_log_buffer, log_command_result, run_pnpm,
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

#[tauri::command]
async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
  Ok(state.settings.lock().await.clone())
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
  let mut manager = state.manager.lock().await;
  match stop_dsh_web(&mut manager).await {
    Ok(()) => Ok(CommandOutput { success: true, stdout: String::new(), stderr: String::new() }),
    Err(error) => Ok(CommandOutput { success: false, stdout: String::new(), stderr: error }),
  }
}

#[tauri::command]
async fn restart_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let settings = state.settings.lock().await.clone();
  let locale = state::current_locale(&settings);
  let mut manager = state.manager.lock().await;
  if let Err(error) = stop_dsh_web(&mut manager).await {
    return Ok(CommandOutput { success: false, stdout: String::new(), stderr: error });
  }
  match start_dsh_web(&mut manager, &settings).await {
    Ok(pid) => Ok(CommandOutput { success: true, stdout: state::t_log(&locale, "process.restarted", &[("pid", &pid.to_string())]), stderr: String::new() }),
    Err(error) => Ok(CommandOutput { success: false, stdout: String::new(), stderr: error }),
  }
}

fn launch_url(value: &str) -> Result<(), String> {
  let url = tauri::Url::parse(value).map_err(|error| error.to_string())?;
  if !matches!(url.scheme(), "http" | "https") { return Err("Only HTTP and HTTPS links can be opened".into()); }
  #[cfg(target_os = "windows")]
  {
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
  Ok(())
}

#[tauri::command]
async fn open_url(url: String, state: State<'_, AppState>) -> Result<(), String> {
  let settings = state.settings.lock().await.clone();
  let locale = state::current_locale(&settings);
  let result = launch_url(&url);
  log_command_result(&state.logs, &locale, &format!("open {url}"), result.as_ref().map(|_| ()).map_err(|error| error.as_str())).await;
  result
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

pub fn run() {
  let manager = ServerManager::new();
  let logs = manager.logs.clone();
  let settings = Arc::new(Mutex::new(AppSettings::default()));

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(AppState {
      manager: Arc::new(Mutex::new(manager)),
      logs: logs.clone(),
      settings,
    })
    .setup(move |app| {
      let loaded = state::load_settings(app.handle());
      let state = app.state::<AppState>();
      tauri::async_runtime::block_on(async {
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
      let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&toggle, &quit])?;
      let tray = app.tray_by_id("main").expect("configured tray icon");
      tray.set_menu(Some(menu))?;
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
      let main_window = app.get_webview_window("main").expect("configured main window");
      #[cfg(target_os = "windows")]
      window::configure(&main_window.as_ref().window())?;
      main_window.show()?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![
      get_status, get_settings, set_dsh_directory, set_theme, set_locale, clear_logs,
      open_directory_picker,
      install_deps, build_frontend, start_server, stop_server, restart_server, open_url
    ])
    .run(tauri::generate_context!())
    .expect("error running tauri app");
}
