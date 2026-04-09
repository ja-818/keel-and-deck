//! User-attached file storage for chat composer.
//!
//! Files attached in the chat composer are persisted under `~/.houston/cache/attachments/`,
//! scoped by an opaque `scope_id` chosen by the caller (e.g. `"activity-<id>"` for board
//! conversations or `"agent-<id>"` for an agent's main chat). When the owning activity/agent
//! is deleted, the caller invokes `delete_attachments(scope_id)` to wipe the directory.
//!
//! Files persist across app restarts so a user can attach something, walk away, come back
//! days later, and Claude can still read the path the original prompt referenced via `--resume`.
//!
//! Storage path: `~/.houston/cache/attachments/<scope_id>/<filename>`

use base64::Engine;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize)]
pub struct AttachmentInput {
    pub name: String,
    /// Base64-encoded bytes (standard alphabet, no URL-safe).
    pub data_base64: String,
}

/// Resolve the attachments root for a given scope, creating it if missing.
fn scope_dir(scope_id: &str) -> Result<PathBuf, String> {
    if scope_id.is_empty() || scope_id.contains('/') || scope_id.contains("..") {
        return Err(format!("invalid scope_id: {scope_id}"));
    }
    let dir = houston_tauri::houston_db::db::houston_dir()
        .join("cache")
        .join("attachments")
        .join(scope_id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create_dir_all: {e}"))?;
    Ok(dir)
}

/// Sanitize a user-provided filename so it cannot escape the scope dir.
/// Strips path separators, leading dots, and falls back to a generic name.
fn sanitize_filename(name: &str) -> String {
    let stripped: String = name
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == '\0' { '_' } else { c })
        .collect();
    let trimmed = stripped.trim_start_matches('.').trim();
    if trimmed.is_empty() {
        "attachment".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Persist attached files for a scope and return their absolute paths.
/// If a file with the same name already exists, it is overwritten — the
/// caller is responsible for choosing scope ids that won't collide.
#[tauri::command(rename_all = "snake_case")]
pub async fn save_attachments(
    scope_id: String,
    files: Vec<AttachmentInput>,
) -> Result<Vec<String>, String> {
    let dir = scope_dir(&scope_id)?;
    let engine = base64::engine::general_purpose::STANDARD;
    let mut paths = Vec::with_capacity(files.len());
    for file in files {
        let bytes = engine
            .decode(file.data_base64.as_bytes())
            .map_err(|e| format!("base64 decode {}: {e}", file.name))?;
        let safe = sanitize_filename(&file.name);
        let path = dir.join(&safe);
        std::fs::write(&path, &bytes)
            .map_err(|e| format!("write {}: {e}", path.display()))?;
        paths.push(path.to_string_lossy().to_string());
    }
    tracing::debug!(
        "[attachments] saved {} file(s) under scope {scope_id}",
        paths.len()
    );
    Ok(paths)
}

/// Delete the entire attachments directory for a scope. Idempotent.
#[tauri::command(rename_all = "snake_case")]
pub async fn delete_attachments(scope_id: String) -> Result<(), String> {
    if scope_id.is_empty() || scope_id.contains('/') || scope_id.contains("..") {
        return Err(format!("invalid scope_id: {scope_id}"));
    }
    let dir = houston_tauri::houston_db::db::houston_dir()
        .join("cache")
        .join("attachments")
        .join(&scope_id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("remove_dir_all {}: {e}", dir.display()))?;
        tracing::debug!("[attachments] deleted scope {scope_id}");
    }
    Ok(())
}
