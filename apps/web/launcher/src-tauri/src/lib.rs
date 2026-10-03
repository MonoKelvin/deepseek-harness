use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;

use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconEvent},
  tray::TrayIconBuilder,
  AppHandle, Manager, State, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tokio::sync::Mutex;

/// Path to the lock file for single instance enforcement
fn lock_file_path() -> PathBuf {
  let temp_dir = std::env::temp_dir();
  temp_dir.join("dsh-web-launcher.lock")
}

/// PID stored in the lock file
struct LockFile {
  path: PathBuf,
  file: Option<File>,
}

impl LockFile {
  fn new() -> Self {
    let path = lock_file_path();
    let temp_dir = std::env::temp_dir();
    let parent = path.parent().unwrap_or(&temp_dir);
    let _ = std::fs::create_dir_all(parent);
    Self { path, file: None }
  }

  /// Try to acquire a single instance lock.
  /// Returns true if this is the only instance (we got the lock), false if another instance is running.
  fn try_lock(&mut self) -> bool {
    let current_pid = std::process::id();

    // Check if lock file exists and contains a valid PID
    if let Ok(mut file) = File::open(&self.path) {
      let mut pid_str = String::new();
        if file.read_to_string(&mut pid_str).is_ok() {
          if let Ok(past_pid) = pid_str.trim().parse::<u32>() {
            // Check if the process is still running
            if Self::is_process_running(past_pid) {
              return false; // Another instance is running
            }
          }
        }
    }

    // Create or overwrite the lock file with our PID
    if let Ok(mut file) = File::create(&self.path) {
      let _ = file.write_all(format!("{}", current_pid).as_bytes());
      self.file = Some(file);
      true
    } else {
      false
    }
  }

  /// Check if a process with the given PID is still running
  #[cfg(target_os = "windows")]
  fn is_process_running(pid: u32) -> bool {
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION};
    let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION, false, pid) };
    handle.is_ok()
  }

  #[cfg(not(target_os = "windows"))]
  fn is_process_running(pid: u32) -> bool {
    // On Unix, check if the process exists by sending signal 0
    use std::process::Command;
    Command::new("kill")
      .arg("-0")
      .arg(pid.to_string())
      .output()
      .map(|output| output.status.success())
      .unwrap_or(false)
  }

  /// Release the lock file
  fn release(&mut self) {
    let _ = self.file.take();
    let _ = std::fs::remove_file(&self.path);
  }
}

impl Drop for LockFile {
  fn drop(&mut self) {
    self.release();
  }
}

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
  /// Set once the on-exit shutdown has run (or the user chose to exit anyway),
  /// so the re-issued `app.exit` passes straight through `ExitRequested`.
  exit_ready: Arc<AtomicBool>,
}

