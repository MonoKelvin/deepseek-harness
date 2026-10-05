use std::collections::VecDeque;
#[cfg(target_os = "windows")]
use std::ffi::OsStr;
use std::io;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{Duration, Instant};

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

const DEFAULT_HOST: &str = "127.0.0.1";
const MAX_LOG_ENTRIES: usize = 200;
/// Grace period for a terminated process tree to release the port before the
/// socket owner is terminated instead.
const PORT_RELEASE_GRACE: Duration = Duration::from_millis(500);
/// How long a stop waits for the port owner to release the port.
const PORT_RELEASE_TIMEOUT: Duration = Duration::from_secs(5);
/// Attempts to terminate the port owner, re-resolving it after each attempt.
const PORT_OWNER_ROUNDS: usize = 3;

/// Event the launcher emits for each appended log entry, so the UI renders a
/// line as it is produced instead of on the next status poll.
pub const LOG_ENTRY_EVENT: &str = "log-entry";

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
///
/// `app` is set once during setup; entries appended before then stay in the
/// buffer and reach the UI through the first status snapshot.
pub struct LogBuffer {
  entries: VecDeque<LogEntry>,
  next_id: u64,
  app: Option<tauri::AppHandle>,
}

pub type SharedLogBuffer = Arc<Mutex<LogBuffer>>;

