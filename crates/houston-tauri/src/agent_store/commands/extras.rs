//! Log and config Tauri commands.
//! All mutation commands emit events for AI-native reactivity.

use super::resolve_agent_dir;
use crate::events::HoustonEvent;
use crate::agent_store::types::*;
use crate::agent_store::AgentStore;
use tauri::Emitter;

// -- Log --

#[tauri::command(rename_all = "snake_case")]
pub async fn append_log(
    agent_path: String,
    entry: LogEntry,
) -> Result<(), String> {
    let root = resolve_agent_dir(&agent_path)?;
    AgentStore::new(&root).append_log(&entry)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn read_log(
    agent_path: String,
) -> Result<Vec<LogEntry>, String> {
    let root = resolve_agent_dir(&agent_path)?;
    AgentStore::new(&root).read_log()
}

// -- Config --

#[tauri::command(rename_all = "snake_case")]
pub async fn read_config(
    agent_path: String,
) -> Result<ProjectConfig, String> {
    let root = resolve_agent_dir(&agent_path)?;
    AgentStore::new(&root).read_config()
}

#[tauri::command(rename_all = "snake_case")]
pub async fn write_config(
    app_handle: tauri::AppHandle,
    agent_path: String,
    config: ProjectConfig,
) -> Result<(), String> {
    let root = resolve_agent_dir(&agent_path)?;
    AgentStore::new(&root).write_config(&config)?;
    let _ = app_handle.emit("houston-event", HoustonEvent::ConfigChanged {
        agent_path: agent_path.clone(),
    });
    Ok(())
}