#[tauri::command]
async fn get_status(state: State<'_, AppState>) -> Result<ServerStatusInfo, String> {
  let settings = state.settings.lock().await.clone();
  let dsh_valid = state::resolve_dsh_root(&settings).is_some();
  let mut info = build_status(&state.manager, dsh_valid, settings.port).await;
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

/// Persist whether exiting the launcher also stops the dsh service it started.
#[tauri::command]
async fn set_stop_services_on_exit(state: State<'_, AppState>, app_handle: AppHandle, enabled: bool) -> Result<AppSettings, String> {
  let result = {
    let mut settings = state.settings.lock().await;
    settings.stop_services_on_exit = enabled;
    settings.clone()
  };
  save_settings(&app_handle, &result);
  let locale = state::current_locale(&result);
  let key = if enabled { "stopOnExit.enabled" } else { "stopOnExit.disabled" };
  append_log(&state.logs, LogSource::Launcher, LogSeverity::Info, state::t_log(&locale, key, &[])).await;
  Ok(result)
}

/// Persist the port the dsh web service is expected to listen on, so the
/// launcher watches, opens, and stops the server on the port the user runs.
#[tauri::command]
async fn set_server_port(state: State<'_, AppState>, app_handle: AppHandle, port: u16) -> Result<AppSettings, String> {
  let result = {
    let mut settings = state.settings.lock().await;
    settings.port = port;
    settings.clone()
  };
  save_settings(&app_handle, &result);
  Ok(result)
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

/// Longest the launcher waits for the on-exit stop before asking the user what
/// to do; the stop's own waits are shorter, so this only trips on a true hang.
const STOP_ON_EXIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

/// Begin exiting: stop the managed service (when enabled) off the event-loop
/// thread, then re-issue the exit once it finishes. Running the stop on the async
/// runtime — rather than blocking the event-loop thread — is what lets the
/// taskkill, port probes, and waits actually make progress before the process
/// goes away, which a synchronous block during exit did not.
fn begin_exit(app: &AppHandle) {
  let state = app.state::<AppState>();
  if state.exit_ready.load(Ordering::SeqCst) {
    app.exit(0);
    return;
  }
  let app = app.clone();
  tauri::async_runtime::spawn(async move {
    if stop_services_before_exit(&app).await {
      app.state::<AppState>().exit_ready.store(true, Ordering::SeqCst);
      app.exit(0);
    }
    // Otherwise the user declined to exit after a failed stop; stay running.
  });
}

/// Stop the running dsh service the way the UI's Stop button does, with a timeout
/// so the exit cannot hang. Returns whether the exit should proceed: true when
/// nothing was running or the stop succeeded; on a failed or timed-out stop the
/// user is asked whether to exit anyway (the service may still be running).
async fn stop_services_before_exit(app: &AppHandle) -> bool {
  let (manager, settings_lock) = {
    let state = app.state::<AppState>();
    (state.manager.clone(), state.settings.clone())
  };
  let settings = settings_lock.lock().await.clone();
  if !settings.stop_services_on_exit {
    return true;
  }
  // Mirror the Stop button: act on whatever holds the configured port, whether
  // this launcher started it (a managed child) or it is running externally —
  // `stop_dsh_web` terminates the managed tree and/or the port's owner. Gating on
  // a managed child alone missed a service shown as "external" (e.g. one started
  // before the launcher, or after a launcher restart), leaving it running on exit.
  let managed = {
    let manager = manager.lock().await;
    manager.pid.is_some() || manager.child.is_some()
  };
  let running = managed || process::is_port_open("127.0.0.1", settings.port).await;
  if !running {
    return true;
  }
  let outcome = {
    let mut manager = manager.lock().await;
    tokio::time::timeout(STOP_ON_EXIT_TIMEOUT, stop_dsh_web(&mut manager, &settings)).await
  };
  if matches!(outcome, Ok(Ok(()))) {
    return true;
  }
  confirm_exit_after_failed_stop(app, &settings)
}

/// Ask the user whether to exit after the on-exit stop failed. Returns whether to
/// proceed with the exit. Shown off the main thread, so `blocking_show` is safe.
fn confirm_exit_after_failed_stop(app: &AppHandle, settings: &AppSettings) -> bool {
  use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
  let locale = state::current_locale(settings);
  app
    .dialog()
    .message(state::t_log(&locale, "exit.stop.failed.body", &[]))
    .title(state::t_log(&locale, "exit.stop.failed.title", &[]))
    .kind(MessageDialogKind::Warning)
    .buttons(MessageDialogButtons::OkCancelCustom(
      state::t_log(&locale, "exit.continue", &[]),
      state::t_log(&locale, "exit.cancel", &[]),
    ))
    .blocking_show()
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
          "quit" => {
            begin_exit(app);
          }
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

/// Whether the launcher was started silently by the sign-in autostart entry, so
/// the frontend knows not to reveal the window after it paints its first content.
#[tauri::command]
fn is_autostart_launch() -> bool {
  started_at_sign_in()
}

pub fn run() {
  // Check for single instance - exit if another instance is running
  let mut lock_file = LockFile::new();
  if !lock_file.try_lock() {
    eprintln!("Another instance of DSH launcher is already running. Please close the existing instance first.");
    std::process::exit(1);
  }

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
      exit_ready: Arc::new(AtomicBool::new(false)),
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
      // The window stays hidden until the frontend paints its first content and
      // calls show() itself (see App.tsx), so a non-silent launch never flashes a
      // blank window while the webview initializes. This is the safety net: if the
      // frontend never signals (a load failure), reveal the window anyway after a
      // few seconds so it cannot stay stuck hidden. A silent sign-in launch is
      // never auto-shown; the tray toggles it.
      if !started_at_sign_in() {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          tokio::time::sleep(std::time::Duration::from_secs(8)).await;
          if let Some(window) = handle.get_webview_window("main") {
            if !window.is_visible().unwrap_or(true) {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        });
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      get_status, get_settings, set_dsh_directory, set_theme, set_locale, set_autostart, clear_logs,
      open_directory_picker, is_autostart_launch,
      install_deps, build_frontend, start_server, stop_server, restart_server, open_url,
      set_stop_services_on_exit, set_server_port
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
    // Stop the managed dsh service before the process goes away, when enabled.
    // The exit is held (`prevent_exit`) while the stop runs off-thread, then
    // re-issued; `exit_ready` lets that second exit pass straight through. This
    // covers the tray Quit item (`app.exit`) and a window closed with no tray.
    tauri::RunEvent::ExitRequested { api, .. } => {
      if app.state::<AppState>().exit_ready.load(Ordering::SeqCst) {
        return;
      }
      api.prevent_exit();
      begin_exit(app);
    }
    _ => {}
  });
}
