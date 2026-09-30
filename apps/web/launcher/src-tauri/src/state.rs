use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub dsh_directory: Option<String>,
    pub theme: String,
    pub locale: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            dsh_directory: None,
            theme: "system".to_string(),
            locale: "zh".to_string(),
        }
    }
}

pub type SharedSettings = Arc<Mutex<AppSettings>>;

fn settings_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let mut path = app_handle
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
    if let Ok(content) = serde_json::to_string_pretty(settings) {
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
                let mut base = PathBuf::from(user);
                base.push("code");
                paths.push(base);
                base.push("deepseek-harness");
                paths.push(base);
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Some(home) = std::env::var_os("HOME") {
                let mut base = PathBuf::from(home);
                base.push("code");
                paths.push(base);
                base.push("deepseek-harness");
                paths.push(base);
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
pub fn is_valid_dsh_root(dir: &std::path::Path) -> bool {
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
