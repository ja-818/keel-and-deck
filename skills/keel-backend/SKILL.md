---
name: keel-backend
description: Keel Rust crates for building AI agent desktop app backends. Teaches your coding agent how to use session management, Claude CLI integration, channel adapters, database persistence, scheduling, and Tauri integration.
---

# Keel Backend — Rust Crates for AI Agent Desktop Apps

Keel is a set of Rust crates for building Tauri 2 desktop app backends that manage AI agent sessions (Claude CLI), messaging channels (Telegram, Slack), persistent storage, scheduling, memory, and event routing.

The main integration crate is `keel-tauri`, which re-exports all sub-crates. Most apps only need `keel-tauri` in their `Cargo.toml`.

## Install

For most apps, add only `keel-tauri` — it re-exports everything:

```toml
[dependencies]
keel-tauri = "0.3"
```

If you need individual crates (rare — only for non-Tauri contexts):

```toml
keel-sessions = "0.1"    # Claude CLI process management
keel-db = "0.2"          # SQLite database (libsql)
keel-events = "0.1"      # Event queue and dispatching
keel-scheduler = "0.1"   # Heartbeat and cron scheduling
keel-channels = "0.1"    # Telegram, Slack channel adapters
keel-memory = "0.1"      # Persistent agent memory with FTS
```

Required peer dependencies in your `Cargo.toml`:

```toml
tauri = { version = "2", features = ["tray-icon"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
```

## Key Rules

### Tauri Command Patterns

All Tauri commands that can fail MUST return `Result<T, String>`. Tauri serializes `Err(String)` to the frontend. Map errors with `.map_err(|e| e.to_string())` or `.map_err(|e| format!("context: {e}"))`.

```rust
#[tauri::command]
async fn my_command(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let projects = state.db.list_projects()
        .await
        .map_err(|e| format!("Failed to list projects: {e}"))?;
    Ok(serde_json::to_string(&projects).unwrap())
}
```

### Error Handling

- No `unwrap()` in production code. Use `?` with proper error mapping.
- No `let _ = something.await` for operations that could meaningfully fail.
- All errors must surface to the user — no silent swallowing.

### Event Emission

All backend-to-frontend communication uses `app_handle.emit("keel-event", KeelEvent::...)`. The frontend listens on the `"keel-event"` channel.

### Path Handling

Rust's `PathBuf` does NOT expand `~`. Always use `keel_tauri::paths::expand_tilde()` when accepting user-facing paths.

---

## keel-tauri

The main integration crate. Provides AppState, session lifecycle, channel management, workspace helpers, event types, and re-exports all sub-crates.

```rust
use keel_tauri::{
    // Re-exported sub-crates
    keel_db, keel_sessions, keel_events, keel_scheduler, keel_channels, keel_memory,
    // Direct modules
    state::AppState,
    events::KeelEvent,
    session_runner::{spawn_and_monitor, SessionResult, PersistOptions},
    chat_session::ChatSessionState,
    channel_manager::{ChannelManager, RoutedMessage},
    workspace::{seed_file, build_system_prompt, list_files, read_file, WorkspaceFileInfo},
    paths::expand_tilde,
    supervisor::supervise_monitor,
};
```

### AppState

Generic application state. Register during Tauri setup with `app.manage()`.

```rust
use keel_tauri::state::AppState;
use keel_tauri::keel_db::Database;
use keel_tauri::keel_events::{EventQueue, EventQueueHandle};
use keel_tauri::keel_scheduler::Scheduler;
use std::sync::Arc;
use tokio::sync::Mutex;

// AppState fields:
pub struct AppState {
    pub db: Database,
    pub event_queue: Option<EventQueueHandle>,
    pub scheduler: Option<Arc<Mutex<Scheduler>>>,
}
```

Setup example:

```rust
let db = Database::connect(&data_dir.join("app.db")).await?;
let (event_queue, queue_handle) = EventQueue::new();
let scheduler = Scheduler::new(queue_handle.clone());

app.manage(AppState {
    db: db.clone(),
    event_queue: Some(queue_handle),
    scheduler: Some(Arc::new(Mutex::new(scheduler))),
});
```

### spawn_and_monitor

The core session lifecycle function. Spawns a Claude CLI process, emits `KeelEvent::FeedItem` and `KeelEvent::SessionStatus` events, optionally tracks session ID for `--resume`, and optionally persists feed items to the database. Returns a `JoinHandle<SessionResult>`.

**Signature:**

```rust
pub fn spawn_and_monitor(
    app_handle: &tauri::AppHandle,
    session_key: String,         // Unique key for this session (used in events)
    prompt: String,              // The user's prompt
    resume_id: Option<String>,   // Claude session ID for --resume (conversation continuity)
    working_dir: Option<PathBuf>,// Working directory for the Claude process
    system_prompt: Option<String>,
    chat_state: Option<ChatSessionState>,  // Tracks session ID across sends
    persist: Option<PersistOptions>,       // DB persistence for feed items
) -> tokio::task::JoinHandle<SessionResult>
```

