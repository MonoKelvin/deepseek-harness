use std::sync::Arc;

use tauri::State;

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

/// The entry point for the Tauri application.
pub fn run() {
  let manager = Arc::new(tokio::sync::Mutex::new(ServerManager::new()));

  tauri::Builder::default()
    .manage(AppState(manager))
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
