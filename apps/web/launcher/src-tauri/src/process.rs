use std::collections::VecDeque;
#[cfg(target_os = "windows")]
use std::ffi::OsStr;
use std::io;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::state::{AppSettings, resolve_dsh_root};

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
  pub dsh_directory_valid: bool,
  pub log_entries: Vec<LogEntry>,
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
const MAX_LOG_ENTRIES: usize = 200;

/// Executable suffixes to try when the host does not define `PATHEXT`.
#[cfg(target_os = "windows")]
const DEFAULT_PATHEXT: &str = ".COM;.EXE;.BAT;.CMD";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LogSource {
  Launcher,
  Stdout,
  Stderr,
}

impl std::fmt::Display for LogSource {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter.write_str(match self {
      Self::Launcher => "launcher",
      Self::Stdout => "stdout",
      Self::Stderr => "stderr",
    })
  }
}

/// Log severity level for structured log entries.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LogSeverity {
  Info,
  Warn,
  Error,
  Debug,
}

impl Default for LogSeverity {
  fn default() -> Self { Self::Info }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
  pub id: u64,
  pub source: LogSource,
  pub severity: LogSeverity,
  pub timestamp: String,
  pub message: String,
}

/// Keeps the latest entries without reusing IDs after eviction or server restarts.
pub struct LogBuffer {
  entries: VecDeque<LogEntry>,
  next_id: u64,
}

pub type SharedLogBuffer = Arc<Mutex<LogBuffer>>;

pub fn new_log_buffer() -> SharedLogBuffer {
  Arc::new(Mutex::new(LogBuffer {
    entries: VecDeque::with_capacity(MAX_LOG_ENTRIES),
    next_id: 1,
  }))
}

fn now_timestamp() -> String {
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap_or_default();
  let secs = now.as_secs();
  let millis = now.subsec_millis();
  let dt = chrono::DateTime::from_timestamp(secs as i64, 0)
    .unwrap_or(chrono::DateTime::from_timestamp(0, 0).unwrap());
  dt.format("%Y-%m-%d %H:%M:%S").to_string() + &format!(".{:03}", millis)
}

pub async fn append_log(logs: &SharedLogBuffer, source: LogSource, severity: LogSeverity, message: impl Into<String>) {
  let timestamp = now_timestamp();
  let mut buffer = logs.lock().await;
  let id = buffer.next_id;
  buffer.next_id = id.checked_add(1).expect("log entry ID exhausted");
  if buffer.entries.len() == MAX_LOG_ENTRIES {
    buffer.entries.pop_front();
  }
  buffer.entries.push_back(LogEntry { id, source, severity, timestamp, message: message.into() });
}

pub async fn log_entries(logs: &SharedLogBuffer) -> Vec<LogEntry> {
  logs.lock().await.entries.iter().cloned().collect()
}

/// Records an outcome without repeating the command's streamed output.
/// `locale` selects the language for the outcome message; streamed pnpm output
/// is intentionally left untranslated as tool output.
pub async fn log_command_result(logs: &SharedLogBuffer, locale: &str, command: &str, result: Result<(), &str>) {
  let (severity, message) = match result {
    Ok(()) => (LogSeverity::Info, crate::state::t_log(locale, "command.succeeded", &[("command", command)])),
    Err(error) => (LogSeverity::Error, crate::state::t_log(locale, "command.failed", &[("command", command), ("error", error)])),
  };
  append_log(logs, LogSource::Launcher, severity, message).await;
}

pub async fn clear_logs(logs: &SharedLogBuffer) {
  let mut buffer = logs.lock().await;
  buffer.entries.clear();
}

/// Manages the dsh web child process, logs, and PID.
pub struct ServerManager {
  pub child: Option<tokio::process::Child>,
  pub log_handle: Option<JoinHandle<()>>,
  pub logs: SharedLogBuffer,
  pub pid: Option<u32>,
}

impl ServerManager {
  pub fn new() -> Self {
    Self {
      child: None,
      log_handle: None,
      logs: new_log_buffer(),
      pid: None,
    }
  }
}

/// Shared app state injected via Tauri's managed state system.
pub type SharedManager = Arc<Mutex<ServerManager>>;

/// Resolve the repository root from the launcher's install location or working directory.
pub fn repo_root() -> String {
  repo_root_from_settings(&AppSettings::default())
}