**Return type:**

```rust
pub struct SessionResult {
    pub response_text: Option<String>,     // Final assistant text
    pub claude_session_id: Option<String>, // For --resume on next send
    pub error: Option<String>,
}

pub struct PersistOptions {
    pub db: Database,
    pub project_id: String,
    pub feed_key: String,    // Groups feed items (e.g., "main", "issue-123")
    pub source: String,      // Origin: "desktop", "telegram", etc.
}
```

**Usage — simple chat send:**

```rust
#[tauri::command]
async fn send_message(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    chat_state: tauri::State<'_, ChatSessionState>,
    prompt: String,
    workspace_path: String,
) -> Result<(), String> {
    let resume_id = chat_state.get().await;
    let work_dir = expand_tilde(std::path::Path::new(&workspace_path));

    let system_prompt = build_system_prompt(
        &work_dir,
        "You are a helpful AI assistant.",
        Some("bootstrap.md"),
        &[
            ("instructions.md", "User Instructions"),
            ("context.md", "Project Context"),
        ],
    );

    let _handle = spawn_and_monitor(
        &app_handle,
        "main-chat".to_string(),
        prompt,
        resume_id,
        Some(work_dir),
        Some(system_prompt),
        Some(chat_state.inner().clone()),
        Some(PersistOptions {
            db: state.db.clone(),
            project_id: "default".to_string(),
            feed_key: "main".to_string(),
            source: "desktop".to_string(),
        }),
    );

    Ok(())
}
```

**What it does automatically:**
- Emits `KeelEvent::FeedItem { session_key, item }` for every parsed feed item
- Emits `KeelEvent::SessionStatus { session_key, status, error }` on status changes
- Stores the Claude session ID in `ChatSessionState` (if provided) for `--resume`
- Persists non-streaming feed items to the `chat_feed` table (if `PersistOptions` provided)
- Skips `AssistantTextStreaming` and `ThinkingStreaming` items during persistence (they get replaced by finals)

### ChatSessionState

Tracks the Claude CLI session ID for `--resume` across sends. Enables conversation continuity.

```rust
use keel_tauri::chat_session::ChatSessionState;

// Inner type: Arc<Mutex<Option<String>>>

// Register in Tauri setup:
app.manage(ChatSessionState::default());

// In commands:
#[tauri::command]
async fn send(chat_state: tauri::State<'_, ChatSessionState>) -> Result<(), String> {
    let resume_id = chat_state.get().await;  // Option<String>
    // ... spawn_and_monitor with resume_id ...
    Ok(())
}

#[tauri::command]
async fn reset_conversation(chat_state: tauri::State<'_, ChatSessionState>) -> Result<(), String> {
    chat_state.clear().await;
    Ok(())
}
```

For single-conversation apps (like DesktopClaw), manage one global `ChatSessionState`.
For multi-conversation apps (like Houston), store session IDs in the database per-issue instead.

### ChannelManager

Bridges keel-channels adapters with the Tauri event system. Starts/stops channel adapters and routes all incoming messages into one `mpsc::UnboundedReceiver`.

```rust
use keel_tauri::channel_manager::{ChannelManager, RoutedMessage};
use keel_tauri::keel_channels::ChannelConfig;

// RoutedMessage = (String, ChannelMessage)  — (registry_id, message)

// Create:
let (manager, mut message_rx) = ChannelManager::new();

// Start a channel:
manager.start_channel(
    "tg-main".to_string(),
    ChannelConfig {
        channel_type: "telegram".to_string(),
        token: bot_token,
        extra: serde_json::json!({}),
    },
).await.map_err(|e| e.to_string())?;

// Start a Slack channel (requires app_token in extra):
manager.start_channel(
    "slack-main".to_string(),
    ChannelConfig {
        channel_type: "slack".to_string(),
        token: bot_token,
        extra: serde_json::json!({ "app_token": app_level_token }),
    },
).await.map_err(|e| e.to_string())?;

// Consume incoming messages (spawn a task):
tokio::spawn(async move {
    while let Some((registry_id, msg)) = message_rx.recv().await {
        // msg.source = "telegram" or "slack"
        // msg.channel_id = platform-specific chat ID
        // msg.sender_name, msg.text, msg.timestamp, etc.
        // Route to your agent, emit events, etc.
    }
});

// Send a reply:
manager.send_message("tg-main", &chat_id, "Hello from the agent!").await?;

// Show typing indicator (Telegram supports it, Slack is a no-op):
manager.send_typing("tg-main", &chat_id).await?;

// Stop a channel:
manager.stop_channel("tg-main").await?;

// List all channels and their statuses:
let channels: Vec<(String, ChannelStatus)> = manager.list().await;
```

### Workspace Helpers

Utilities for managing workspace files (instructions, context, prompts).

**seed_file** — Write-once file creation. Never overwrites user edits.

