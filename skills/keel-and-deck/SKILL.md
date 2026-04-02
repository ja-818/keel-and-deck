---
name: keel-and-deck
description: Build AI agent desktop apps with Keel & Deck. Guides you through scaffolding, architecture, and wiring the frontend (Deck UI) to the backend (Keel Rust crates) via Tauri 2.
---

# Keel & Deck — Build AI Agent Desktop Apps

## What This Is

Keel & Deck is a framework for building AI agent desktop apps. Two halves of one ship:

- **Deck** — React UI components (`@deck-ui/*`). Chat panels, kanban boards, event feeds, memory browsers, routine management, channel integrations, and a full design system. All props-driven, no store dependencies.
- **Keel** — Rust backend crates (`keel-*`). Session management, database, event queues, scheduling, channel adapters, memory storage, and Tauri integration. Apps import everything through `keel-tauri`.
- **Tauri 2** — Connects them. Rust commands on the backend, React on the frontend, IPC in between.

## Quick Start

### Prerequisites

- Rust (stable, with `cargo`)
- Node.js 20+
- pnpm 9+
- Claude CLI (`claude` on PATH)

### Scaffold and Run

```bash
npx create-keel-and-deck-app my-app
cd my-app
pnpm install
pnpm tauri dev
```

This gives you a working desktop app with a Claude-powered agent, ready to customize.

## What You Get

The scaffolded app is a canvas for AI agent work:

```
+---------------------------------------------+
| Sidebar       | Tab Bar              |       |
| (agents/      |----------------------|       |
|  folders)     | Chat (split panel)   |       |
|               |                      |       |
|               | Files | Instructions |       |
+---------------------------------------------+
```

- **Sidebar** — Manages agents and workspace folders. Add, select, delete.
- **Chat** — Split panel. Left side: conversation with the agent. The agent is Claude Code running as a subprocess in the selected folder.
- **Files tab** — Browse workspace files with type icons, sizes, open/reveal/delete actions.
- **Instructions tab** — Shows and edits `CLAUDE.md` and other instruction files. Auto-saves on blur.

The agent runs Claude CLI (`claude -p --output-format stream-json`) in the workspace directory. Messages stream in real-time. Session IDs are tracked for `--resume` continuity.

## Install More Skills

The `keel-and-deck` skill (this file) is the meta guide. For deep component and crate references, install the full skill set:

```bash
npx skills add ja-818/keel-and-deck
```

This installs all skills:

| Skill | What it teaches |
|-------|----------------|
| `deck-ui` | React component reference. 70+ components across 10 packages, with props tables, code examples, and composition patterns. |
| `keel-backend` | Rust crate reference. Session management, database models, channel adapters, event queues, scheduling, memory, and Tauri integration. |
| `keel` | CLI commands for agents running INSIDE your app. Task and routine management via `keel task` and `keel routine`. |

## Architecture

Four layers, top to bottom:

### 1. Frontend (React + Zustand + @deck-ui)

```
@deck-ui/core       — Design system, shadcn/ui, utilities, CSS tokens
@deck-ui/chat       — ChatPanel, ChatInput, ToolActivity, feed utilities
@deck-ui/board      — KanbanBoard, KanbanCard, KanbanDetailPanel
@deck-ui/layout     — AppSidebar, TabBar, SplitView
@deck-ui/connections — ChannelConnectionCard, ChannelSetupForm, ConnectionsView
@deck-ui/events     — EventFeed
@deck-ui/memory     — MemoryBrowser
@deck-ui/routines   — RoutinesGrid, ScheduleBuilder, HeartbeatConfigPanel
@deck-ui/skills     — SkillsGrid, SkillDetailPage
@deck-ui/review     — ReviewSplit, DeliverableCard, UserFeedback
@deck-ui/workspace  — FilesBrowser, InstructionsPanel
```

All components are props-driven. Your app creates Zustand stores and maps domain data to component props (the Thin Wrapper Pattern).

### 2. Backend (Rust + keel-* crates via Tauri commands)

```
keel-tauri      — Tauri integration: state, events, session runner, channel manager
keel-sessions   — Claude CLI session spawning, NDJSON parsing, concurrency
keel-db         — Database models, repos, migrations (libsql/SQLite)
keel-channels   — Channel adapters (Telegram, Slack), Channel trait, registry
keel-events     — Event queue for hooks, webhooks, lifecycle events
keel-memory     — Agent memory store (vector search, persistence)
keel-scheduler  — Cron jobs and heartbeat timer scheduling
keel-cli        — Board management via bash commands (used by agents)
```

