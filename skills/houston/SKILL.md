---
name: houston
description: "Build AI agent desktop apps with Houston framework. Tauri 2, React 19, Rust. Scaffold with create-houston-experience. Files-first architecture (.houston/ workspace). Wire @houston-ai components to houston-tauri Rust commands. workspace_store, session_runner, SessionQueue, ChatPanel, KanbanBoard. Claude Code/Codex session management."
---

# Houston -- Build AI Agent Desktop Apps

Framework for building desktop apps that orchestrate Claude Code, Codex, and other AI agents. **Houston UI** provides React components. **Houston** provides Rust backend crates. **Tauri 2** connects them.

## Quick Start

```bash
npx create-houston-experience my-app
cd my-app
pnpm install
pnpm tauri dev
```

You get a working app with Chat + CLAUDE.md editor. Add components as needed.

### Prerequisites

- Rust (stable), Node.js 20+, pnpm 9+, Claude CLI (`claude` on PATH)

## Architecture

```
+--------------------------------------------------------------+
|                     Your Tauri App                             |
+----------------------------+---------------------------------+
|  Houston UI (React)        |  Houston (Rust)                  |
|  @houston-ai/core          |  houston-tauri                   |
|  @houston-ai/chat          |    +-- workspace_store (.houston/)|
|  @houston-ai/board         |    +-- session_runner/queue       |
|  @houston-ai/layout        |    +-- channel_manager           |
|  @houston-ai/...           |    +-- houston-sessions (Claude)  |
|                             |    +-- houston-db (chat SQLite)  |
+----------------------------+---------------------------------+
|                    Tauri 2 IPC Bridge                          |
+----------------------------+---------------------------------+
|  .houston/ files           |  Claude Code / Codex / Other     |
|  (workspace data)          |  (AI agent processes)            |
+----------------------------+---------------------------------+
```

Four layers:
1. **Frontend** -- React + Zustand + @houston-ai components (props-driven, no store lock-in)
2. **Backend** -- Rust + houston-tauri (re-exports all sub-crates). Session lifecycle, workspace persistence, channels.
3. **IPC** -- Tauri `invoke` for request/response, `emit("houston-event", HoustonEvent)` for streaming
4. **Agent** -- Claude CLI spawned by `spawn_and_monitor()`, streams NDJSON output

## Files-First Architecture

Agent-visible data lives in `.houston/` workspace files (JSON + markdown), not in a database. Agents read and write files naturally. SQLite is only for chat conversation replay.

### .houston/ Workspace Convention

```
~/Documents/MyApp/MyProject/
  .houston/
    tasks.json          # Task[] -- kanban board items
    routines.json       # Routine[] -- recurring schedules
    goals.json          # Goal[] -- high-level objectives
    channels.json       # ChannelEntry[] -- messaging integrations
    skills/             # Agent skill instructions (one .md per skill)
    log.jsonl           # Session audit trail
    config.json         # ProjectConfig (name, model, effort)
    sessions/
      {session_key}.sid # Per-conversation Claude session id for --resume
  CLAUDE.md             # Agent instructions
```

**The rule:** If @houston-ai has a component that renders it, the data lives in `.houston/`.

### workspace_store Types

```typescript
// Task statuses: "queue" | "running" | "needs_you" | "done" | "cancelled"
interface Task { id: string; title: string; description: string; status: string; claude_session_id?: string }
interface Routine { id: string; name: string; description: string; trigger_type: string; trigger_config: object; status: string; approval_mode: string; claude_session_id?: string }
interface Goal { id: string; title: string; status: string }
interface ChannelEntry { id: string; channel_type: string; name: string; token: string }
interface Skill { name: string; instructions: string; learnings: string }
interface LogEntry { session_id: string; task_id?: string; status: string; duration_ms?: number; cost_usd?: number; timestamp: string }
interface ProjectConfig { name: string; claude_model?: string; claude_effort?: string }
```

## The Wiring Pattern

**workspace_store (Rust) -> Zustand store (JS) -> @houston-ai component (React)**

### Step 1: Backend reads/writes .houston/ files

```rust
// houston-tauri provides 23 Tauri commands for workspace CRUD
// Tasks: list_tasks, create_task, update_task, delete_task
// Routines: list_routines, create_routine, update_routine, delete_routine
// Goals: list_goals, create_goal, update_goal, delete_goal
// Channels: list_channels_config, add_channel_config, remove_channel_config
// Skills: list_skills, read_skill, write_skill, delete_skill
// Log: append_log, read_log
// Config: read_config, write_config
```

### Step 2: Zustand store calls Tauri commands

```tsx
import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"

interface TaskStore {
  tasks: Task[]
  fetch: (projectId: string) => Promise<void>
  create: (projectId: string, title: string, desc: string) => Promise<void>
  update: (projectId: string, id: string, updates: Partial<Task>) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  fetch: async (projectId) => {
    const tasks = await invoke<Task[]>("list_tasks", { projectId })
    set({ tasks })
  },
  create: async (projectId, title, description) => {
    await invoke("create_task", { projectId, title, description })
    get().fetch(projectId)
  },
  update: async (projectId, taskId, updates) => {
    await invoke("update_task", { projectId, taskId, updates })
    get().fetch(projectId)
  },
}))
```

### Step 3: Thin wrapper maps to @houston-ai props