```rust
use keel_tauri::workspace::seed_file;

let workspace_dir = expand_tilde(Path::new("~/MyApp/workspace"));
seed_file(&workspace_dir, "instructions.md", "# Instructions\n\nBe helpful.")?;
seed_file(&workspace_dir, "context.md", "# Context\n\nThis is a Rust project.")?;
// If the files already exist, seed_file does nothing.
```

**build_system_prompt** — Assemble a system prompt from workspace files.

```rust
use keel_tauri::workspace::build_system_prompt;

let prompt = build_system_prompt(
    &workspace_dir,
    "You are an AI assistant for this project.",  // base_prompt (always first)
    Some("bootstrap.md"),  // If this file exists, inject as FIRST RUN signal
    &[
        ("instructions.md", "User Instructions"),  // (filename, section_label)
        ("context.md", "Project Context"),
    ],
);
// Returns: base_prompt + "---" + bootstrap (if exists) + "---" + each file as "# Label\n\ncontent"
```

**list_files** — List known workspace files with existence status (for UI).

```rust
use keel_tauri::workspace::{list_files, WorkspaceFileInfo};

let files: Vec<WorkspaceFileInfo> = list_files(
    &workspace_dir,
    &[
        ("instructions.md", "How the agent should behave"),
        ("context.md", "Project context and background"),
    ],
);
// Each WorkspaceFileInfo: { name, description, exists }
```

**read_file** — Read a workspace file, restricted to allowed names.

```rust
use keel_tauri::workspace::read_file;

let content = read_file(
    &workspace_dir,
    "instructions.md",
    &["instructions.md", "context.md"],  // allowed file names
)?;
```

### KeelEvent Enum

All events emitted from backend to frontend. Tagged union with `#[serde(tag = "type", content = "data")]`. Emit via `app_handle.emit("keel-event", KeelEvent::...)`.

```rust
use keel_tauri::events::KeelEvent;

pub enum KeelEvent {
    // --- Session lifecycle ---
    FeedItem { session_key: String, item: FeedItem },
    SessionStatus { session_key: String, status: String, error: Option<String> },

    // --- Kanban board ---
    IssueStatusChanged { issue_id: String, status: String },
    IssueOutputFilesChanged { issue_id: String, files: Vec<String> },
    IssueTitleChanged { issue_id: String, title: String },
    IssuesChanged { project_id: String },

    // --- UI notifications ---
    Toast { message: String, variant: String },          // variant: "default", "error", "success"
    CompletionToast { title: String, issue_id: Option<String> },
    AuthRequired { message: String },

    // --- Event system ---
    EventReceived { event_id: String, event_type: String, source_channel: String, source_identifier: String, summary: String },
    EventProcessed { event_id: String, status: String },

    // --- Scheduler ---
    HeartbeatFired { prompt: String, project_id: Option<String> },
    CronFired { job_id: String, job_name: String, prompt: String },

    // --- Channels ---
    ChannelMessageReceived { channel_type: String, channel_id: String, sender_name: String, text: String },
    ChannelStatusChanged { channel_id: String, channel_type: String, status: String, error: Option<String> },

    // --- Memory ---
    MemoryChanged { memory_id: String, project_id: String, category: String },
    MemoryDeleted { memory_id: String, project_id: String },

    // --- Routines ---
    RoutineRunChanged { routine_id: String, run_id: String, status: String },
    RoutinesChanged { project_id: String },
}
```

**Emit example:**

```rust
use tauri::Emitter;

let _ = app_handle.emit("keel-event", KeelEvent::Toast {
    message: "Task completed!".to_string(),
    variant: "success".to_string(),
});
```

### expand_tilde

Resolves `~` in user-facing paths. Rust's `PathBuf` does NOT do this.

```rust
use keel_tauri::paths::expand_tilde;
use std::path::Path;

let path = expand_tilde(Path::new("~/Documents/MyApp"));
// Returns: /Users/username/Documents/MyApp
```

### Supervisor

Wraps a session monitor future with panic isolation and semaphore-based concurrency control.

```rust
use keel_tauri::supervisor::supervise_monitor;
use keel_tauri::keel_sessions::concurrency::session_sem;

let permit = session_sem().acquire().await.unwrap();
supervise_monitor(
    app_handle.clone(),
    permit,
    async move { /* your monitor logic */ },
    "issue session",  // context string for error toasts
).await;
```

---

## keel-sessions

Claude CLI process management. Spawns `claude -p --output-format stream-json`, parses NDJSON output, manages concurrency.

### SessionManager

Spawns a Claude CLI session and streams parsed events back.

