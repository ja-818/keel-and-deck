//! OS-native system commands — stay in the Tauri adapter.
//!
//! These probe the user's local machine (shell `PATH`, installed CLIs,
//! OS integrations) and therefore must NOT move into `houston-engine-*`,
//! which may run on a remote VPS. Kept here so Phase 4's sweep preserves
//! them.

use std::process::Command;

/// Does the user's shell have the `claude` CLI on `PATH`?
///
/// Relies on `houston_terminal_manager::claude_path::init()` having hydrated
/// the process `PATH` from the user's login shell at Tauri startup.
#[tauri::command]
pub fn check_claude_cli() -> bool {
    Command::new("which")
        .arg("claude")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