Apps import everything through `keel-tauri`, which re-exports all other crates.

### 3. IPC (Tauri bridge)

- **`invoke`** — Request/response. Frontend calls a Rust command, gets a result. Used for CRUD operations (create issue, list files, save config).
- **Events** — Streaming. Backend emits `KeelEvent::FeedItem` and `KeelEvent::SessionStatus` as the agent works. Frontend subscribes with `useKeelEvent` from `@deck-ui/core`.

```tsx
// Frontend: call a Rust command
const issues = await invoke<Issue[]>("list_issues", { projectId })

// Frontend: subscribe to streaming events
useKeelEvent<FeedItem>("keel-event", (payload) => {
  store.addFeedItem(payload)
})
```

```rust
// Backend: define a Tauri command
#[tauri::command]
async fn list_issues(state: State<'_, AppState>, project_id: String) -> Result<Vec<Issue>, String> {
    let db = state.db.lock().await;
    db.list_issues(&project_id).await.map_err(|e| e.to_string())
}

// Backend: emit a streaming event
app_handle.emit("keel-event", KeelEvent::FeedItem { session_key, item })?;
```

### 4. Agent (Claude CLI subprocess)

The agent is Claude CLI spawned by `keel-tauri::session_runner::spawn_and_monitor()`. It runs in the workspace directory, streams NDJSON output, and the session runner parses it into `FeedItem` events.

```rust
let handle = spawn_and_monitor(
    &app_handle, session_key, prompt, resume_id,
    working_dir, system_prompt,
    Some(chat_state),   // tracks session ID for --resume
    Some(PersistOptions { db, project_id, feed_key, source }),
);
```

The agent can use `keel` CLI commands to manage its own task board and routines.

## Adding Features

### Add a Kanban Board

**Components:** `KanbanBoard`, `KanbanDetailPanel` from `@deck-ui/board`
**Store:** Zustand store for issues (list, create, update, delete)
**Tauri commands:** `list_issues`, `create_issue`, `update_issue`, `delete_issue`

```tsx
import { KanbanBoard } from "@deck-ui/board"
import type { KanbanItem, KanbanColumnConfig } from "@deck-ui/board"

const columns: KanbanColumnConfig[] = [
  { id: "active", label: "Active", statuses: ["running"] },
  { id: "review", label: "Review", statuses: ["needs_you"] },
  { id: "done", label: "Done", statuses: ["done"] },
]

// In your thin wrapper:
const items = issues.map((issue) => ({
  id: issue.id,
  title: issue.title,
  subtitle: issue.description,
  status: issue.status,
  updatedAt: issue.updated_at,
}))

<KanbanBoard columns={columns} items={items} onSelect={setSelected} />
```

### Add Telegram/Slack Channels

**Components:** `ChannelConnectionCard`, `ChannelSetupForm`, `ChannelsSection` from `@deck-ui/connections`
**Backend:** `ChannelManager` from `keel-tauri`, `TelegramChannel`/`SlackChannel` from `keel-channels`
**Tauri commands:** `add_channel`, `connect_channel`, `disconnect_channel`, `delete_channel`

```rust
// Backend: start a channel
let (manager, mut message_rx) = ChannelManager::new();
manager.start_channel("tg-main".into(), config).await?;

// Route incoming messages to the agent
while let Some((registry_id, msg)) = message_rx.recv().await {
    // Prefix with [ChannelName] and send to agent session
}
```

```tsx
// Frontend: channel setup form
<ChannelSetupForm
  type="telegram"
  onSubmit={(config) => invoke("add_channel", { type: "telegram", config })}
/>
```

### Add an Event Feed

**Components:** `EventFeed` from `@deck-ui/events`
**Store:** Zustand store for events (list, filter)
**Tauri commands:** `list_events`
**Backend:** `keel-events` event queue

```tsx
import { EventFeed } from "@deck-ui/events"

<EventFeed
  events={events}
  filter={activeFilter}
  onFilterChange={setActiveFilter}
  onEventClick={(event) => openDetail(event)}
/>
```

### Add Memory