```rust
use keel_sessions::{SessionManager, SessionUpdate, SessionHandle};

let (mut rx, _handle) = SessionManager::spawn_session(
    "Fix the login bug".to_string(),         // prompt
    None,                                      // resume_session_id: Option<String>
    Some(PathBuf::from("/path/to/project")),   // working_dir
    None,                                      // model: Option<String>
    None,                                      // effort: Option<String>
    Some("You are a coding assistant".into()), // system_prompt
    None,                                      // mcp_config: Option<PathBuf>
    false,                                     // disable_builtin_tools
    false,                                     // disable_all_tools
);

// Process events:
while let Some(update) = rx.recv().await {
    match update {
        SessionUpdate::Status(status) => { /* Starting, Running, Completed, Error(msg) */ }
        SessionUpdate::SessionId(sid) => { /* Store for --resume */ }
        SessionUpdate::Feed(item) => { /* FeedItem for UI */ }
        SessionUpdate::ProcessPid(pid) => { /* OS process ID */ }
    }
}
```

**Flags:**
- `disable_builtin_tools = true` adds `--disallowedTools Edit Write NotebookEdit`
- `disable_all_tools = true` adds `--allowedTools ""` (pure conversation, no permissions bypass)
- When neither is true, `--dangerously-skip-permissions` is added automatically

### FeedItem

Processed feed items for rendering in the UI.

```rust
use keel_sessions::FeedItem;

pub enum FeedItem {
    AssistantText(String),              // Final text message
    AssistantTextStreaming(String),      // Partial text (replaces previous streaming)
    Thinking(String),                   // Final extended thinking
    ThinkingStreaming(String),          // Partial thinking (accumulates)
    UserMessage(String),                // Follow-up prompt
    ToolCall { name: String, input: serde_json::Value },
    ToolResult { content: String, is_error: bool },
    SystemMessage(String),              // Session start, stderr, etc.
    FinalResult { result: String, cost_usd: Option<f64>, duration_ms: Option<u64> },
}
```

### StreamAccumulator

Reassembles stream_event fragments (text deltas, tool input deltas) into complete FeedItems. Used internally by the session pump.

```rust
use keel_sessions::{StreamAccumulator, parse_event};

let mut acc = StreamAccumulator::new();
for line in ndjson_lines {
    let items: Vec<FeedItem> = parse_event(&line, &mut acc);
    // items contains any completed FeedItems from this line
}
```

### Concurrency Control

Limits simultaneous Claude CLI processes (default: 15).

```rust
use keel_sessions::concurrency::{init_session_sem, session_sem};

// At app startup (optional — defaults to 15):
init_session_sem(10);

// Before spawning a session:
let permit = session_sem().acquire().await.unwrap();
// Drop permit when session completes to free the slot.
```

### Claude Path Resolution

macOS `.app` bundles get a minimal PATH. Keel resolves the user's login shell PATH.

```rust
use keel_sessions::claude_path;

// At app startup:
claude_path::init();

// Check availability:
if !claude_path::is_claude_available() {
    // Show error to user: "Claude CLI not found"
}

// Get the resolved PATH (used internally by SessionManager):
let path = claude_path::shell_path();
```

---

## keel-db

SQLite database layer using libsql. Provides models, repositories, and auto-migrations.

### Database

```rust
use keel_db::Database;

// Connect (creates file + tables if needed):
let db = Database::connect(&PathBuf::from("/path/to/app.db")).await?;

// Or from a string path:
let db = Database::connect_with_path("/path/to/app.db").await?;

// In-memory (for tests):
let db = Database::connect_in_memory().await?;

// Default data directory:
use keel_db::db::default_data_dir;
let dir = default_data_dir("MyApp");
// macOS: ~/Library/Application Support/MyApp/
```

The database auto-creates all tables and runs migrations on connect. Tables created:
- `projects` — id, name, folder_path, pm_instructions, icon, timestamps
- `issues` — id, project_id, title, description, status, tags, position, session_id, claude_session_id, output_files, timestamps
- `issue_dependencies` — issue_id, depends_on_id (many-to-many blocking)
- `sessions` — id, job_id, claude_session_id, status, prompt, timestamps
- `session_events` — id, session_id, event_type, content, timestamp
- `routines` — id, project_id, name, description, trigger_type, trigger_config, status, schedule_time, autonomy, enabled, run_count, timestamps
- `routine_runs` — id, routine_id, project_id, status, output_summary, timestamps
- `event_log` — id, event_type, source_channel, source_identifier, payload, session_key, project_id, status, summary, timestamps
- `webhooks` — id, name, endpoint_path, secret, enabled, project_id, timestamps
- `channels` — id, channel_type, name, config, status, enabled, last_active_at, message_count, error, project_id, timestamps
- `chat_feed` — id, project_id, feed_key, feed_type, data_json, source, timestamp
- `issue_feed_items` — id, issue_id, feed_type, data_json, timestamp
- `preferences` — key, value

### Models

```rust
use keel_db::{Project, Issue, IssueStatus, Session, SessionEvent, Routine, RoutineRun};

pub struct Project {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub pm_instructions: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct Issue {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub status: IssueStatus,       // Queue, Running, NeedsYou, Done, Cancelled
    pub tags: Option<String>,       // JSON array string
    pub position: i32,
    pub session_id: Option<String>,
    pub claude_session_id: Option<String>,
    pub output_files: Option<String>, // JSON array string
    pub created_at: String,
    pub updated_at: String,
    pub blocked_by_ids: Vec<String>,
}

// IssueStatus enum with Display/FromStr:
pub enum IssueStatus { Queue, Running, NeedsYou, Done, Cancelled }

pub struct Routine {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub trigger_type: String,
    pub trigger_config: String,
    pub status: String,          // "active", "paused"
    pub run_count: i64,
    pub approval_count: i64,
    pub created_at: String,
    pub updated_at: String,
}
```

