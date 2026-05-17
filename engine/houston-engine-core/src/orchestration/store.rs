use super::types::OrchestrationManifest;
use crate::{CoreError, CoreResult};
use std::fs;
use std::path::{Path, PathBuf};

pub fn read(
    parent_agent_path: &str,
    parent_session_key: &str,
) -> CoreResult<OrchestrationManifest> {
    let path = manifest_path(parent_agent_path, parent_session_key);
    let contents = fs::read_to_string(&path).map_err(|err| {
        CoreError::NotFound(format!("orchestration manifest {}: {err}", path.display()))
    })?;
    let mut manifest: OrchestrationManifest = serde_json::from_str(&contents)?;
    manifest.migrate_legacy_prompts();
    Ok(manifest)
}

pub fn read_optional(
    parent_agent_path: &str,
    parent_session_key: &str,
) -> CoreResult<Option<OrchestrationManifest>> {
    let path = manifest_path(parent_agent_path, parent_session_key);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)?;
    let mut manifest: OrchestrationManifest = serde_json::from_str(&contents)?;
    manifest.migrate_legacy_prompts();
    Ok(Some(manifest))
}

pub fn write(manifest: &OrchestrationManifest) -> CoreResult<()> {
    let path = manifest_path(&manifest.parent_agent_path, &manifest.parent_session_key);
    let Some(parent) = path.parent() else {
        return Err(CoreError::Internal("invalid orchestration path".into()));
    };
    fs::create_dir_all(parent)?;
    fs::write(path, serde_json::to_string_pretty(manifest)?)?;
    Ok(())
}

fn manifest_path(parent_agent_path: &str, parent_session_key: &str) -> PathBuf {
    Path::new(parent_agent_path)
        .join(".houston")
        .join("orchestration")
        .join(format!("{}.json", safe_name(parent_session_key)))
}

fn safe_name(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}