**Components:** `MemoryBrowser` from `@deck-ui/memory`
**Backend:** `MemoryStore` from `keel-memory`
**Tauri commands:** `search_memories`, `create_memory`, `delete_memory`

```tsx
import { MemoryBrowser } from "@deck-ui/memory"

<MemoryBrowser
  memories={memories}
  onSearch={(query) => searchMemories(query)}
  onMemoryDelete={(m) => deleteMemory(m.id)}
/>
```

### Add Routines

**Components:** `RoutinesGrid`, `ScheduleBuilder`, `HeartbeatConfigPanel` from `@deck-ui/routines`
**Backend:** `Scheduler` from `keel-scheduler`
**Tauri commands:** `list_routines`, `create_routine`, `pause_routine`, `resume_routine`, `run_routine`

```tsx
import { RoutinesGrid } from "@deck-ui/routines"

<RoutinesGrid
  routines={routines}
  onSelectRoutine={(id) => openRoutine(id)}
/>
```

### Add Brand Theming

Override `--color-primary` in your app's `globals.css`:

```css
@import "@deck-ui/core/src/globals.css";

@theme {
  --color-primary: #c0392b;
  --color-primary-foreground: #ffffff;
  --color-ring: #c0392b;
}
```

Every component using `bg-primary`, `text-primary-foreground`, etc. automatically picks up the brand color.

## The Thin Wrapper Pattern

Deck UI components are props-driven. They accept data and callbacks, nothing else. Your app is responsible for state management. The pattern:

1. Create a Zustand store with your domain data
2. Write a thin wrapper component that reads from the store and maps to @deck-ui props
3. The @deck-ui component renders. No store imports inside it.

```tsx
// stores/issues.ts — your Zustand store
import { create } from "zustand"
import { invoke } from "@tauri-apps/api/core"

interface IssueStore {
  issues: Issue[]
  fetch: (projectId: string) => Promise<void>
  approve: (id: string) => Promise<void>
}

export const useIssueStore = create<IssueStore>((set) => ({
  issues: [],
  fetch: async (projectId) => {
    const issues = await invoke<Issue[]>("list_issues", { projectId })
    set({ issues })
  },
  approve: async (id) => {
    await invoke("update_issue", { id, status: "done" })
    // re-fetch or optimistic update
  },
}))

// components/ActivityBoard.tsx — thin wrapper
import { KanbanBoard } from "@deck-ui/board"
import { useIssueStore } from "@/stores/issues"

export function ActivityBoard() {
  const issues = useIssueStore((s) => s.issues)
  const approve = useIssueStore((s) => s.approve)

  // Map domain types to generic KanbanItem
  const items = issues.map((issue) => ({
    id: issue.id,
    title: issue.title,
    subtitle: issue.description,
    status: issue.status,
    updatedAt: issue.updated_at,
  }))

  return (
    <KanbanBoard
      columns={columns}
      items={items}
      onApprove={(item) => approve(item.id)}
      runningStatuses={["running"]}
      approveStatuses={["needs_you"]}
    />
  )
}
```

The wrapper is the only place where Zustand meets @deck-ui. The library never imports your stores. Your stores never import the library.

## Key Rules

1. **Props over stores** — @deck-ui components never import Zustand, Redux, or any state library. All data comes via props, all actions are callbacks.
2. **No `@/` path aliases in library code** — Use relative imports within packages, package imports (`@deck-ui/core`) between packages. Path aliases break in published libraries.
3. **Generic types** — Components use `KanbanItem`, `FeedItem`, `ChatMessage`. Apps map their domain types (Issue, Task, etc.) to these generic types at the app level.
4. **Tailwind CSS 4** — No `tailwind.config.ts`, no `postcss.config.js`. Configuration lives in CSS via `@theme` blocks. Uses `@tailwindcss/vite` plugin.
5. **Monochrome design** — Near-black primary (`#0d0d0d`), white background. Color only for status indicators, running glow, channel avatars, and links. Apps override `--color-primary` for brand color.
6. **No silent failures** — Errors surface to the user. No swallowed errors. No `unwrap()` in production Rust.
7. **`streamdown/styles.css`** — Must be imported by the consuming app if using `ChatPanel`. The library does not import it.
8. **`expand_tilde()`** — Required for user-facing paths in Rust. `PathBuf` does not expand `~`.