### Repository Methods

All methods are on `Database` (via impl blocks in separate files):

```rust
// Projects
db.create_project("My App", "/path/to/folder").await?;
db.get_project("project-id").await?;          // Option<Project>
db.list_projects().await?;                     // Vec<Project>
db.update_project("id", "New Name", "/new/path").await?;
db.update_pm_instructions("id", "Be concise").await?;
db.delete_project("id").await?;                // Cascades to issues

// Issues
db.create_issue("project-id", "Fix bug", "description", Some(&tags_json)).await?;
db.get_issue("issue-id").await?;               // Option<Issue>
db.list_issues("project-id").await?;           // Vec<Issue>
db.delete_issue("issue-id").await?;

// Routines
db.create_routine("id", "project-id", "Daily digest", "desc", "daily", "{}").await?;
db.get_routine("id").await?;
db.list_routines("project-id").await?;
db.update_routine("id", "name", "desc", "weekly", "{}", "active").await?;
db.update_routine_status("id", "paused").await?;
db.delete_routine("id").await?;

// Preferences
db.set_preference("theme", "dark").await?;
db.get_preference("theme").await?;             // Option<String>
```

### Chat Feed Persistence

Persists chat history across app restarts. Used by `spawn_and_monitor` automatically when `PersistOptions` is provided.

```rust
use keel_db::ChatFeedRow;

// Add a feed item:
db.add_chat_feed_item(
    "project-id",
    "main",           // feed_key
    "assistant_text", // feed_type
    "\"Hello!\"",     // data_json (JSON-encoded)
    "desktop",        // source
).await?;

// Load feed history:
let items: Vec<ChatFeedRow> = db.list_chat_feed("project-id", "main").await?;
// ChatFeedRow { feed_type, data_json, source, timestamp }

// Clear feed:
db.clear_chat_feed("project-id", "main").await?;
```

---

## keel-channels

Channel adapters for messaging platforms. Each adapter implements the `Channel` trait.

### Channel Trait

```rust
use keel_channels::Channel;

#[async_trait]
pub trait Channel: Send + Sync {
    async fn connect(&mut self) -> anyhow::Result<()>;
    async fn disconnect(&mut self) -> anyhow::Result<()>;
    async fn send_message(&self, channel_id: &str, text: &str) -> anyhow::Result<()>;
    async fn send_typing(&self, _channel_id: &str) -> anyhow::Result<()> { Ok(()) }  // default no-op
    fn status(&self) -> ChannelStatus;
    fn channel_type(&self) -> &str;
    fn message_receiver(&mut self) -> Option<mpsc::UnboundedReceiver<ChannelMessage>>;
}
```

### Types

```rust
use keel_channels::{ChannelConfig, ChannelMessage, ChannelStatus, Attachment};

pub struct ChannelConfig {
    pub channel_type: String,    // "telegram" or "slack"
    pub token: String,           // Bot token
    pub extra: serde_json::Value, // Additional config (e.g., Slack app_token)
}

pub struct ChannelMessage {
    pub id: String,
    pub source: String,          // "telegram" or "slack"
    pub channel_id: String,      // Platform-specific chat/channel ID
    pub sender_id: String,
    pub sender_name: String,
    pub text: String,
    pub timestamp: DateTime<Utc>,
    pub reply_to: Option<String>,
    pub attachments: Vec<Attachment>,
}

pub enum ChannelStatus { Disconnected, Connecting, Connected, Error(String) }
```

### Adapters

**Telegram** — Long-polling via `getUpdates`, supports `send_typing`:

```rust
use keel_channels::TelegramChannel;

let mut tg = TelegramChannel::new("bot-token".to_string());
tg.connect().await?;
let mut rx = tg.message_receiver().unwrap();
// rx.recv().await gives ChannelMessage values
tg.send_message("chat-id", "Reply text").await?;
tg.send_typing("chat-id").await?;  // Shows "typing..." indicator
```

**Slack** — Socket Mode WebSocket + `chat.postMessage`:

```rust
use keel_channels::SlackChannel;

let mut slack = SlackChannel::new(
    "xoxb-bot-token".to_string(),
    "xapp-app-level-token".to_string(),
);
slack.connect().await?;
let mut rx = slack.message_receiver().unwrap();
slack.send_message("C12345678", "Reply text").await?;
```

### ChannelRegistry

Low-level registry for managing multiple adapters directly. Most apps should use `ChannelManager` from `keel-tauri` instead.

