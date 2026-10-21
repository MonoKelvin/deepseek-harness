//! Data-home relocation for the harness process.
//!
//! The harness home can be moved to another directory. A pointer file at the
//! fixed default home (`~/.dsh/.data-location`) records where the data lives,
//! and a marker file (`~/.dsh/.data-cleanup`) records the previous directory.
//! The launcher starts the harness with `DSH_HOME` pointed at the recorded
//! location and removes the previous directory once the move is confirmed, so a
//! failed copy never destroys the source.

use std::fs;
use std::path::{Path, PathBuf};

/// File name of the data-location pointer, kept at the fixed default home root.
const DATA_LOCATION_FILE: &str = ".data-location";

/// File name of the deferred-cleanup marker recording the previous data directory.
const DATA_CLEANUP_FILE: &str = ".data-cleanup";

/// Directory name of the harness home under the user profile.
const DSH_HOME_DIR_NAME: &str = ".dsh";

/// The user profile directory.
fn user_home() -> Option<PathBuf> {
  #[cfg(target_os = "windows")]
  {
    std::env::var_os("USERPROFILE").map(PathBuf::from)
  }
  #[cfg(not(target_os = "windows"))]
  {
    std::env::var_os("HOME").map(PathBuf::from)
  }
}

/// The default harness home: `~/.dsh`.
fn default_home() -> Option<PathBuf> {
  Some(user_home()?.join(DSH_HOME_DIR_NAME))
}

/// Expand a leading `~` against the user profile.
fn expand_home(value: &str) -> PathBuf {
  if value == "~" {
    if let Some(home) = user_home() {
      return home;
    }
  }
  if let Some(rest) = value.strip_prefix("~/").or_else(|| value.strip_prefix("~\\")) {
    if let Some(home) = user_home() {
      return home.join(rest);
    }
  }
  PathBuf::from(value)
}

/// Read one control file as a single absolute path.
fn read_control_path(path: &Path) -> Option<PathBuf> {
  let raw = fs::read_to_string(path).ok()?;
  let value = raw.trim();
  if value.is_empty() {
    return None;
  }
  Some(expand_home(value))
}

/// The relocated data home recorded by the pointer, when that directory exists.
pub fn data_home() -> Option<PathBuf> {
  let home = default_home()?;
  let target = read_control_path(&home.join(DATA_LOCATION_FILE))?;
  if target.is_dir() { Some(target) } else { None }
}

/// Delete the previous data directory a completed migration recorded.
///
/// The marker is only honored while the pointer still names a live directory:
/// a migration that never completed leaves the source in place.
pub fn run_pending_cleanup() {
  let Some(home) = default_home() else { return };
  let Some(pointer) = read_control_path(&home.join(DATA_LOCATION_FILE)) else { return };
  if !pointer.is_dir() {
    return;
  }
  let marker = home.join(DATA_CLEANUP_FILE);
  let Some(previous) = read_control_path(&marker) else { return };
  if previous == pointer {
    return;
  }
  if previous.is_dir() {
    let _ = fs::remove_dir_all(&previous);
  }
  let _ = fs::remove_file(&marker);
}