pub fn new_log_buffer() -> SharedLogBuffer {
  Arc::new(Mutex::new(LogBuffer {
    entries: VecDeque::with_capacity(MAX_LOG_ENTRIES),
    next_id: 1,
    app: None,
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

/// Attach the app handle that log entries are emitted to. Called once during setup.
pub async fn attach_log_emitter(logs: &SharedLogBuffer, app: tauri::AppHandle) {
  logs.lock().await.app = Some(app);
}

/// Append an entry to the buffer and push it to the UI immediately.
pub async fn append_log(logs: &SharedLogBuffer, source: LogSource, severity: LogSeverity, message: impl Into<String>) {
  let (entry, app) = {
    let mut buffer = logs.lock().await;
    let id = buffer.next_id;
    buffer.next_id = id.checked_add(1).expect("log entry ID exhausted");
    if buffer.entries.len() == MAX_LOG_ENTRIES {
      buffer.entries.pop_front();
    }
    let entry = LogEntry { id, source, severity, timestamp: now_timestamp(), message: message.into() };
    buffer.entries.push_back(entry.clone());
    (entry, buffer.app.clone())
  };
  if let Some(app) = app {
    let _ = app.emit(LOG_ENTRY_EVENT, &entry);
  }
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

/// Reap a managed child that exited on its own, clearing its handle, PID, and
/// log task so a dead process is not reported as still running. Returns whether
/// a managed child is still alive afterwards.
fn reap_if_exited(manager: &mut ServerManager) -> bool {
  let Some(child) = manager.child.as_mut() else { return false };
  match child.try_wait() {
    Ok(Some(_status)) => {
      if let Some(handle) = manager.log_handle.take() {
        handle.abort();
      }
      manager.child = None;
      manager.pid = None;
      false
    }
    // Still running, or the status could not be read — assume alive rather than
    // risk spawning a second tree over a live one.
    Ok(None) | Err(_) => true,
  }
}

/// Resolve the DSH root from the user-configured directory or auto-detection.
pub fn repo_root_from_settings(settings: &AppSettings) -> String {
  if let Some(path) = resolve_dsh_root(settings) {
    return path;
  }
  // Nothing configured or detected: search the binary's and the working
  // directory's ancestors for the workspace marker (`pnpm-workspace.yaml`),
  // which identifies the DSH root when running from source via `tauri dev`.
  let starts = [std::env::current_exe().ok(), std::env::current_dir().ok()];
  for start in starts.into_iter().flatten() {
    for ancestor in start.ancestors() {
      if ancestor.join("pnpm-workspace.yaml").exists() {
        return ancestor.to_string_lossy().to_string();
      }
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
///
/// On Windows, child processes spawned with GNU toolchain can show console
/// windows. We set `CREATE_NO_WINDOW` flag to prevent this.
#[cfg(target_os = "windows")]
fn pnpm_command(locale: &str) -> Result<tokio::process::Command, String> {
  use std::os::windows::process::CommandExt;

  let search_path = std::env::var_os("PATH").unwrap_or_default();
  let extensions = std::env::var("PATHEXT").unwrap_or_else(|_| DEFAULT_PATHEXT.to_string());
  let program = resolve_in_path("pnpm", &search_path, &extensions)
    .ok_or_else(|| crate::state::t_log(locale, "pnpm.missing", &[]))?;

  let mut cmd = tokio::process::Command::new(program);
  // Set creation flags to prevent console window from appearing
  // CREATE_NO_WINDOW = 0x08000000
  cmd.creation_flags(0x0800_0000);
  Ok(cmd)
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
  // A managed server already running must not be overwritten: tokio does not
  // kill a `Child` on drop, so replacing the handle would orphan the previous
  // process tree and leak its log task. Reap first in case it exited on its own.
  if reap_if_exited(manager) {
    if let Some(pid) = manager.pid {
      return Ok(pid);
    }
  }
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
/// port. Terminating only the direct child leaves that server running and
/// holding the port.
///
/// The exit status is not trusted, because `/T` reports 128 both for a tree that
/// has already exited and for one taskkill was refused. The stop verifies the
/// port instead, and a port owner the launcher may not terminate is reported by
/// `terminate_listener`.
#[cfg(target_os = "windows")]
async fn terminate_process_tree(pid: u32) -> io::Result<()> {
  use std::os::windows::process::CommandExt;
  tokio::process::Command::new("taskkill")
    .args(["/F", "/T", "/PID", &pid.to_string()])
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
    .status()
    .await
    .map(|_| ())
}

/// Terminate the single process `netstat` attributes a port to.
///
/// The process is terminated through `OpenProcess`/`TerminateProcess` rather than
/// `taskkill`. A refusal then carries the Win32 code that explains it, whereas a
/// `taskkill` exit status reports 128 both for a target that is already gone and
/// for one it was refused. `/T` is unnecessary here: a listening socket handed to a
/// surviving child is caught by the next round of `stop_port_owner`.
#[cfg(target_os = "windows")]
async fn terminate_listener(pid: u32) -> io::Result<()> {
  use windows::Win32::Foundation::CloseHandle;
  use windows::Win32::System::Threading::{OpenProcess, TerminateProcess, PROCESS_TERMINATE};
  let handle = unsafe { OpenProcess(PROCESS_TERMINATE, false.into(), pid) }
    .map_err(|error| io::Error::other(format!("cannot open process {pid}: {error}")))?;
  let terminated = unsafe { TerminateProcess(handle, 1) };
  let _ = unsafe { CloseHandle(handle) };
  terminated.map_err(|error| io::Error::other(format!("cannot terminate process {pid}: {error}")))
}

/// Stop the server and dispose the managed child before returning.
///
/// A server the launcher started is stopped through its own process tree. When
/// the port is still held afterwards — a server another program started, or one
/// the tree kill could not reach — the socket owner is terminated instead, since
/// it is the only remaining handle on the process holding the port.
pub async fn stop_dsh_web(manager: &mut ServerManager, settings: &crate::state::AppSettings) -> Result<(), String> {
  let locale = crate::state::current_locale(settings);
  let port = settings.port;
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
    // The tree kill above already terminated the direct child, so only reap it
    // (a second `kill` on an exited child can report a spurious failure).
    if let Some(child) = manager.child.as_mut() {
      let _ = child.wait().await;
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    if let Some(child) = manager.child.as_mut() {
      if let Err(error) = child.kill().await {
        let error = format!("Failed to stop dsh web: {error}");
        log_command_result(&manager.logs, &locale, "stop", Err(&error)).await;
        return Err(error);
      }
    }
  }
  if let Some(handle) = manager.log_handle.take() {
    handle.abort();
    let _ = handle.await;
  }
  manager.child = None;
  manager.pid = None;
  if !await_port_released(port, PORT_RELEASE_GRACE).await {
    let stopped = match stop_port_owner(&manager.logs, &locale, port).await {
      Ok(stopped) => stopped,
      Err(error) => {
        let error = format!("Failed to stop dsh web: {error}");
        log_command_result(&manager.logs, &locale, "stop", Err(&error)).await;
        return Err(error);
      }
    };
    // Report the stop only once the socket is free, so the next status poll
    // cannot still see the stopped server as running. A port that accepts
    // connections with no listed owner is a different failure from one whose
    // owner kept the socket, and only the second has an actionable cause.
    if !await_port_released(port, PORT_RELEASE_TIMEOUT).await {
      let key = if stopped.is_empty() { "process.owner.missing" } else { "process.port.held" };
      let error = crate::state::t_log(&locale, key, &[("port", &port.to_string())]);
      // What still holds the port separates a port taken over from a terminate
      // that did not take effect, which the failure alone cannot.
      let remaining = listening_owners(port).await.unwrap_or_default();
      if !remaining.is_empty() {
        let pids = remaining.iter().map(u32::to_string).collect::<Vec<_>>().join(", ");
        append_log(&manager.logs, LogSource::Launcher, LogSeverity::Warn, crate::state::t_log(&locale, "process.port.listeners", &[("port", &port.to_string()), ("pids", &pids)])).await;
      }
      log_command_result(&manager.logs, &locale, "stop", Err(&error)).await;
      return Err(error);
    }
  }
  log_command_result(&manager.logs, &locale, "stop", Ok(())).await;
  Ok(())
}

/// Wait out `timeout` for the stopped server to release `port`, so a following
/// start does not race the socket it still holds. Returns whether it was released.
async fn await_port_released(port: u16, timeout: Duration) -> bool {
  let deadline = Instant::now() + timeout;
  loop {
    if !is_port_open(DEFAULT_HOST, port).await {
      return true;
    }
    if Instant::now() >= deadline {
      return false;
    }
    tokio::time::sleep(Duration::from_millis(50)).await;
  }
}

/// Read the PIDs `netstat` attributes the listening sockets of `port` to.
#[cfg(target_os = "windows")]
async fn listening_owners(port: u16) -> io::Result<Vec<u32>> {
  use std::os::windows::process::CommandExt;
  let output = tokio::process::Command::new("netstat")
    .args(["-ano", "-p", "tcp"])
    .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
    .output()
    .await?;
  let text = String::from_utf8_lossy(&output.stdout);
  let suffix = format!(":{port}");
  let mut owners = Vec::new();
  for line in text.lines() {
    // Columns: Proto, Local Address, Foreign Address, State, PID. A listening row's
    // foreign address is `0.0.0.0:0`, so only the local column can end in the port.
    let columns: Vec<&str> = line.split_whitespace().collect();
    if columns.len() < 5 || columns[3] != "LISTENING" || !columns[1].ends_with(&suffix) {
      continue;
    }
    if let Ok(pid) = columns[4].parse::<u32>() {
      owners.push(pid);
    }
  }
  Ok(owners)
}

/// A listening socket has no name to search for, so Windows maps it to its owner
/// through `netstat -ano`, and each owner is terminated by `terminate_listener`.
///
/// Every attempt is recorded with its PID, because a port that stays busy after a
/// successful termination is otherwise visible only as its final failure. Returns
/// the owners that were asked to stop.
#[cfg(target_os = "windows")]
async fn terminate_port_listener(logs: &SharedLogBuffer, locale: &str, port: u16) -> io::Result<Vec<u32>> {
  let owners = listening_owners(port).await?;
  for pid in &owners {
    terminate_listener(*pid).await?;
    append_log(logs, LogSource::Launcher, LogSeverity::Info, crate::state::t_log(locale, "process.kill.result", &[("port", &port.to_string()), ("pid", &pid.to_string())])).await;
  }
  Ok(owners)
}

/// Read the PIDs `lsof` attributes the listening sockets of `port` to.
#[cfg(not(target_os = "windows"))]
async fn listening_owners(port: u16) -> io::Result<Vec<u32>> {
  let output = tokio::process::Command::new("lsof")
    .args(["-ti", &format!("tcp:{port}"), "-sTCP:LISTEN"])
    .output()
    .await?;
  Ok(String::from_utf8_lossy(&output.stdout)
    .lines()
    .filter_map(|line| line.trim().parse::<u32>().ok())
    .collect())
}

/// Terminate the process listening on `port` through `lsof`.
///
/// Each attempt is recorded, matching the Windows path. Platforms without `lsof`
/// surface the spawn error, which the caller reports as a stop failure.
#[cfg(not(target_os = "windows"))]
async fn terminate_port_listener(logs: &SharedLogBuffer, locale: &str, port: u16) -> io::Result<Vec<u32>> {
  let owners = listening_owners(port).await?;
  for pid in &owners {
    tokio::process::Command::new("kill").args(["-TERM", &pid.to_string()]).status().await?;
    append_log(logs, LogSource::Launcher, LogSeverity::Info, crate::state::t_log(locale, "process.kill.result", &[("port", &port.to_string()), ("pid", &pid.to_string())])).await;
  }
  Ok(owners)
}

/// Terminate whatever holds `port`, re-resolving the owner after each round.
///
/// One round is not always enough. The process `netstat` attributes a port to can
/// change between rounds — a shell shim hands the listening socket to a surviving
/// child, a supervisor restarts the server — and each round can only terminate what
/// owns the port at that moment. Returns the PIDs that were asked to stop, in order.
async fn stop_port_owner(logs: &SharedLogBuffer, locale: &str, port: u16) -> io::Result<Vec<u32>> {
  let mut stopped = Vec::new();
  for _ in 0..PORT_OWNER_ROUNDS {
    if !is_port_open(DEFAULT_HOST, port).await {
      break;
    }
    let round = terminate_port_listener(logs, locale, port).await?;
    if round.is_empty() {
      // The port accepts connections but nothing is attributed to it, so another
      // round cannot terminate anything either.
      break;
    }
    stopped.extend(round);
    if await_port_released(port, PORT_RELEASE_GRACE).await {
      break;
    }
  }
  Ok(stopped)
}

/// Release the process lock before collecting logs and probing the port.
pub async fn build_status(shared: &SharedManager, dsh_directory_valid: bool, port: u16) -> ServerStatusInfo {
  let (managed_alive, managed_pid, logs) = {
    let mut manager = shared.lock().await;
    // Reap a server that exited on its own so a dead child is not reported as
    // running with a stale PID.
    let alive = reap_if_exited(&mut manager);
    (alive, manager.pid, manager.logs.clone())
  };
  let port_open = is_port_open(DEFAULT_HOST, port).await;
  let (state, external, pid) = if managed_alive {
    (ServerState::RunningManaged, false, managed_pid)
  } else if port_open {
    (ServerState::RunningExternal, true, None)
  } else {
    (ServerState::Stopped, false, None)
  };
  let url = if state != ServerState::Stopped {
    Some(format!("http://{DEFAULT_HOST}:{port}/"))
  } else {
    None
  };
  ServerStatusInfo {
    state, port: Some(port), url, pid, external,
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

  /// A server another program started has no recorded PID, so the stop path can
  /// only reach it through the port owner that `netstat` reports.
  #[cfg(target_os = "windows")]
  #[tokio::test]
  async fn stopping_an_unmanaged_server_terminates_the_port_owner() {
    let probe = std::net::TcpListener::bind((DEFAULT_HOST, 0)).unwrap();
    let port = probe.local_addr().unwrap().port();
    drop(probe);
    let serve = format!("require('net').createServer().listen({port}, '{DEFAULT_HOST}')");
    let mut child = tokio::process::Command::new("node")
      .args(["-e", &serve])
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .unwrap();
    assert!(settles_to_port(port, true).await, "the stand-in server holds the port");

    let logs = new_log_buffer();
    assert!(!terminate_port_listener(&logs, "zh", port).await.unwrap().is_empty(), "the port owner was found");
    assert!(settles_to_port(port, false).await, "the port owner stopped");

    let _ = child.wait().await;
  }

  /// Poll until `port` reaches the expected state.
  #[cfg(target_os = "windows")]
  async fn settles_to_port(port: u16, open: bool) -> bool {
    for _ in 0..200 {
      if is_port_open(DEFAULT_HOST, port).await == open {
        return true;
      }
      tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
  }
}