```rust
use keel_channels::ChannelRegistry;

let mut registry = ChannelRegistry::new();
registry.register("tg".to_string(), Box::new(tg_channel));
registry.get("tg");                           // Option<&dyn Channel>
registry.list();                               // Vec<(&str, ChannelStatus)>
registry.connect_all().await;
registry.disconnect_all().await;
registry.unregister("tg");                     // Option<Box<dyn Channel>>
```

---

## keel-scheduler

Heartbeat and cron scheduling. Produces `KeelInput` events into the keel-events queue.

### Scheduler

Manages all heartbeat and cron tasks with a unified API.

```rust
use keel_scheduler::{Scheduler, HeartbeatConfig, CronJobConfig};
use keel_events::EventQueueHandle;

let scheduler = Scheduler::new(queue_handle);

// Add a heartbeat (fires every 30 minutes):
let hb_id = scheduler.add_heartbeat(HeartbeatConfig {
    interval: std::time::Duration::from_secs(30 * 60),
    prompt: "Check for anything that needs attention.".to_string(),
    active_hours: Some((9, 17)),  // UTC hours, suppress outside 9am-5pm
    suppression_token: "heartbeat_ok".to_string(),
    project_id: Some("proj-123".to_string()),
});

// Remove a heartbeat:
scheduler.remove_heartbeat(&hb_id);

// Add a cron job (6-field: sec min hour dom month dow):
let cron_id = scheduler.add_cron(CronJobConfig {
    id: "daily-digest".to_string(),
    name: "Daily Digest".to_string(),
    expression: "0 0 9 * * *".to_string(),  // Every day at 9:00 AM
    prompt: "Summarize yesterday's activity.".to_string(),
    enabled: true,
    project_id: Some("proj-123".to_string()),
})?;

// Remove a cron job:
scheduler.remove_cron(&cron_id);

// Graceful shutdown:
scheduler.shutdown().await;

// Counts:
scheduler.heartbeat_count();
scheduler.cron_count();
```

### HeartbeatConfig

```rust
pub struct HeartbeatConfig {
    pub interval: Duration,              // Default: 30 minutes
    pub prompt: String,
    pub active_hours: Option<(u32, u32)>, // (start_hour, end_hour) in UTC, wraps midnight
    pub suppression_token: String,        // Token agent returns when nothing to do
    pub project_id: Option<String>,
}
```

### CronJobConfig

```rust
pub struct CronJobConfig {
    pub id: String,
    pub name: String,
    pub expression: String,    // 6-field cron: "sec min hour dom month dow"
    pub prompt: String,
    pub enabled: bool,
    pub project_id: Option<String>,
}
```

### ScheduleType

High-level schedule definitions that convert to cron expressions.

```rust
use keel_scheduler::ScheduleType;

let daily = ScheduleType::Daily { time_of_day: "09:30".to_string() };
daily.to_cron_expression();   // Some("0 30 9 * * *")
daily.next_occurrence();       // Some(DateTime<Utc>)

let weekdays = ScheduleType::Weekdays { time_of_day: "17:00".to_string() };
let weekly = ScheduleType::Weekly { day_of_week: 1, time_of_day: "10:00".to_string() };
let monthly = ScheduleType::Monthly { day_of_month: 15, time_of_day: "08:00".to_string() };
let raw_cron = ScheduleType::Cron { expression: "0 */5 * * * *".to_string() };
let interval = ScheduleType::Interval { seconds: 300 }; // No cron equivalent
```

---

## keel-events

Core event system. All inputs (messages, heartbeats, cron triggers, hooks, webhooks, agent-to-agent) flow through a single ordered queue.

### EventQueue

```rust
use keel_events::{EventQueue, EventQueueHandle, KeelInput};

// Create queue + producer handle:
let (queue, handle) = EventQueue::new();
// handle is Clone — distribute to any number of producers.

// Process events (blocks until all handles dropped):
queue.process(|input: KeelInput| async move {
    match input.input_type {
        InputType::Message => { /* handle user message */ }
        InputType::Heartbeat => { /* handle heartbeat */ }
        InputType::Cron => { /* handle cron trigger */ }
        _ => {}
    }
}).await;

// Or with a shutdown signal:
queue.process_until(handler_fn, shutdown_rx).await;

// Push an event from any producer:
handle.push(KeelInput::message("telegram", "chat-123", "Hello!"))?;
```

### KeelInput

```rust
use keel_events::{KeelInput, InputType, InputSource};

pub struct KeelInput {
    pub id: String,                    // Auto-generated UUID
    pub input_type: InputType,         // Message, Heartbeat, Cron, Hook, Webhook, AgentMessage
    pub source: InputSource,           // { channel, identifier }
    pub payload: serde_json::Value,
    pub session_key: Option<String>,
    pub project_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

// Convenience constructors:
KeelInput::message("telegram", "chat-123", "Hello!")
KeelInput::heartbeat("Check for updates")
KeelInput::cron("daily-digest", "Summarize activity")
KeelInput::hook(HookEvent::SessionCompleted { session_key: "s1".into() })
KeelInput::webhook("/github", payload_json)
KeelInput::agent_message("agent-a", "agent-b", "Task complete")

// Chaining:
let input = KeelInput::message("slack", "C123", "Hi")
    .with_session("session-key".into())
    .with_project("project-id".into());
```

