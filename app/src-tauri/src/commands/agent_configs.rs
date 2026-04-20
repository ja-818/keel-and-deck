//! Tauri proxy for installed agent configs.
//!
//! Delegates to `houston_engine_core::agent_configs` so invoke and HTTP
//! paths share one implementation.

use houston_engine_core::agent_configs::{self, InstalledConfig};
use houston_tauri::houston_db::db::houston_dir;

#[tauri::command(rename_all = "snake_case")]
pub fn list_installed_configs() -> Result<Vec<InstalledConfig>, String> {
    agent_configs::list_installed(&houston_dir()).map_err(|e| e.to_string())
}
