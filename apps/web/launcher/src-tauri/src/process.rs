use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// Current state of the server lifecycle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ServerState {
  Stopped,
  Starting,
  RunningManaged,
  RunningExternal,
  Stopping,
}

/// Status snapshot sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatusInfo {
  pub state: ServerState,
  pub port: Option<u16>,
  pub url: Option<String>,
  pub pid: Option<u32>,
  pub external: bool,
  pub log_lines: Vec<String>,
  pub error: Option<String>,
}

/// Return type for command invocations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
  pub success: bool,
  pub stdout: String,
  pub stderr: String,
}

const DEFAULT_PORT: u16 = 3080;
const DEFAULT_HOST: &str = "127.0.0.1";
const MAX_LOG_LINES: usize = 200;

/// Manages the dsh web child process, logs, and PID.
pub struct ServerManager {
  pub child: Option<tokio::process::Child>,
  pub log_handle: Option<JoinHandle<()>>,
  pub logs: Arc<Mutex<Vec<String>>>,
  pub pid: Option<u32>,
}

impl ServerManager {
  pub fn new() -> Self {
    Self {
      child: None,
      log_handle: None,
      logs: Arc::new(Mutex::new(Vec::new())),
      pid: None,
    }
  }

  pub async fn get_logs(&self) -> Vec<String> {
    self.logs.lock().await.clone()
  }

  pub async fn clear_logs(&self) {
    self.logs.lock().await.clear();
  }
}

/// Shared app state injected via Tauri's managed state system.
pub type SharedManager = Arc<Mutex<ServerManager>>;

/// Resolve the repository root from the launcher's install location or working directory.
pub fn repo_root() -> String {
  // In dev mode, the binary lives in target/debug/ — fall back to CWD
  // which is the workspace root when running `tauri dev`.
  let exe = std::env::current_exe().ok();
  if let Some(exe) = exe {
    let fallback = PathBuf::from(".");
    let launcher_dir = exe.parent().unwrap_or(&fallback);
    let web_dir = launcher_dir.parent().unwrap_or(launcher_dir);
    let apps_dir = web_dir.parent().unwrap_or(web_dir);
    let root = apps_dir.parent().unwrap_or(apps_dir);
    let root = root.to_string_lossy().to_string();
    // Heuristic: if the path contains a Cargo.toml or pnpm-workspace.yaml, it's likely the repo root
    if std::path::Path::new(&root).join("pnpm-workspace.yaml").exists()
      || std::path::Path::new(&root).join("Cargo.toml").exists()
    {
      return root;
    }
  }
  // Fall back to current working directory (dev mode)
  std::env::current_dir()
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_else(|_| ".".to_string())
}

/// Check if a TCP port is accepting connections — used to detect external servers.
pub async fn is_port_open(host: &str, port: u16) -> bool {
  let addr = format!("{}:{}", host, port);
  tokio::net::TcpStream::connect(&addr).await.is_ok()
}

/// Run a short-lived pnpm command (install, build) and capture output.
pub async fn run_pnpm(args: &[&str]) -> CommandOutput {
  let root = repo_root();
  let result = tokio::process::Command::new("pnpm")
    .args(args)
    .current_dir(&root)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .output()
    .await;

  match result {
    Ok(output) => {
      let stdout = String::from_utf8_lossy(&output.stdout).to_string();
      let stderr = String::from_utf8_lossy(&output.stderr).to_string();
      let success = output.status.success();
      if !success && stderr.is_empty() {
        let fallback = format!("Command exited with code: {}", output.status.code().unwrap_or(-1));
        CommandOutput { success, stdout, stderr: fallback }
      } else {
        CommandOutput { success, stdout, stderr }
      }
    }
    Err(e) => CommandOutput {
      success: false,
      stdout: String::new(),
      stderr: format!("Failed to execute pnpm: {}", e),
    },
  }
}

/// Spawn `pnpm dsh web`, collect logs, and update the manager state.
pub async fn start_dsh_web(manager: &mut ServerManager) -> Result<u32, String> {
  manager.logs.lock().await.clear();

  let root = repo_root();
  let mut child = tokio::process::Command::new("pnpm")
    .args(["dsh", "web"])
    .current_dir(&root)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
    .map_err(|e| format!("Failed to start dsh web: {}", e))?;

  let pid = child.id().unwrap_or(0);
  let stdout = child.stdout.take();
  let stderr = child.stderr.take();
  let logs_ref = manager.logs.clone();

  let log_handle = tokio::spawn(async move {
    if let Some(stdout) = stdout {
      let reader = BufReader::new(stdout);
      let mut lines = reader.lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let mut guard = logs_ref.lock().await;
        guard.push(format!("[stdout] {}", line));
        if guard.len() > MAX_LOG_LINES {
          let drain = guard.len() - MAX_LOG_LINES;
          guard.drain(0..drain);
        }
      }
    }
    if let Some(stderr) = stderr {
      let reader = BufReader::new(stderr);
      let mut lines = reader.lines();
      while let Ok(Some(line)) = lines.next_line().await {
        let mut guard = logs_ref.lock().await;
        guard.push(format!("[stderr] {}", line));
        if guard.len() > MAX_LOG_LINES {
          let drain = guard.len() - MAX_LOG_LINES;
          guard.drain(0..drain);
        }
      }
    }
  });

  manager.child = Some(child);
  manager.log_handle = Some(log_handle);
  manager.pid = Some(pid);

  Ok(pid)
}

/// Kill the managed child process and abort its log task.
pub async fn stop_dsh_web(manager: &mut ServerManager) {
  if let Some(child) = manager.child.as_mut() {
    let _ = child.kill().await;
    let _ = child.wait().await;
  }
  if let Some(handle) = manager.log_handle.take() {
    handle.abort();
  }
  manager.child = None;
  manager.pid = None;
}

/// Build a status snapshot from current manager state + port check.
pub async fn build_status(manager: &ServerManager) -> ServerStatusInfo {
  let managed_alive = manager.child.as_ref().is_some();
  let port_open = is_port_open(DEFAULT_HOST, DEFAULT_PORT).await;

  let (state, external, pid) = if managed_alive {
    (ServerState::RunningManaged, false, manager.pid)
  } else if port_open {
    (ServerState::RunningExternal, true, None)
  } else {
    (ServerState::Stopped, false, None)
  };

  let url = if state != ServerState::Stopped {
    Some(format!("http://{}:{}/", DEFAULT_HOST, DEFAULT_PORT))
  } else {
    None
  };

  let log_lines = manager.get_logs().await;

  ServerStatusInfo {
    state,
    port: Some(DEFAULT_PORT),
    url,
    pid,
    external,
    log_lines,
    error: None,
  }
}