### EventDispatcher

Routes inputs to registered handlers based on input type.

```rust
use keel_events::{EventDispatcher, InputHandler, HandlerResponse};
use std::sync::Arc;

let mut dispatcher = EventDispatcher::new();

// Implement InputHandler:
struct MyMessageHandler;

#[async_trait]
impl InputHandler for MyMessageHandler {
    async fn handle(&self, input: &KeelInput) -> anyhow::Result<HandlerResponse> {
        // Process the input...
        Ok(HandlerResponse::Processed)
    }

    fn handles(&self, input_type: &InputType) -> bool {
        matches!(input_type, InputType::Message)
    }
}

dispatcher.register(Arc::new(MyMessageHandler));

// Dispatch an input to all matching handlers:
let responses = dispatcher.dispatch(&input).await;

// HandlerResponse variants:
// Processed — handled successfully
// Suppressed — intentionally skipped (e.g., heartbeat "all clear")
// Forward { to, payload } — forward to another handler/agent
// Error(String) — handler failed
```

### HookEvent

Lifecycle events for the hook system:

```rust
use keel_events::HookEvent;

pub enum HookEvent {
    AppStarted,
    AppStopping,
    SessionStarted { session_key: String },
    SessionCompleted { session_key: String },
    SessionError { session_key: String, error: String },
    RoutineTriggered { routine_id: String },
    RoutineCompleted { routine_id: String },
    Custom { name: String, data: serde_json::Value },
}
```

---

## keel-memory

Persistent memory system with full-text search and optional markdown file mirroring.

### MemoryStore

```rust
use keel_memory::{MemoryStore, Memory, MemoryCategory, MemoryQuery};
use std::sync::Arc;

// Create store (reuse an existing libsql connection):
let store = MemoryStore::new(conn.clone()).await?;

// Or with markdown mirroring (writes .md files alongside DB):
let store = MemoryStore::new_with_markdown_dir(
    conn.clone(),
    PathBuf::from("/path/to/memories/"),
).await?;

// Create a memory:
let mem = store.create(
    "project-id",
    "User prefers dark mode and concise responses",
    MemoryCategory::Preference,
    "agent",                    // source: "agent", "user", "session:<id>", "compaction"
    vec!["ui".into(), "style".into()],
).await?;

// Get by ID:
let mem = store.get("memory-id").await?;  // Option<Memory>

// Update:
store.update("memory-id", "Updated content", vec!["new-tag".into()]).await?;

// Delete:
store.delete("memory-id").await?;

// List by project:
let memories = store.list_by_project("project-id").await?;

// List by category:
let prefs = store.list_by_category("project-id", MemoryCategory::Preference).await?;

// Full-text search:
let results = store.search(MemoryQuery {
    project_id: Some("project-id".into()),
    search_text: Some("dark mode".into()),
    category: Some(MemoryCategory::Preference),
    tags: vec!["ui".into()],
    limit: Some(10),
    offset: None,
}).await?;
```

### Types

```rust
pub struct Memory {
    pub id: String,
    pub project_id: String,
    pub content: String,
    pub category: MemoryCategory,
    pub source: String,            // "agent", "user", "session:<id>", "compaction"
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub enum MemoryCategory {
    Conversation,  // Summarized conversation context
    Preference,    // User preferences and settings
    Context,       // Project/domain context
    Skill,         // Learned skills and patterns
    Fact,          // Factual information
}
// Implements Display, FromStr, Serialize, Deserialize

pub struct MemoryQuery {
    pub project_id: Option<String>,
    pub category: Option<MemoryCategory>,
    pub search_text: Option<String>,   // FTS5 MATCH — results ranked by relevance
    pub tags: Vec<String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}
```

### Compaction

Build compaction prompts for summarizing conversation history into memories:

```rust
use keel_memory::{build_compaction_prompt, compaction_to_memory, CompactionConfig};
```

### Markdown Mirroring

Memories can be mirrored as human-readable markdown files:

```rust
use keel_memory::{write_memory_file, read_memory_file, delete_memory_file};
```

---

## Common Patterns

### Tauri Setup in lib.rs

The standard pattern for setting up a Keel-based Tauri app:

```rust
// src-tauri/src/lib.rs

use keel_tauri::keel_db::Database;
use keel_tauri::keel_db::db::default_data_dir;
use keel_tauri::keel_events::EventQueue;
use keel_tauri::keel_scheduler::Scheduler;
use keel_tauri::keel_sessions::claude_path;
use keel_tauri::state::AppState;
use keel_tauri::chat_session::ChatSessionState;
use keel_tauri::channel_manager::ChannelManager;
use std::sync::Arc;
use tokio::sync::Mutex;

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                // 1. Resolve Claude CLI path (must happen before spawning sessions)
                claude_path::init();

                // 2. Connect database
                let data_dir = default_data_dir("MyApp");
                let db = Database::connect(&data_dir.join("app.db"))
                    .await
                    .expect("Failed to connect database");

                // 3. Set up event queue
                let (event_queue, queue_handle) = EventQueue::new();

                // 4. Set up scheduler
                let scheduler = Scheduler::new(queue_handle.clone());

                // 5. Register app state
                app_handle.manage(AppState {
                    db: db.clone(),
                    event_queue: Some(queue_handle),
                    scheduler: Some(Arc::new(Mutex::new(scheduler))),
                });

                // 6. Register chat session state (for --resume)
                app_handle.manage(ChatSessionState::default());

                // 7. Set up channel manager (if using messaging channels)
                let (channel_manager, mut message_rx) = ChannelManager::new();
                app_handle.manage(channel_manager);

                // 8. Spawn event queue processor
                tokio::spawn(async move {
                    event_queue.process(|input| async move {
                        // Route inputs to handlers
                        eprintln!("Event: {:?}", input.input_type);
                    }).await;
                });

                // 9. Spawn channel message consumer
                let handle = app_handle.clone();
                tokio::spawn(async move {
                    while let Some((registry_id, msg)) = message_rx.recv().await {
                        eprintln!("Channel message from {}: {}", registry_id, msg.text);
                        // Route to agent session, emit events, etc.
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::send_message,
            commands::reset_conversation,
            commands::list_projects,
            // ... more commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Command Registration

Group commands by domain in separate files, then register in `lib.rs`:

```rust
// src-tauri/src/commands/chat.rs

use keel_tauri::state::AppState;
use keel_tauri::chat_session::ChatSessionState;
use keel_tauri::session_runner::{spawn_and_monitor, PersistOptions};
use keel_tauri::workspace::build_system_prompt;
use keel_tauri::paths::expand_tilde;
use std::path::Path;

#[tauri::command]
pub async fn send_message(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    chat_state: tauri::State<'_, ChatSessionState>,
    prompt: String,
    workspace_path: String,
) -> Result<(), String> {
    let resume_id = chat_state.get().await;
    let work_dir = expand_tilde(Path::new(&workspace_path));

    let system_prompt = build_system_prompt(
        &work_dir,
        "You are a helpful assistant.",
        None,
        &[("instructions.md", "Instructions")],
    );

    let _handle = spawn_and_monitor(
        &app_handle,
        "main".to_string(),
        prompt,
        resume_id,
        Some(work_dir),
        Some(system_prompt),
        Some(chat_state.inner().clone()),
        Some(PersistOptions {
            db: state.db.clone(),
            project_id: "default".to_string(),
            feed_key: "main".to_string(),
            source: "desktop".to_string(),
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn reset_conversation(
    chat_state: tauri::State<'_, ChatSessionState>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    chat_state.clear().await;
    state.db.clear_chat_feed("default", "main")
        .await
        .map_err(|e| format!("Failed to clear feed: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn load_chat_history(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<keel_tauri::keel_db::ChatFeedRow>, String> {
    state.db.list_chat_feed("default", "main")
        .await
        .map_err(|e| format!("Failed to load history: {e}"))
}
```

### Event Emission Pattern

Emit events from any async context that has an `AppHandle`:

```rust
use keel_tauri::events::KeelEvent;
use tauri::Emitter;

// Session events (handled automatically by spawn_and_monitor):
let _ = app_handle.emit("keel-event", KeelEvent::FeedItem {
    session_key: "main".to_string(),
    item: feed_item,
});

// Toast notifications:
let _ = app_handle.emit("keel-event", KeelEvent::Toast {
    message: "Project created!".to_string(),
    variant: "success".to_string(),
});

// Channel status updates:
let _ = app_handle.emit("keel-event", KeelEvent::ChannelStatusChanged {
    channel_id: "tg-main".to_string(),
    channel_type: "telegram".to_string(),
    status: "connected".to_string(),
    error: None,
});
```

### Frontend Listening (TypeScript)

On the frontend, listen for all keel events on a single channel:

```typescript
import { listen } from "@tauri-apps/api/event";

// KeelEvent is a tagged union: { type: string, data: {...} }
type KeelEvent =
  | { type: "FeedItem"; data: { session_key: string; item: FeedItem } }
  | { type: "SessionStatus"; data: { session_key: string; status: string; error?: string } }
  | { type: "Toast"; data: { message: string; variant: string } }
  | { type: "ChannelMessageReceived"; data: { channel_type: string; channel_id: string; sender_name: string; text: string } }
  // ... etc.

const unlisten = await listen<KeelEvent>("keel-event", (event) => {
  const keelEvent = event.payload;
  switch (keelEvent.type) {
    case "FeedItem":
      // Update chat UI with keelEvent.data.item
      break;
    case "SessionStatus":
      // Update loading state
      break;
    case "Toast":
      // Show toast notification
      break;
  }
});
```