/// Resolve the DSH root from the user-configured directory or auto-detection.
pub fn repo_root_from_settings(settings: &AppSettings) -> String {
  if let Some(path) = resolve_dsh_root(settings) {
    return path;
  }
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
    if std::path::Path::new(&root).join("pnpm-workspace.yaml").exists()
      || std::path::Path::new(&root).join("Cargo.toml").exists()
    {
      return root;
    }
  }
  std::env::current_dir()
    .map(|p| p.to_string_lossy().to_string())
    .unwrap_or_else(|_| ".".to_string())
}

/// Check if a TCP port is accepting connections — used to detect external servers.
pub async fn is_port_open(host: &str, port: u16) -> bool {
  let addr = format!("{}:{}", host, port);
  tokio::net::TcpStream::connect(&addr).await.is_ok()
}

/// Terminate any stale vite dev servers that might be blocking port 5173.
/// This handles the case where a previous `tauri:dev` was interrupted.
pub fn terminate_vite_dev_servers() {
  // On Windows, find and kill any node/vite processes on port 5173
  #[cfg(target_os = "windows")]
  {
    use std::process::Command;
    let result = Command::new("netstat")
      .args(["-ano", "-p", "tcp"])
      .output();
    if let Ok(output) = result {
      let stdout = String::from_utf8_lossy(&output.stdout);
      for line in stdout.lines().skip(1) {
        if line.trim().ends_with("LISTENING") && line.contains(":5173 ") {
          let parts: Vec<&str> = line.split_whitespace().collect();
          if parts.len() >= 5 {
            let pid: u32 = match parts[4].parse() {
              Ok(p) => p,
              Err(_) => continue,
            };
            let _ = Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output();
          }
        }
      }
    }
  }
}

async fn read_stream(
  stream: impl AsyncRead + Unpin,
  logs: &SharedLogBuffer,
  source: LogSource,
  locale: &str,
  mut captured: Option<&mut Vec<u8>>,
) -> io::Result<()> {
  let mut reader = BufReader::new(stream);
  let mut line = Vec::new();
  loop {
    line.clear();
    let result = reader.read_until(b'\n', &mut line).await;
    if !line.is_empty() {
      if let Some(output) = captured.as_mut() {
        output.extend_from_slice(&line);
      }
      let mut message = String::from_utf8_lossy(&line).into_owned();
      if message.ends_with('\n') {
        message.pop();
        if message.ends_with('\r') {
          message.pop();
        }
      }
      let severity = match source {
        LogSource::Stderr => LogSeverity::Warn,
        _ => LogSeverity::Info,
      };
      append_log(logs, source, severity, message).await;
    }
    match result {
      Ok(0) => return Ok(()),
      Ok(_) => {}
      Err(error) => {
        let source_str = source.to_string();
        let message = crate::state::t_log(locale, "stream.read.failed", &[("source", &source_str), ("error", &error.to_string())]);
        append_log(logs, LogSource::Launcher, LogSeverity::Error, message).await;
        return Err(error);
      }
    }
  }
}

async fn drain_streams(
  stdout: impl AsyncRead + Unpin,
  stderr: impl AsyncRead + Unpin,
  logs: &SharedLogBuffer,
  locale: &str,
  captured: Option<(&mut Vec<u8>, &mut Vec<u8>)>,
) -> (io::Result<()>, io::Result<()>) {
  let (stdout_capture, stderr_capture) = match captured {
    Some((stdout, stderr)) => (Some(stdout), Some(stderr)),
    None => (None, None),
  };
  tokio::join!(
    read_stream(stdout, logs, LogSource::Stdout, locale, stdout_capture),
    read_stream(stderr, logs, LogSource::Stderr, locale, stderr_capture),
  )
}

/// Find `program` under `search_path`, appending each `extensions` suffix in order.
/// Suffixes carry their leading dot, matching the `PATHEXT` format.
#[cfg(target_os = "windows")]
fn resolve_in_path(program: &str, search_path: &OsStr, extensions: &str) -> Option<PathBuf> {
  for dir in std::env::split_paths(search_path) {
    if dir.as_os_str().is_empty() {
      continue;
    }
    for ext in extensions.split(';').filter(|ext| !ext.is_empty()) {
      let candidate = dir.join(format!("{program}{ext}"));
      if candidate.is_file() {
        return Some(candidate);
      }
    }
  }
  None
}

