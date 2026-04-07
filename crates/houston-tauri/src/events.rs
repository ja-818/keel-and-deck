use houston_sessions::FeedItem;
use serde::Serialize;

/// Generic events emitted from the Rust backend to the frontend via Tauri's event system.
///
/// Applications can extend this with their own event types or use it directly.
/// Emit via `app_handle.emit("houston-event", HoustonEvent::...)`.
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data")]
pub enum HoustonEvent {
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

    // ----- Event system (houston-events) -----

    /// An input event was received and queued for processing.
    EventReceived {
        event_id: String,
        event_type: String,
        source_channel: String,
        source_identifier: String,
        summary: String,
    },
    /// An input event was processed.
    EventProcessed {
        event_id: String,
        status: String,
    },

    // ----- Scheduler (houston-scheduler) -----

    /// A heartbeat fired.
    HeartbeatFired {
        prompt: String,
        project_id: Option<String>,
    },
    /// A cron job fired.
    CronFired {
        job_id: String,
        job_name: String,
        prompt: String,
    },

    // ----- Channels (houston-channels) -----

    /// A message arrived from an external channel (Slack, Telegram, etc.).
    ChannelMessageReceived {
        channel_type: String,
        channel_id: String,
        sender_name: String,
        text: String,
    },
    /// A channel's connection status changed.
    ChannelStatusChanged {
        channel_id: String,
        channel_type: String,
        status: String,
        error: Option<String>,
    },

    // ----- Routines -----

    /// A routine run changed status.
    RoutineRunChanged {
        routine_id: String,
        run_id: String,
        status: String,
    },
    /// Routines list changed for a project.
    RoutinesChanged {
        project_id: String,
        workspace_path: String,
    },

    // ----- Workspace data changes (AI-native reactivity) -----
    // Emitted by workspace_store writes AND by the file watcher.
    // Frontend uses these to invalidate TanStack Query caches.

    /// Tasks list changed (.houston/tasks.json).
    TasksChanged {
        workspace_path: String,
    },
    /// Skills changed (.houston/skills/).
    SkillsChanged {
        workspace_path: String,
    },
    /// Learnings changed (.houston/memory/).
    LearningsChanged {
        workspace_path: String,
    },
    /// Channel config changed (.houston/channels.json).
    ChannelsConfigChanged {
        workspace_path: String,
    },
    /// Workspace files changed (non-.houston files).
    FilesChanged {
        workspace_path: String,
    },
    /// Config changed (.houston/config.json).
    ConfigChanged {
        workspace_path: String,
    },
    /// Context files changed (CLAUDE.md, .houston/prompts/).
    ContextChanged {
        workspace_path: String,
    },
    /// Conversations list changed.
    ConversationsChanged {
        project_id: String,
        workspace_path: String,
    },
}
