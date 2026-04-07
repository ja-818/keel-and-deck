//! Tauri commands for agent store operations.
//!
//! All commands take a `agent_path` and resolve the folder directly,
//! then delegate to [`AgentStore`](super::AgentStore).
//!
//! Register these in your Tauri app's `invoke_handler`.

mod crud;
mod extras;

pub use crud::*;
pub use extras::*;

use crate::paths::expand_tilde;
use std::path::PathBuf;

/// Resolve an agent directory from a user-provided path.
pub(crate) fn resolve_agent_dir(agent_path: &str) -> Result<PathBuf, String> {
    Ok(expand_tilde(&PathBuf::from(agent_path)))
}
