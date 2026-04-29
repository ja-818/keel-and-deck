//! Chat history read — relocated from `app/src-tauri/src/commands/chat.rs`.
//!
//! Given an agent path + session key, resolves every known provider resume ID
//! for that key and loads the associated chat-feed rows from the engine DB.
//! Transport-neutral: REST handlers and tests call it the same way.

use crate::error::{CoreError, CoreResult};
use houston_agents_conversations::session_id_tracker::session_ids_for_history;
use houston_db::Database;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ChatHistoryEntry {
    pub feed_type: String,
    pub data: serde_json::Value,
}

pub async fn load(
    db: &Database,
    working_dir: &Path,
    session_key: &str,
) -> CoreResult<Vec<ChatHistoryEntry>> {
    let session_ids = session_ids_for_history(working_dir, session_key);
    if session_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut rows = Vec::new();
    for session_id in session_ids {
        rows.extend(
            db.list_chat_feed_by_session(&session_id)
                .await
                .map_err(|e| CoreError::Internal(e.to_string()))?,
        );
    }

    rows.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    Ok(rows
        .into_iter()
        .map(|row| {
            let data = serde_json::from_str::<serde_json::Value>(&row.data_json)
                .unwrap_or(serde_json::Value::String(row.data_json));
            ChatHistoryEntry {
                feed_type: row.feed_type,
                data,
            }
        })
        .collect())
}
