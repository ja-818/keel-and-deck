//! Per-session Claude session ID tracking with disk persistence.
//!
//! Every `(agent_path, session_key)` pair maintains its own Claude session ID
//! so `--resume` continues the right conversation across app restarts. The ID
//! is persisted to `.houston/sessions/{session_key}.sid` under the agent
//! working directory. There is no shared "main" session file — every
//! conversation is independently scoped.

use crate::chat_session::ChatSessionState;
use crate::paths::expand_tilde;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Return the disk path where a given session_key's Claude session ID is persisted.
pub fn session_id_path(agent_path: &Path, session_key: &str) -> PathBuf {
    agent_path
        .join(".houston")
        .join("sessions")
        .join(format!("{session_key}.sid"))
}

/// Managed Tauri state: one `ChatSessionState` per `(agent_path, session_key)`.
/// Persists session IDs to disk so conversations survive app restarts.
#[derive(Default, Clone)]
pub struct AgentSessionMap {
    inner: Arc<RwLock<HashMap<String, ChatSessionState>>>,
}

impl AgentSessionMap {
    /// Get (or lazily create) the `ChatSessionState` for a given session.
    /// On first access, loads the persisted session ID from disk if available.
    ///
    /// `agent_key` is an arbitrary unique identifier combining agent + session
    /// (e.g. `"{agent_path}:{session_key}"`).
    /// `agent_path` is the filesystem path where `.houston/sessions/{session_key}.sid` is stored.
    pub async fn get_for_session(
        &self,
        agent_key: &str,
        agent_path: &str,
        session_key: &str,
    ) -> ChatSessionState {
        // Fast path: already in memory.
        {
            let map = self.inner.read().await;
            if let Some(state) = map.get(agent_key) {
                return state.clone();
            }
        }

        // Slow path: create and try to load the per-session ID from disk.
        let state = ChatSessionState::default();

        let agent_dir = expand_tilde(&PathBuf::from(agent_path));
        let sid_file = session_id_path(&agent_dir, session_key);
        if let Ok(id) = std::fs::read_to_string(&sid_file) {
            let id = id.trim().to_string();
            if !id.is_empty() {
                state.set(id).await;
            }
        }

        let mut map = self.inner.write().await;
        map.entry(agent_key.to_string())
            .or_insert(state)
            .clone()
    }

    /// Remove in-memory session state for a deleted agent.
    /// `agent_key_prefix` should match the `"{agent_path}:"` prefix used when storing.
    pub async fn remove_agent(&self, agent_key_prefix: &str) {
        let mut map = self.inner.write().await;
        map.retain(|k, _| !k.starts_with(agent_key_prefix));
    }
}
