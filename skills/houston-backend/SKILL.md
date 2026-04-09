---
name: houston-backend
description: "Houston Rust crates for AI agent desktop app backends with Tauri 2. Session management (spawn_and_monitor, SessionQueue), workspace_store (.houston/ file CRUD for tasks, routines, goals, channels, skills), houston-db (chat_feed SQLite), houston-channels (Telegram, Slack), houston-events, houston-scheduler, HoustonEvent emission. Files-first architecture."
---

# Houston Backend -- Rust Crate Reference

Rust crates for building Tauri 2 desktop app backends that manage AI agent sessions (Claude CLI), workspace persistence (.houston/ files), messaging channels (Telegram, Slack), scheduling, and event routing.

## Install

Most apps only need `houston-tauri` -- it re-exports everything:

```toml
[dependencies]
houston-tauri = "0.3"
```

Individual crates (rare -- only for non-Tauri contexts):

```toml
houston-sessions = "0.1"    # Claude CLI process management
houston-db = "0.2"          # SQLite (chat_feed + preferences only)
houston-channels = "0.1"    # Telegram, Slack adapters
houston-events = "0.1"      # Event queue
houston-scheduler = "0.1"   # Heartbeat and cron scheduling
```

## Rules

- **No `unwrap()` in production.** Use `?` with proper error mapping.
- **No `let _ = something.await`** for operations that can fail.
- **Tauri commands return `Result<T, String>`.** Map errors with `.map_err(|e| e.to_string())`.
- **All events emit via** `app_handle.emit("houston-event", HoustonEvent::...)`.
- **Use `expand_tilde()`** for user-facing paths. Rust `PathBuf` does not expand `~`.

---

## houston-tauri

The main integration crate. Provides session lifecycle, workspace persistence, channel management, and app state.

### Imports

```rust
use houston_tauri::{
    // Re-exported sub-crates
    houston_db, houston_sessions, houston_events, houston_scheduler, houston_channels,
    // Direct modules
    state::AppState,
    events::HoustonEvent,
    session_runner::{spawn_and_monitor, SessionResult, PersistOptions},
    agent_sessions::AgentSessionMap,
    chat_session::ChatSessionState,
    channel_manager::{ChannelManager, RoutedMessage},
    workspace::{seed_file, build_system_prompt, list_files, read_file},
    workspace_store::{WorkspaceStore, types::*},
    paths::expand_tilde,
};
```

### AppState

```rust
pub struct AppState {
    pub db: Database,
    pub event_queue: Option<EventQueueHandle>,
    pub scheduler: Option<Arc<Mutex<Scheduler>>>,
}

// Setup:
let db = Database::connect(&data_dir.join("app.db")).await?;
app.manage(AppState { db, event_queue: Some(handle), scheduler: Some(sched) });
```

### HoustonEvent

Enum for Rust-to-JS event emission. Serialized as `{ type, data }`.

| Variant | Data fields |
|---------|-------------|
| `FeedItem` | `agent_path`, `session_key`, `item: FeedItem` |
| `SessionStatus` | `agent_path`, `session_key`, `status`, `error` |
| `Toast` | `message`, `variant` |
| `AuthRequired` | `message` |
| `CompletionToast` | `title`, `issue_id` |
| `EventReceived` | `event_id`, `event_type`, `source_channel`, `source_identifier`, `summary` |
| `EventProcessed` | `event_id`, `status` |
| `HeartbeatFired` | `prompt`, `project_id` |
| `CronFired` | `job_id`, `job_name`, `prompt` |
| `ChannelMessageReceived` | `channel_type`, `channel_id`, `sender_name`, `text` |
| `ChannelStatusChanged` | `channel_id`, `channel_type`, `status`, `error` |
| `RoutineRunChanged` | `routine_id`, `run_id`, `status` |
| `RoutinesChanged` | `project_id` |

```rust
app_handle.emit("houston-event", HoustonEvent::FeedItem { agent_path, session_key, item })?;
app_handle.emit("houston-event", HoustonEvent::Toast { message: "Done".into(), variant: "success".into() })?;
```

### spawn_and_monitor

Core session lifecycle. Spawns Claude CLI, emits events, persists feed, tracks session ID.

```rust
pub fn spawn_and_monitor(
    app_handle: &tauri::AppHandle,
    agent_path: String,
    session_key: String,
    prompt: String,
    resume_id: Option<String>,
    working_dir: PathBuf,
    system_prompt: Option<String>,
    chat_state: Option<ChatSessionState>,
    persist: Option<PersistOptions>,
    pid_map: Option<SessionPidMap>,
) -> tokio::task::JoinHandle<SessionResult>
```

**Key behaviors:**
- Auto-calls `claude_path::init()` (idempotent via `OnceLock`)
- Emits `HoustonEvent::FeedItem { agent_path, session_key, item }` and `HoustonEvent::SessionStatus { agent_path, session_key, ... }`
- Writes `.houston/sessions/{session_key}.sid` under the agent folder for `--resume` on restart
- Persists feed items keyed by `claude_session_id`; the initial user message is buffered in `PersistOptions.user_message` and written on `SessionId` arrival