```tsx
import { KanbanBoard } from "@houston-ai/board"
import { useTaskStore } from "@/stores/tasks"

export function TaskBoard() {
  const tasks = useTaskStore((s) => s.tasks)

  const items = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    subtitle: t.description,
    status: t.status,
    updatedAt: new Date().toISOString(),
  }))

  return <KanbanBoard columns={columns} items={items} onSelect={setSelected} />
}
```

The wrapper is the only place where Zustand meets @houston-ai. The library never imports your stores. Your stores never import the library.

## Starting Claude Sessions

### spawn_and_monitor

Every Claude session goes through `spawn_and_monitor`. Each session is scoped by
`(agent_path, session_key)` — session keys must be globally unique (e.g.
`activity-{uuid}`, `routine-{id}-run-{n}`, `chat-{agent_id}`). There is no
shared "main" session key.

```rust
use houston_tauri::session_runner::{spawn_and_monitor, PersistOptions};
use houston_tauri::chat_session::ChatSessionState;
use houston_tauri::agent_sessions::AgentSessionMap;

let agent_key = format!("{agent_path}:{session_key}");
let chat_state = agent_sessions
    .get_for_session(&agent_key, &agent_path, &session_key)
    .await;
let resume_id = chat_state.get().await;

let handle = spawn_and_monitor(
    &app_handle,
    agent_path.clone(),           // carried on emitted events for FE scoping
    session_key.clone(),          // e.g. "activity-{uuid}"
    user_prompt.clone(),
    resume_id,                    // Some(id) for --resume, None for new
    working_dir,                  // Claude process cwd
    Some(system_prompt),
    Some(chat_state),
    Some(PersistOptions {
        db,
        source: "desktop".into(),
        user_message: Some(user_prompt),   // persisted when SessionId arrives
        claude_session_id: None,
    }),
    Some(pid_map),
);
let result = handle.await.unwrap();
// result.claude_session_id is also written to .houston/sessions/{session_key}.sid
```

## Subscribing to Events

Use `useSessionEvents` from `@houston-ai/core` for real-time streaming. Feed
events carry both `agent_path` and `session_key`, so the frontend feed store
should be nested `Record<agentPath, Record<sessionKey, FeedItem[]>>` to make
cross-agent bleeding structurally impossible.

```tsx
import { useSessionEvents } from "@houston-ai/core"
import { listen } from "@tauri-apps/api/event"

useSessionEvents({
  listen,
  onFeedItem: (agentPath, sessionKey, item) =>
    store.pushFeedItem(agentPath, sessionKey, item),
  getActiveSession: () => store.active,   // { agentPath, sessionKey } | null
  onEvent: (event) => {
    switch (event.type) {
      case "ChannelMessageReceived": /* route to agent */ break
      case "RoutinesChanged": /* refresh routines */ break
    }
  },
})
```

## Adding Features

### Kanban Board

Components: `KanbanBoard`, `KanbanDetailPanel` from `@houston-ai/board`
Backend: `list_tasks`, `create_task`, `update_task`, `delete_task` from workspace_store

### Telegram/Slack Channels

Components: `ChannelConnectionCard`, `ChannelSetupForm`, `ChannelsSection` from `@houston-ai/connections`
Backend: `ChannelManager` from houston-tauri, `TelegramChannel`/`SlackChannel` from houston-channels

```rust
let (manager, mut message_rx) = ChannelManager::new();
manager.start_channel("tg-main".into(), config).await?;
while let Some((registry_id, msg)) = message_rx.recv().await {
    // Prefix with [ChannelName] and send to agent
    queue.send(format!("[{}] {}", msg.sender_name, msg.text).into())?;
}
```

### Routines

Components: `RoutinesGrid`, `ScheduleBuilder`, `HeartbeatConfig` from `@houston-ai/routines`
Backend: `Scheduler` from houston-scheduler, routine workspace_store commands

### Brand Theming

Override `--color-primary` in your CSS:

```css
@import "@houston-ai/core/src/globals.css";
@theme {
  --color-primary: #c0392b;
  --color-primary-foreground: #ffffff;
  --color-ring: #c0392b;
}
```

## Key Rules

1. **Props over stores** -- @houston-ai components never import state libraries. All data via props, all actions via callbacks.
2. **Files-first** -- agent-visible data in `.houston/` files. SQLite only for chat replay.
3. **No `@/` aliases in library** -- relative imports within packages, package imports between.
4. **Tailwind CSS 4** -- no config file, use `@theme` blocks in CSS. `@tailwindcss/vite` plugin.
5. **`streamdown/styles.css`** -- must be imported by the app if using ChatPanel.
6. **`expand_tilde()`** -- required for user-facing paths in Rust.
7. **`claude_path::init()`** -- called automatically by `spawn_and_monitor()`.
8. **Session ID persists per conversation** -- `session_runner` writes `.houston/sessions/{session_key}.sid` under the agent folder. No shared "main" file. Every conversation scoped independently.
9. **Session keys must be globally unique** -- use `activity-{uuid}`, `routine-{id}-run-{n}`, or similar. Never reuse strings like `"main"` or `"onboarding"` across agents — the frontend feed store is scoped by `(agent_path, session_key)`, but unique session keys are still the contract.

## Deeper Skill References

```bash
npx skills add ja-818/houston
```

| Skill | What it teaches |
|-------|----------------|
| `houston-ui` | All 10 React packages with component props and code examples |
| `houston-backend` | All Rust crates with types, functions, and integration patterns |