/// Build the command that runs pnpm, or a localized reason pnpm cannot be located.
///
/// Windows resolves bare command names through `PATHEXT`, but Rust's process
/// spawning only appends `.exe`, so the `pnpm.cmd` shim that npm and corepack
/// install reports "program not found". Spawning the resolved path works because
/// `CreateProcess` runs a batch file through `cmd.exe` and Rust escapes the
/// arguments for it.
#[cfg(target_os = "windows")]
fn pnpm_command(locale: &str) -> Result<tokio::process::Command, String> {
  let search_path = std::env::var_os("PATH").unwrap_or_default();
  let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_PATHEXT.to_string());
  let program = resolve_in_path("pnpm", &search_path, &extensions)
    .ok_or_else(|| crate::state::t_log(locale, "pnpm.missing", &[]))?;
  Ok(tokio::process::Command::new(program))
}

/// Build the command that runs pnpm. `PATH` lookup needs no suffix handling here,
/// so an unresolvable name surfaces as the spawn error.
#[cfg(not(target_os = "windows"))]
fn pnpm_command(_locale: &str) -> Result<tokio::process::Command, String> {
  Ok(tokio::process::Command::new("pnpm"))
}

/// Stream a short-lived pnpm command into shared logs and retain its output for the result.
pub async fn run_pnpm(args: &[&str], logs: &SharedLogBuffer, settings: &crate::state::AppSettings) -> CommandOutput {
  let locale = crate::state::current_locale(settings);
  let command = format!("pnpm {}", args.join(" "));
  append_log(logs, LogSource::Launcher, LogSeverity::Info, crate::state::t_log(&locale, "command.start", &[("command", &command)])).await;
  let root = repo_root_from_settings(settings);
  let mut pnpm = match pnpm_command(&locale) {
    Ok(pnpm) => pnpm,
    Err(error) => {
      log_command_result(logs, &locale, &command, Err(&error)).await;
      return CommandOutput { success: false, stdout: String::new(), stderr: error };
    }
  };
  let mut child = match pnpm
    .args(args)
    .current_dir(&root)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(child) => child,
    Err(error) => {
      let error = format!("Failed to execute pnpm: {}", error);
      log_command_result(logs, &locale, &command, Err(&error)).await;
      return CommandOutput { success: false, stdout: String::new(), stderr: error };
    }
  };

  let stdout = child.stdout.take().expect("piped child stdout");
  let stderr = child.stderr.take().expect("piped child stderr");
  let mut stdout_bytes = Vec::new();
  let mut stderr_bytes = Vec::new();
  let ((stdout_result, stderr_result), status) = tokio::join!(
    drain_streams(stdout, stderr, logs, &locale, Some((&mut stdout_bytes, &mut stderr_bytes))),
    child.wait(),
  );

  let mut errors = Vec::new();
  if let Err(error) = stdout_result {
    errors.push(format!("Failed to read stdout: {}", error));
  }
  if let Err(error) = stderr_result {
    errors.push(format!("Failed to read stderr: {}", error));
  }
  match status {
    Ok(status) if !status.success() => {
      errors.push(format!("Command exited with code: {}", status.code().unwrap_or(-1)));
    }
    Err(error) => errors.push(format!("Failed to wait for pnpm: {}", error)),
    Ok(_) => {}
  }

  let success = errors.is_empty();
  let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
  let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();
  let error = errors.join("; ");
  log_command_result(logs, &locale, &command, if success { Ok(()) } else { Err(&error) }).await;
  let stderr = if !success && stderr.is_empty() { error } else { stderr };
  CommandOutput { success, stdout, stderr }
}

/// Spawn `pnpm dsh web` and drain both output pipes concurrently.
pub async fn start_dsh_web(manager: &mut ServerManager, settings: &crate::state::AppSettings) -> Result<u32, String> {
  let locale = crate::state::current_locale(settings);
  append_log(&manager.logs, LogSource::Launcher, LogSeverity::Info, crate::state::t_log(&locale, "command.start", &[("command", "pnpm dsh web")])).await;
  let mut pnpm = match pnpm_command(&locale) {
    Ok(pnpm) => pnpm,
    Err(error) => {
      log_command_result(&manager.logs, &locale, "pnpm dsh web", Err(&error)).await;
      return Err(error);
    }
  };
  let mut child = match pnpm
    .args(["dsh", "web"])
    .current_dir(repo_root_from_settings(settings))
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(child) => child,
    Err(error) => {
      let error = format!("Failed to start dsh web: {error}");
      log_command_result(&manager.logs, &locale, "pnpm dsh web", Err(&error)).await;
      return Err(error);
    }
  };
  let pid = child.id().expect("newly spawned child has a PID");
  let stdout = child.stdout.take().expect("piped child stdout");
  let stderr = child.stderr.take().expect("piped child stderr");
  let logs = manager.logs.clone();
  let locale_owned = locale.to_string();
  let log_handle = tokio::spawn(async move {
    let _ = drain_streams(stdout, stderr, &logs, &locale_owned, None).await;
  });
  manager.child = Some(child);
  manager.log_handle = Some(log_handle);
  manager.pid = Some(pid);
  append_log(&manager.logs, LogSource::Launcher, LogSeverity::Info, crate::state::t_log(&locale, "process.started", &[("pid", &pid.to_string())])).await;
  Ok(pid)
}

