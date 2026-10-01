use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub dsh_directory: Option<String>,
    pub theme: String,
    pub locale: String,
    /// Whether the launcher starts at sign-in. The OS autostart entry is the
    /// authoritative source, so this is recomputed from the plugin on every
    /// `get_settings` call. It is serialized to the frontend (so the toggle
    /// reflects reality) but stripped before persisting to `settings.json`,
    /// which must never become the source of truth.
    #[serde(default)]
    pub autostart: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            dsh_directory: None,
            theme: "system".to_string(),
            locale: "zh".to_string(),
            autostart: false,
        }
    }
}

pub type SharedSettings = Arc<Mutex<AppSettings>>;

fn settings_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle
        .path()
        .config_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    path.push("deepseek-harness-launcher");
    path.push("settings.json");
    path
}

pub fn load_settings(app_handle: &tauri::AppHandle) -> AppSettings {
    let path = settings_path(app_handle);
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    let mut settings = AppSettings::default();
    settings.dsh_directory = detect_dsh_directory();
    settings
}

pub fn save_settings(app_handle: &tauri::AppHandle, settings: &AppSettings) {
    let path = settings_path(app_handle);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // The OS autostart entry is the only source of truth for `autostart`; keep
    // it out of the persisted file so a stale value can never override reality.
    let value = match serde_json::to_value(settings) {
        Ok(mut value) => {
            if let Some(object) = value.as_object_mut() {
                object.remove("autostart");
            }
            value
        }
        Err(_) => return,
    };
    if let Ok(content) = serde_json::to_string_pretty(&value) {
        let _ = std::fs::write(&path, content);
    }
}

/// Auto-detect the DSH workspace root directory.
/// Searches common locations: binary parent dirs, common workspace paths.
pub fn detect_dsh_directory() -> Option<String> {
    let candidates: Vec<PathBuf> = {
        let mut paths = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            let mut dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
            for _ in 0..4 {
                paths.push(dir.clone());
                if let Some(parent) = dir.parent() {
                    dir = parent.to_path_buf();
                } else {
                    break;
                }
            }
        }
        if let Ok(cwd) = std::env::current_dir() {
            paths.push(cwd);
        }
        #[cfg(target_os = "windows")]
        {
            if let Some(user) = std::env::var_os("USERPROFILE") {
                let mut code = PathBuf::from(user);
                code.push("code");
                paths.push(code.clone());
                code.push("deepseek-harness");
                paths.push(code);
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Some(home) = std::env::var_os("HOME") {
                let mut code = PathBuf::from(home);
                code.push("code");
                paths.push(code.clone());
                code.push("deepseek-harness");
                paths.push(code);
            }
        }
        paths
    };

    for dir in &candidates {
        if is_valid_dsh_root(dir) {
            return Some(dir.to_string_lossy().to_string());
        }
    }
    None
}

/// A valid DSH root contains pnpm-workspace.yaml and the apps/cli directory.
pub fn is_valid_dsh_root(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    if !dir.join("pnpm-workspace.yaml").exists() {
        return false;
    }
    if !dir.join("apps/cli").is_dir() {
        return false;
    }
    true
}

/// Resolve the effective DSH root: the user-specified directory if valid,
/// otherwise fall back to auto-detection.
pub fn resolve_dsh_root(settings: &AppSettings) -> Option<String> {
    if let Some(ref dir) = settings.dsh_directory {
        let path = std::path::Path::new(dir);
        if is_valid_dsh_root(path) {
            return Some(dir.clone());
        }
    }
    detect_dsh_directory()
}

/// Locale tag used for backend-originated log messages. Mirrors the frontend's
/// `Locale` so launcher prose stays consistent with the UI language.
pub fn current_locale(settings: &AppSettings) -> &'static str {
    if settings.locale == "en" { "en" } else { "zh" }
}

/// Translate a launcher-originated log message by key, substituting `{name}`
/// placeholders from `args`. Keys mirror the frontend i18n dictionary so the
/// backend and UI share one vocabulary.
pub fn t_log(locale: &str, key: &str, args: &[(&str, &str)]) -> String {
    let dict: &[(&str, &str)] = if locale == "en" {
        &[
            ("dsh.unknown", "Cannot identify the project's DSH directory or the specified DSH directory is invalid; the app cannot run."),
            ("dsh.detected", "Auto-detected DSH directory: {dir}"),
            ("dsh.using", "Using DSH directory: {dir}"),
            ("dsh.set.invalid", "The specified directory is not a valid DSH project root."),
            ("dsh.set.success", "DSH directory updated successfully."),
            ("autostart.enabled", "The launcher will now start silently on sign-in."),
            ("autostart.disabled", "The launcher will no longer start automatically when you sign in."),
            ("link.shell", "The launcher runs elevated, so the link was handed to Explorer to open the browser without elevated rights."),
            ("command.start", "Starting command: {command}"),
            ("command.succeeded", "Command succeeded: {command}"),
            ("command.failed", "Command failed: {command}: {error}"),
            ("pnpm.missing", "pnpm was not found on PATH. Install pnpm, or add it to PATH and restart the launcher."),
            ("process.started", "Process started (PID {pid})"),
            ("process.restarted", "Process restarted (PID {pid})"),
            ("process.kill.result", "Terminating the process holding port {port} (PID {pid})..."),
            ("process.port.held", "Port {port} is still in use after its process was terminated, so another program took it over."),
            ("process.port.listeners", "Processes still listening on port {port}: {pids}"),
            ("process.owner.missing", "Port {port} accepts connections but lists no owning process, so the stop could not identify its target."),
            ("process.stop.failed", "Failed to stop dsh web: {error}"),
            ("stream.read.failed", "Failed to read {source}: {error}"),
        ]
    } else {
        &[
            ("dsh.unknown", "无法识别系统中的DSH目录或指定无效的DSH目录，软件无法正常运行"),
            ("dsh.detected", "自动识别DSH目录：{dir}"),
            ("dsh.using", "使用DSH目录：{dir}"),
            ("dsh.set.invalid", "指定的目录不是有效的DSH项目根目录"),
            ("dsh.set.success", "DSH目录设置成功"),
            ("autostart.enabled", "已开启开机自启，登录系统后将自动静默运行"),
            ("autostart.disabled", "已关闭开机自启"),
            ("link.shell", "启动器以管理员权限运行，已交由资源管理器以普通权限打开浏览器"),
            ("command.start", "开始执行命令：{command}"),
            ("command.succeeded", "命令执行成功：{command}"),
            ("command.failed", "命令执行失败：{command}：{error}"),
            ("pnpm.missing", "未在 PATH 中找到 pnpm，请安装 pnpm 或将其加入 PATH 后重启启动器"),
            ("process.started", "进程已启动（PID {pid}）"),
            ("process.restarted", "进程已重启（PID {pid}）"),
            ("process.kill.result", "正在终止占用端口 {port} 的进程（PID {pid}）..."),
            ("process.port.held", "终止进程后端口 {port} 仍被占用，端口已被其他程序接管"),
            ("process.port.listeners", "仍在监听端口 {port} 的进程：{pids}"),
            ("process.owner.missing", "端口 {port} 仍可连接，但未列出占用它的进程，停止操作无法确定目标"),
            ("process.stop.failed", "停止 dsh web 失败：{error}"),
            ("stream.read.failed", "读取{source}失败：{error}"),
        ]
    };
    let mut message = dict.iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v.to_string())
        .unwrap_or_else(|| key.to_string());
    for (name, value) in args {
        message = message.replace(&format!("{{{name}}}"), value);
    }
    message
}
