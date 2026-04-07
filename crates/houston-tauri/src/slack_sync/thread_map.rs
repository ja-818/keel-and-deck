//! Thread map: persisted mapping between Houston conversations and Slack threads.
//!
//! Stored in `.houston/slack_sync.json` per agent.

use crate::agent_store::helpers::{read_json, write_json};
use crate::agent_store::types::{SlackSyncConfig, SlackThread};
use std::path::Path;

const FILE: &str = "slack_sync.json";

pub fn read_config(root: &Path) -> Result<SlackSyncConfig, String> {
    read_json::<SlackSyncConfig>(root, FILE)
}

pub fn write_config(root: &Path, config: &SlackSyncConfig) -> Result<(), String> {
    write_json(root, FILE, config)
}

/// Look up the thread_ts for a session_key.
pub fn find_thread<'a>(config: &'a SlackSyncConfig, session_key: &str) -> Option<&'a SlackThread> {
    config.threads.iter().find(|t| t.session_key == session_key)
}

/// Look up the session_key for a thread_ts.
pub fn find_session_key<'a>(config: &'a SlackSyncConfig, thread_ts: &str) -> Option<&'a SlackThread> {
    config.threads.iter().find(|t| t.thread_ts == thread_ts)
}

/// Add or update a thread mapping. Persists to disk.
pub fn upsert_thread(
    root: &Path,
    config: &mut SlackSyncConfig,
    session_key: String,
    thread_ts: String,
    title: String,
) -> Result<(), String> {
    if let Some(existing) = config.threads.iter_mut().find(|t| t.session_key == session_key) {
        existing.thread_ts = thread_ts;
        existing.title = title;
    } else {
        config.threads.push(SlackThread {
            session_key,
            thread_ts,
            title,
        });
    }
    write_config(root, config)
}