/// Terminate `pid` together with every process it started.
///
/// Windows reaches pnpm through its `pnpm.cmd` shim, so the launcher's direct
/// child is a `cmd.exe` whose descendants include the node server holding the
/// port. Terminating only the direct child leaves that server running, which the
/// launcher then reports as an external service it cannot stop. `taskkill`
/// reports a nonzero status when the tree has already exited, which is not a
/// stop failure, so only an inability to run it is an error.
#[cfg(target_os = "windows")]
async fn terminate_process_tree(pid: u32) -> io::Result<()> {
  tokio::process::Command::new("taskkill")
    .args(["/F", "/T", "/PID", &pid.to_string()])
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status()
    .await
    .map(|_| ())
}

/// Stop the managed child, then dispose its output task before returning.
pub async fn stop_dsh_web(manager: &mut ServerManager) -> Result<(), String> {
  let locale = crate::state::current_locale(&crate::state::AppSettings::default());
  // Take the descendants down first: terminating the direct child orphans them.
  #[cfg(target_os = "windows")]
  {
    if let Some(pid) = manager.pid {
      if let Err(error) = terminate_process_tree(pid).await {
        let error = format!("Failed to stop dsh web: {error}");
        log_command_result(&manager.logs, &locale, "stop", Err(&error)).await;
        return Err(error);
      }
    }
  }
  if let Some(child) = manager.child.as_mut() {
    if let Err(error) = child.kill().await {
      let error = format!("Failed to stop dsh web: {error}");
      log_command_result(&manager.logs, &locale, "stop", Err(&error)).await;
      return Err(error);
    }
  }
  if let Some(handle) = manager.log_handle.take() {
    handle.abort();
    let _ = handle.await;
  }
  manager.child = None;
  manager.pid = None;
  log_command_result(&manager.logs, &locale, "stop", Ok(())).await;
  Ok(())
}

