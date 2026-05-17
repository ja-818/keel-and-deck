use super::store;
use crate::agents_crud::{self, Agent};
use crate::{CoreError, CoreResult};
use chrono::Utc;
use std::path::{Path, PathBuf};

pub fn save_agents(
    docs_root: &Path,
    workspace_id: &str,
    parent_agent_path: &str,
    parent_session_key: &str,
    agent_paths: &[PathBuf],
    action_id: Option<&str>,
) -> CoreResult<Vec<Agent>> {
    let action_id = action_id.map(str::trim).filter(|value| !value.is_empty());
    if let Some(action_id) = action_id {
        let mut manifest = store::read(parent_agent_path, parent_session_key)?;
        if manifest.workspace_id != workspace_id {
            return Err(CoreError::BadRequest(
                "orchestration workspace mismatch".into(),
            ));
        }
        if manifest
            .applied_save_action_ids
            .iter()
            .any(|applied| applied == action_id)
        {
            return agents_crud::save_temporary(docs_root, workspace_id, agent_paths);
        }
        let agents = agents_crud::save_temporary(docs_root, workspace_id, agent_paths)?;
        manifest.applied_save_action_ids.push(action_id.to_string());
        manifest.updated_at = Utc::now().to_rfc3339();
        store::write(&manifest)?;
        return Ok(agents);
    }

    agents_crud::save_temporary(docs_root, workspace_id, agent_paths)
}
