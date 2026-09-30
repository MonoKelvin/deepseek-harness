use std::sync::Arc;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  AppHandle, Manager, State, WindowEvent,
};

use process::{
  build_status, run_pnpm, start_dsh_web, stop_dsh_web,
  CommandOutput, ServerManager, ServerStatusInfo, SharedManager,
};

mod process;

/// Tauri managed state holding the server manager.
pub struct AppState(pub SharedManager);

#[tauri::command]
async fn get_status(state: State<'_, AppState>) -> Result<ServerStatusInfo, String> {
  let manager = state.0.lock().await;
  let status = build_status(&manager).await;
  Ok(status)
}

#[tauri::command]
async fn install_deps() -> Result<CommandOutput, String> {
  let output = run_pnpm(&["install"]).await;
  Ok(output)
}

#[tauri::command]
async fn build_frontend() -> Result<CommandOutput, String> {
  let output = run_pnpm(&["--filter", "@deepseek-ai/dsh-web-frontend", "build"]).await;
  Ok(output)
}

#[tauri::command]
async fn start_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let mut manager = state.0.lock().await;
  match start_dsh_web(&mut manager).await {
    Ok(pid) => Ok(CommandOutput {
      success: true,
      stdout: format!("Server started (PID: {})", pid),
      stderr: String::new(),
    }),
    Err(e) => Ok(CommandOutput {
      success: false,
      stdout: String::new(),
      stderr: e,
    }),
  }
}

#[tauri::command]
async fn stop_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let mut manager = state.0.lock().await;
  stop_dsh_web(&mut manager).await;
  Ok(CommandOutput {
    success: true,
    stdout: String::new(),
    stderr: String::new(),
  })
}

#[tauri::command]
async fn restart_server(state: State<'_, AppState>) -> Result<CommandOutput, String> {
  let mut manager = state.0.lock().await;
  stop_dsh_web(&mut manager).await;
  match start_dsh_web(&mut manager).await {
    Ok(pid) => Ok(CommandOutput {
      success: true,
      stdout: format!("Server restarted (PID: {})", pid),
      stderr: String::new(),
    }),
    Err(e) => Ok(CommandOutput {
      success: false,
      stdout: String::new(),
      stderr: e,
    }),
  }
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  std::process::Command::new("cmd")
    .args(["/c", "start", "", &url])
    .output()
    .map_err(|e| e.to_string())?;
  #[cfg(not(target_os = "windows"))]
  std::process::Command::new("open")
    .arg(&url)
    .output()
    .map_err(|e| e.to_string())?;
  Ok(())
}

/// Show the main window if hidden, otherwise hide it (tray click / menu toggle).
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

/// The entry point for the Tauri application.
pub fn run() {
  let manager = Arc::new(tokio::sync::Mutex::new(ServerManager::new()));

  tauri::Builder::default()
    .manage(AppState(manager))
    .setup(|app| {
      let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&toggle, &quit])?;

      TrayIconBuilder::new()
        .icon(app.default_window_icon().expect("bundled window icon").clone())
        .tooltip("DSH 启动器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "toggle" => toggle_main_window(app),
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            toggle_main_window(tray.app_handle());
          }
        })
        .build(app)?;

      Ok(())
    })
    // Closing the window (in-app control or OS request) hides to the tray
    // instead of quitting; the tray menu owns real exit.
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![
      get_status,
      install_deps,
      build_frontend,
      start_server,
      stop_server,
      restart_server,
      open_url,
    ])
    .run(tauri::generate_context!())
    .expect("error running tauri app");
}
