//! Tauri commands exposed to the frontend.

use crate::{start_watching, WatcherState};

/// Start watching the current agent for file changes.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_agent_watcher(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    agent_path: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    // Stop any existing watcher
    *guard = None;
    // Start new watcher
    let watcher = start_watching(&app_handle, agent_path)?;
    *guard = Some(watcher);
    Ok(())
}

/// Stop watching the current agent.
#[tauri::command(rename_all = "snake_case")]
pub async fn stop_agent_watcher(
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().await;
    *guard = None;
    tracing::info!("[watcher] Stopped");
    Ok(())
}
