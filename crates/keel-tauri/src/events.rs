use keel_sessions::FeedItem;
use serde::Serialize;

/// Generic events emitted from the Rust backend to the frontend via Tauri's event system.
///
/// Applications can extend this with their own event types or use it directly.
/// Emit via `app_handle.emit("keel-event", KeelEvent::...)`.
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum KeelEvent {
    /// A feed item from a running session.
    FeedItem {
        session_key: String,
        item: FeedItem,
    },
    /// Session status changed (starting, running, completed, error).
    SessionStatus {
        session_key: String,
        status: String,
        error: Option<String>,
    },
    /// An issue's status changed on the kanban board.
    IssueStatusChanged {
        issue_id: String,
        status: String,
    },
    /// Output files for an issue were updated.
    IssueOutputFilesChanged {
        issue_id: String,
        files: Vec<String>,
    },
    /// An issue's title changed.
    IssueTitleChanged {
        issue_id: String,
        title: String,
    },
    /// Issues list changed for a project (bulk refresh signal).
    IssuesChanged {
        project_id: String,
    },
    /// Toast notification for the UI.
    Toast {
        message: String,
        variant: String,
    },
    /// CLI tool authentication required.
    AuthRequired {
        message: String,
    },
    /// Task completion notification.
    CompletionToast {
        title: String,
        issue_id: Option<String>,
    },
}