### AgentSessionMap

One `ChatSessionState` per `(agent_path, session_key)` pair. Loads/saves `.houston/sessions/{session_key}.sid`.

```rust
let session_map: AgentSessionMap = Default::default();
let key = format!("{agent_path}:{session_key}");
let state = session_map.get_for_session(&key, &agent_path, &session_key).await;
// When the agent is deleted:
session_map.remove_agent(&format!("{agent_path}:")).await;
```

### ChannelManager

Starts/stops channel adapters, routes messages into one receiver.

```rust
let (manager, mut message_rx) = ChannelManager::new();
manager.start_channel("tg-main".into(), config).await?;
while let Some((registry_id, msg)) = message_rx.recv().await {
    // Route to agent session, emit events
}
```

### workspace_store

File-backed CRUD for `.houston/` workspace data. 23 Tauri commands.

**Tauri commands (23 total):**

| Group | Commands |
|-------|----------|
| Tasks | `list_tasks`, `create_task`, `update_task`, `delete_task` |
| Routines | `list_routines`, `create_routine`, `update_routine`, `delete_routine` |
| Goals | `list_goals`, `create_goal`, `update_goal`, `delete_goal` |
| Channels | `list_channels_config`, `add_channel_config`, `remove_channel_config` |
| Skills | `list_skills`, `read_skill`, `write_skill`, `delete_skill` |
| Log | `append_log`, `read_log` |
| Config | `read_config`, `write_config` |

All operations use atomic temp-file + rename to prevent corruption.

---

## houston-sessions

Claude CLI session management. Spawns `claude -p --output-format stream-json`, parses NDJSON.

| Export | What it does |
|--------|-------------|
| `SessionManager` | Spawns Claude CLI sessions |
| `StreamAccumulator` | Accumulates NDJSON deltas into FeedItems |
| `FeedItem` | Chat feed item enum (AssistantText, Thinking, ToolCall, etc.) |
| `claude_path` | PATH resolution for macOS .app bundles (shell, nvm, common dirs) |
| Concurrency | Global semaphore limits concurrent Claude processes |

---

## houston-db

Minimal SQLite layer (libsql). Two tables only.

### chat_feed

```rust
db.add_chat_feed_item_by_session(&claude_session_id, &feed_type, &data_json, "desktop").await?;
let rows = db.list_chat_feed_by_session(&claude_session_id).await?;
db.clear_chat_feed_by_session(&claude_session_id).await?;
```

### preferences

```rust
db.set_preference("last_project_id", "abc-123").await?;
let val = db.get_preference("last_project_id").await?;
```

---

## houston-channels

Channel adapters for messaging platforms.

### Channel trait

```rust
trait Channel: Send + Sync {
    async fn connect(&self) -> Result<()>;
    async fn disconnect(&self) -> Result<()>;
    async fn send_message(&self, channel_id: &str, text: &str) -> Result<()>;
    async fn send_typing(&self, channel_id: &str) -> Result<()> { Ok(()) }
    fn status(&self) -> ChannelStatus;
    fn channel_type(&self) -> &str;
    fn message_receiver(&self) -> &mpsc::UnboundedReceiver<ChannelMessage>;
}
```

### Adapters

- **`TelegramChannel`** -- long-polling via `getUpdates`, supports `send_typing`
- **`SlackChannel`** -- Socket Mode WebSocket, `chat.postMessage`

Also: `ChannelRegistry`, `ChannelConfig`, `ChannelMessage`, `ChannelStatus`.

---

## houston-events

Event queue for hooks, webhooks, and lifecycle events.

```rust
let (event_queue, queue_handle) = EventQueue::new();
```

---

## houston-scheduler

Cron jobs and heartbeat timer scheduling.

```rust
let scheduler = Scheduler::new(queue_handle);
scheduler.set_heartbeat(HeartbeatConfig { enabled: true, interval_minutes: 30, prompt: "Check in".into(), .. });
scheduler.add_cron_job(CronJobConfig { id: "daily".into(), name: "Daily digest".into(), cron: "0 9 * * *".into(), prompt: "Summarize".into() });
```

---

## .houston/ Workspace Convention

Every Houston app stores agent-visible data in `.houston/`:

```
~/Documents/{AppName}/{ProjectName}/
  .houston/
    tasks.json          # Task[]
    routines.json       # Routine[]
    goals.json          # Goal[]
    channels.json       # ChannelEntry[]
    skills/             # One .md per skill
    log.jsonl           # Append-only audit trail
    config.json         # ProjectConfig
    sessions/
      {session_key}.sid # Per-conversation Claude session id for --resume
  CLAUDE.md             # Agent instructions
```

**Design rules:**
- Agents read/write files directly -- no CLI intermediary
- All writes use atomic temp-file + rename
- Runtime state (channel connection status) stays in memory, not in files
- SQLite is only for chat_feed (conversation replay) and preferences (app settings)
