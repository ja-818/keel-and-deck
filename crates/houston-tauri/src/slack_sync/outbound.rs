//! Outbound routing: Houston FeedItem events → Slack thread replies.
//!
//! Listens to Tauri "houston-event" emissions and posts assistant messages to Slack.

use std::sync::Arc;
use tokio::sync::RwLock;

use super::manager::SlackSyncManager;

/// Start the outbound listener that forwards agent responses to Slack.
///
/// Subscribes to Tauri's "houston-event" and posts `AssistantText` items
/// to the correct Slack thread.
pub fn start_outbound_listener(
    app_handle: &tauri::AppHandle,
    manager: Arc<RwLock<SlackSyncManager>>,
) {
    use tauri::Listener;

    let mgr = manager.clone();
    app_handle.listen("houston-event", move |event| {
        let payload_str = event.payload();
        let parsed: serde_json::Value = match serde_json::from_str(payload_str) {
            Ok(v) => v,
            Err(_) => return,
        };

        // Only process FeedItem events with AssistantText
        if parsed.get("type").and_then(|t| t.as_str()) != Some("FeedItem") {
            return;
        }
        let data = match parsed.get("data") {
            Some(d) => d,
            None => return,
        };
        let session_key = match data.get("session_key").and_then(|s| s.as_str()) {
            Some(k) => k.to_string(),
            None => return,
        };
        let item = match data.get("item") {
            Some(i) => i,
            None => return,
        };

        // Extract assistant text (final, not streaming)
        let text = if let Some(t) = item.get("AssistantText").and_then(|t| t.as_str()) {
            t.to_string()
        } else {
            return;
        };

        let mgr = mgr.clone();
        tokio::spawn(async move {
            let mut mgr = mgr.write().await;
            if let Err(e) = mgr.post_to_slack(&session_key, &text).await {
                tracing::error!(
                    session_key = %session_key,
                    error = %e,
                    "failed to post to Slack thread"
                );
            }
        });
    });

    tracing::info!("Slack outbound listener started");
}
