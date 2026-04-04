//! Per-agent session state with disk persistence.
//!
//! Each agent (project) maintains its own Claude session ID for `--resume`.
//! The session ID is persisted to `.claude_session_id` in the workspace folder
//! so it survives app restarts.

use crate::chat_session::ChatSessionState;
use crate::paths::expand_tilde;
use crate::state::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

const SESSION_FILE: &str = ".claude_session_id";

/// Managed Tauri state: one `ChatSessionState` per agent (project_id).
/// Persists session IDs to disk so conversations survive app restarts.
#[derive(Default, Clone)]
pub struct AgentSessionMap {
    inner: Arc<RwLock<HashMap<String, ChatSessionState>>>,
}

impl AgentSessionMap {
    /// Get (or lazily create) the `ChatSessionState` for a given agent.
    /// On first access, loads the persisted session ID from disk if available.
    pub async fn get_for_agent(
        &self,
        project_id: &str,
        app_state: &AppState,
    ) -> ChatSessionState {
        // Fast path: already in memory.
        {
            let map = self.inner.read().await;
            if let Some(state) = map.get(project_id) {
                return state.clone();
            }
        }

        // Slow path: create and try to load from disk.
        let state = ChatSessionState::default();

        if let Some(workspace_dir) = resolve_workspace(project_id, app_state).await {
            let session_file = workspace_dir.join(SESSION_FILE);
            if let Ok(id) = std::fs::read_to_string(&session_file) {
                let id = id.trim().to_string();
                if !id.is_empty() {
                    state.set(id).await;
                }
            }
        }

        let mut map = self.inner.write().await;
        map.entry(project_id.to_string())
            .or_insert(state)
            .clone()
    }

    /// Save the current session ID to disk after a session completes.
    pub async fn persist(
        &self,
        project_id: &str,
        app_state: &AppState,
    ) {
        let session_id = {
            let map = self.inner.read().await;
            match map.get(project_id) {
                Some(state) => state.get().await,
                None => None,
            }
        };

        if let (Some(id), Some(workspace_dir)) =
            (session_id, resolve_workspace(project_id, app_state).await)
        {
            let session_file = workspace_dir.join(SESSION_FILE);
            std::fs::write(&session_file, &id).ok();
        }
    }

    /// Remove session state for a deleted agent.
    pub async fn remove_agent(&self, project_id: &str) {
        let mut map = self.inner.write().await;
        map.remove(project_id);
    }
}

async fn resolve_workspace(project_id: &str, app_state: &AppState) -> Option<PathBuf> {
    let project = app_state.db.get_project(project_id).await.ok()??;
    Some(expand_tilde(&PathBuf::from(&project.folder_path)))
}