/// Release the process lock before collecting logs and probing the port.
pub async fn build_status(shared: &SharedManager, dsh_directory_valid: bool) -> ServerStatusInfo {
  let (managed_alive, managed_pid, logs) = {
    let manager = shared.lock().await;
    (manager.child.is_some(), manager.pid, manager.logs.clone())
  };
  let port_open = is_port_open(DEFAULT_HOST, DEFAULT_PORT).await;
  let (state, external, pid) = if managed_alive {
    (ServerState::RunningManaged, false, managed_pid)
  } else if port_open {
    (ServerState::RunningExternal, true, None)
  } else {
    (ServerState::Stopped, false, None)
  };
  let url = if state != ServerState::Stopped {
    Some(format!("http://{DEFAULT_HOST}:{DEFAULT_PORT}/"))
  } else {
    None
  };
  ServerStatusInfo {
    state, port: Some(DEFAULT_PORT), url, pid, external,
    dsh_directory_valid,
    log_entries: log_entries(&logs).await,
    error: None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::{pin::Pin, task::{Context, Poll}, time::Duration};
  use tokio::io::{AsyncWriteExt, ReadBuf};

  #[tokio::test]
  async fn entries_keep_distinct_ids_for_repeated_messages_after_eviction() {
    let logs = new_log_buffer();
    for _ in 0..205 { append_log(&logs, LogSource::Stdout, LogSeverity::Info, "same message").await; }
    let entries = log_entries(&logs).await;
    assert_eq!(entries.len(), 200);
    assert_eq!(entries.first().unwrap().id, 6);
    assert_eq!(entries.last().unwrap().id, 205);
    assert!(entries.iter().all(|entry| entry.message == "same message"));
  }

  #[tokio::test]
  async fn stderr_is_read_while_stdout_remains_open() {
    let logs = new_log_buffer();
    let (stdout_reader, stdout_writer) = tokio::io::duplex(64);
    let (stderr_reader, mut stderr_writer) = tokio::io::duplex(64);
    let task_logs = logs.clone();
    let task = tokio::spawn(async move { drain_streams(stdout_reader, stderr_reader, &task_logs, "zh", None).await });
    stderr_writer.write_all(b"warning\n").await.unwrap();
    tokio::time::timeout(Duration::from_secs(1), async {
      while log_entries(&logs).await.is_empty() { tokio::task::yield_now().await; }
    }).await.unwrap();
    assert_eq!(log_entries(&logs).await[0].source, LogSource::Stderr);
    assert_eq!(log_entries(&logs).await[0].severity, LogSeverity::Warn);
    drop(stdout_writer);
    drop(stderr_writer);
    let (stdout, stderr) = task.await.unwrap();
    assert!(stdout.is_ok() && stderr.is_ok());
  }

  struct BrokenReader;
  impl AsyncRead for BrokenReader {
    fn poll_read(self: Pin<&mut Self>, _: &mut Context<'_>, _: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
      Poll::Ready(Err(io::Error::other("read failed")))
    }
  }

  #[tokio::test]
  async fn stream_failures_are_recorded() {
    let logs = new_log_buffer();
    assert!(read_stream(BrokenReader, &logs, LogSource::Stdout, "zh", None).await.is_err());
    assert!(log_entries(&logs).await[0].message.contains("read failed"));
    assert_eq!(log_entries(&logs).await[0].severity, LogSeverity::Error);
  }

  #[tokio::test]
  async fn success_without_output_still_produces_a_record() {
    let logs = new_log_buffer();
    log_command_result(&logs, "zh", "build", Ok(())).await;
    assert!(log_entries(&logs).await[0].message.contains("build"));
    assert_eq!(log_entries(&logs).await[0].severity, LogSeverity::Info);
  }

  #[cfg(target_os = "windows")]
  #[test]
  fn a_pnpm_shim_resolves_only_when_its_suffix_is_searched() {
    let dir = std::env::temp_dir().join(format!("dsh-launcher-pathext-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("pnpm.cmd"), "@echo off\n").unwrap();
    let search_path = std::env::join_paths([&dir]).unwrap();
    // PATHEXT casing reaches the resolved path, which Windows matches case-insensitively.
    let resolved = resolve_in_path("pnpm", &search_path, ".EXE;.CMD").expect("the shim resolves");
    assert_eq!(resolved.parent(), Some(dir.as_path()));
    assert!(resolved.file_name().unwrap().eq_ignore_ascii_case("pnpm.cmd"));
    assert_eq!(resolve_in_path("pnpm", &search_path, ".EXE"), None);
    std::fs::remove_dir_all(&dir).unwrap();
  }

  /// `tasklist` prints the image name only for a live match.
  #[cfg(target_os = "windows")]
  fn image_is_running(image: &str) -> bool {
    let output = std::process::Command::new("tasklist")
      .args(["/FI", &format!("IMAGENAME eq {image}"), "/NH"])
      .output()
      .expect("tasklist runs");
    String::from_utf8_lossy(&output.stdout).contains(image)
  }

  #[cfg(target_os = "windows")]
  async fn settles_to(image: &str, running: bool) -> bool {
    for _ in 0..100 {
      if image_is_running(image) == running {
        return true;
      }
      tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
  }

  #[cfg(target_os = "windows")]
  #[tokio::test]
  async fn stopping_a_shim_also_terminates_its_descendant() {
    let dir = std::env::temp_dir().join(format!("dsh-launcher-tree-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    // A uniquely named copy of ping stands in for the node server, so the
    // liveness check cannot match an unrelated process.
    let leaf_name = format!("dsh-leaf-{}.exe", std::process::id());
    let leaf = dir.join(&leaf_name);
    let system_root = std::env::var("SystemRoot").expect("Windows defines SystemRoot");
    std::fs::copy(PathBuf::from(system_root).join("System32").join("PING.EXE"), &leaf).unwrap();
    let shim = dir.join("leaf-shim.cmd");
    std::fs::write(&shim, format!("@echo off\r\n\"{}\" -n 60 127.0.0.1 >nul\r\n", leaf.display())).unwrap();

    let mut child = tokio::process::Command::new(&shim)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .unwrap();
    let pid = child.id().expect("newly spawned child has a PID");
    assert!(settles_to(&leaf_name, true).await, "the shim started its descendant");

    terminate_process_tree(pid).await.unwrap();
    assert!(settles_to(&leaf_name, false).await, "the descendant stopped with the tree");

    let _ = child.wait().await;
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[cfg(target_os = "windows")]
  #[tokio::test]
  async fn stopping_an_exited_tree_is_not_a_failure() {
    let mut child = tokio::process::Command::new("cmd").args(["/C", "exit"]).spawn().unwrap();
    let pid = child.id().expect("newly spawned child has a PID");
    child.wait().await.unwrap();
    assert!(terminate_process_tree(pid).await.is_ok());
  }
}
