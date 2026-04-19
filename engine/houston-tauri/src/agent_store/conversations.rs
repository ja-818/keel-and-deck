//! Unified conversation listing: activity conversations only.
//!
//! The legacy "primary chat" (session_key = "main") has been removed. Every
//! conversation is an activity with a UUID-scoped session_key.

use super::activity;
use super::types::ConversationEntry;
use std::path::Path;

/// Return every conversation in a single agent, ordered by most-recently-updated first.
pub fn list(root: &Path) -> Result<Vec<ConversationEntry>, String> {
    let agent_path_str = root.to_string_lossy().to_string();
    let agent_name_str = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut activities = activity::list(root).unwrap_or_default();
    activities.sort_by(|a, b| {
        let a_time = a.updated_at.as_deref().unwrap_or("");
        let b_time = b.updated_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });

    let entries = activities
        .into_iter()
        .map(|entry| ConversationEntry {
            id: entry.id.clone(),
            title: entry.title,
            description: Some(entry.description).filter(|d| !d.is_empty()),
            status: Some(entry.status),
            entry_type: "activity".to_string(),
            session_key: format!("activity-{}", entry.id),
            updated_at: entry.updated_at,
            agent_path: agent_path_str.clone(),
            agent_name: agent_name_str.clone(),
        })
        .collect();

    Ok(entries)
}

/// Aggregate conversations across multiple agents.
///
/// Returns all entries sorted by updated_at descending (most recent first).
pub fn list_all(roots: &[&Path]) -> Result<Vec<ConversationEntry>, String> {
    let mut all = Vec::new();
    for root in roots {
        match list(root) {
            Ok(entries) => all.extend(entries),
            Err(e) => tracing::warn!("[conversations] skipping {}: {e}", root.display()),
        }
    }
    // Sort: entries with updated_at first (descending), then entries without
    all.sort_by(|a, b| {
        let a_time = a.updated_at.as_deref().unwrap_or("");
        let b_time = b.updated_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });
    Ok(all)
}
