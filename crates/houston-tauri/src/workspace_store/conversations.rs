//! Unified conversation listing: primary chat + task conversations.

use super::tasks;
use super::types::ConversationEntry;
use std::fs;
use std::path::Path;

/// Return every conversation in this workspace.
///
/// The first entry is always the primary chat (`session_key = "main"`).
/// Task conversations follow, ordered by most-recently-updated first.
pub fn list(root: &Path) -> Result<Vec<ConversationEntry>, String> {
    let mut entries = Vec::new();

    // Primary chat — always present. Use .claude_session_id mtime as updated_at.
    let session_file = root.join(".claude_session_id");
    let primary_updated = fs::metadata(&session_file)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339()
        });

    entries.push(ConversationEntry {
        id: "primary".to_string(),
        title: "Primary chat".to_string(),
        status: None,
        entry_type: "primary".to_string(),
        session_key: "main".to_string(),
        updated_at: primary_updated,
    });

    // Task conversations — sorted by updated_at descending.
    let mut tasks = tasks::list(root).unwrap_or_default();
    tasks.sort_by(|a, b| {
        let a_time = a.updated_at.as_deref().unwrap_or("");
        let b_time = b.updated_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });

    for task in tasks {
        entries.push(ConversationEntry {
            id: task.id.clone(),
            title: task.title,
            status: Some(task.status),
            entry_type: "task".to_string(),
            session_key: format!("task-{}", task.id),
            updated_at: task.updated_at,
        });
    }

    Ok(entries)
}
