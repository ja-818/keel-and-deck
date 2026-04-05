<p align="center">
  <strong>Houston</strong>
</p>

<p align="center">
  The framework for building AI agent desktop apps.
</p>

<p align="center">
  <a href="https://www.npmjs.com/org/houston-ai"><img src="https://img.shields.io/npm/v/@houston-ai/core?label=npm&color=0d0d0d" alt="npm"></a>
  <a href="https://crates.io/crates/houston-sessions"><img src="https://img.shields.io/crates/v/houston-sessions?color=0d0d0d" alt="crates.io"></a>
  <a href="https://github.com/ja-818/houston/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0d0d0d" alt="MIT License"></a>
  <a href="https://github.com/ja-818/houston/stargazers"><img src="https://img.shields.io/github/stars/ja-818/houston?color=0d0d0d" alt="Stars"></a>
  <a href="https://skills.sh"><img src="https://img.shields.io/badge/skills.sh-houston--ai-0d0d0d" alt="AI Skill"></a>
</p>

---

## What is this?

**Houston** gives you 10 React packages with 100+ production-ready components for AI agent UIs, plus Rust crates for session management, workspace persistence, and Tauri integration. Together they're a complete toolkit for building desktop apps that orchestrate Claude Code, Codex, and other AI agents.

Files-first architecture: agent-visible data lives in `.houston/` workspace files (JSON + markdown), not in a database. Agents read and write files naturally. The only SQL is for chat conversation replay.

Built with Tauri 2, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, and Framer Motion.

---

## Quick Start

```bash
npx create-houston-experience my-app
cd my-app
pnpm install
pnpm tauri dev
```

You get a working app with Chat + CLAUDE.md editor out of the box. Add components as you need them.

---

## Workspace Convention

Every Houston app stores agent-visible data in a `.houston/` folder inside the project workspace:

```
~/Documents/MyApp/MyProject/
  .houston/
    tasks.json          # Kanban board items
    routines.json       # Recurring schedules
    goals.json          # High-level objectives
    channels.json       # Messaging integrations (Telegram, Slack)
    skills/             # Agent skill instructions
      research.md       #   ## Instructions + ## Learnings
      writing.md
    log.jsonl           # Session audit trail
    config.json         # Project settings (model, effort)
  CLAUDE.md             # Agent instructions
```

**The rule:** if `@houston-ai` has a component that renders it, the data lives in `.houston/`. App-specific files go in their own folder.

Agents interact with these files directly -- no CLI intermediary, no SQL queries. The `workspace_store` module provides typed CRUD with atomic writes.

---

## Houston UI (React Packages)

### @houston-ai/core

The foundation. 38 shadcn/ui components, design tokens, animations, and base hooks.

| Export | What it does |
|--------|-------------|
| **38 components** | Button, Card, Dialog, Empty, Badge, ScrollArea, DropdownMenu, Tabs, Sheet, Tooltip, Spinner, Stepper, ConfirmDialog, ErrorBoundary, and 24 more |
| `cn()` | Tailwind class merge utility |
| `useSessionEvents()` | Base hook for Tauri event subscription (dependency-injected `listen`) |
| `useHoustonEvent()` | Low-level Tauri event hook (dynamic import) |
| `HoustonEvent` | TypeScript type matching the Rust `HoustonEvent` enum |

### @houston-ai/chat

Drop-in chat experience for Claude sessions. One component does streaming markdown, thinking blocks, tool activity, auto-scroll, and input.

| Export | What it does |
|--------|-------------|
| `ChatPanel` | Full chat -- messages + streaming + thinking + tools + input |
| `ChatInput` | Input with send/stop/mic states, auto-expand textarea |
| `ToolActivity` | Collapsing tool call list with spinners and elapsed time |
| `ProgressPanel` | Step checklist (pending/active/done states) |
| `useProgressSteps()` | Parses `update_progress` tool calls from feed |
| `feedItemsToMessages()` | Converts FeedItems to ChatMessages (extracts `[Channel]` prefix) |
| `mergeFeedItem()` | Smart-merges streaming feed items |
| `ChannelAvatar` | Branded avatar for Telegram/Slack |
| `Conversation` | Auto-scrolling message container |
| `Message` | Role-aware message bubble with branching |
| `Reasoning` | Collapsible thinking block |
| `PromptInput` | Complex input system with file upload, screenshots, tabs, commands |
| `Shimmer` | Animated gradient loading text |
| `Suggestion` | Horizontal scrollable suggestion pills |

### @houston-ai/board

Kanban board with animated cards that glow when agents are running.

| Export | What it does |
|--------|-------------|
| `KanbanBoard` | Status-driven board, configurable columns |
| `KanbanColumn` | Animated card list with Framer Motion transitions |
| `KanbanCard` | Status-aware card with conic-gradient glow animation |
| `KanbanDetailPanel` | Right panel with header + children slot |

### @houston-ai/layout

App shell components.

| Export | What it does |
|--------|-------------|
| `AppSidebar` | Project/workspace switcher with add/delete |
| `TabBar` | Tab navigation with optional badges and actions |
| `SplitView` | Resizable two-panel layout (default 55/45) |

### @houston-ai/connections

Channel and service connection management.

| Export | What it does |
|--------|-------------|
| `ConnectionsView` | Full view: service connections + channels section |
| `ChannelConnectionCard` | Channel row with status, connect/disconnect actions |
| `ChannelSetupForm` | Config form for Slack/Telegram tokens |
| `ChannelsSection` | Channel list with "Add Channel" dropdown |

### @houston-ai/events

Event feed for heartbeats, cron jobs, channel messages.

| Export | What it does |
|--------|-------------|
| `EventFeed` | Event list with type icons and status |
| `EventItem` | Individual event row |
| `EventFilter` | Event type filter |

### @houston-ai/routines

Recurring automated task management.

| Export | What it does |
|--------|-------------|
| `RoutinesGrid` | Grid of routine cards |
| `RoutineDetailPage` | Detail view with edit form |
| `RoutineRunPage` | Execution view with feed |
| `RunHistory` | History list |
| `ScheduleBuilder` | Visual schedule configuration |
| `HeartbeatConfig` | Heartbeat interval picker |

### @houston-ai/skills

Agent skill management with community marketplace.

| Export | What it does |
|--------|-------------|
| `SkillsGrid` | Grid of installed skills |
| `SkillDetailPage` | Detail view with instructions + learnings |
| `CommunitySkillsSection` | Browse and install from skills.sh |

### @houston-ai/review

Review queue for completed agent work.

| Export | What it does |
|--------|-------------|
| `ReviewSplit` | Split layout: sidebar list + detail panel |
| `ReviewDetail` | Deliverables, output summary, feedback |
| `DeliverableCard` | File deliverable with open/reveal actions |

### @houston-ai/workspace

Workspace file management.

| Export | What it does |
|--------|-------------|
| `FilesBrowser` | File browser with folder grouping, type icons, drag-and-drop |
| `InstructionsPanel` | Editable instruction files with auto-save on blur |

---

## Houston (Rust Crates)

### houston-sessions

Claude CLI session management. Spawns `claude -p --output-format stream-json`, parses NDJSON output, manages concurrency.

| Export | What it does |
|--------|-------------|
| `SessionManager` | Spawns Claude sessions |
| `StreamAccumulator` | Accumulates NDJSON deltas into FeedItems |
| `FeedItem` | Chat feed item enum (AssistantText, Thinking, ToolCall, etc.) |
| `claude_path` | PATH resolution for macOS .app bundles (shell, nvm, common dirs) |
| Concurrency | Global semaphore limits concurrent Claude processes |

### houston-db

Minimal SQLite layer. Two tables: `chat_feed` and `preferences`. That's it.

| Export | What it does |
|--------|-------------|
| `Database` | SQLite connection wrapper (libsql) |
| `add_chat_feed_item_by_session()` | Persist feed item keyed by `claude_session_id` |
| `list_chat_feed_by_session()` | Load conversation by `claude_session_id` |
| `get_preference()` / `set_preference()` | Key-value app settings |

### houston-tauri

The integration layer. Wraps everything into Tauri 2 commands and state.

| Module | What it provides |
|--------|-----------------|
| `workspace_store` | Typed CRUD for `.houston/` files -- 23 Tauri commands for tasks, routines, goals, channels, skills, log, config |
| `session_runner` | `spawn_and_monitor()` -- spawn Claude, emit events, persist feed, track session ID to disk |
| `session_queue` | Sequential message queue with automatic `--resume` |
| `agent_sessions` | Per-agent session state with `.claude_session_id` disk persistence |
| `channel_manager` | Start/stop channel adapters, route messages, auto-reconnect |
| `events` | `HoustonEvent` enum for Rust->JS event emission |
| `workspace` | Seed files, build system prompts, file operations |
| `tray` | System tray with show/quit menu |
| `paths` | `expand_tilde()` for user-facing paths |

### houston-channels

Channel adapters for messaging platforms.

| Export | What it does |
|--------|-------------|
| `TelegramChannel` | Long-polling via `getUpdates`, typing indicators |
| `SlackChannel` | Socket Mode WebSocket, `chat.postMessage` |
| `Channel` trait | `connect()`, `disconnect()`, `send_message()`, `send_typing()` |

### houston-events

Event queue for hooks, webhooks, and lifecycle events.

### houston-scheduler

Cron jobs and heartbeat timer scheduling.

---

## Architecture

```
+-------------------------------------------------------------+
|                     Your Tauri App                           |
+------------------------+------------------------------------+
|                        |                                    |
|   Houston UI (React)   |   Houston (Rust)                   |
|                        |                                    |
|   @houston-ai/core     |   houston-tauri                    |
|   @houston-ai/board    |     +-- workspace_store (.houston/)|
|   @houston-ai/chat     |     +-- session_runner/queue       |
|   @houston-ai/layout   |     +-- channel_manager            |
|   @houston-ai/skills   |     +-- houston-sessions           |
|   @houston-ai/routines |     |     +-- Claude CLI process   |
|   @houston-ai/...      |     +-- houston-db                 |
|                        |           +-- chat_feed (SQLite)   |
|                        |                                    |
+------------------------+------------------------------------+
|                    Tauri 2 IPC Bridge                        |
+------------------------+------------------------------------+
|   .houston/ files      |   Claude Code / Codex / Other      |
|   (workspace data)     |   (AI agent processes)             |
+------------------------+------------------------------------+
```

**Houston UI** components are props-driven with no store lock-in. Use Zustand, Redux, Jotai -- whatever you want.

**Houston** handles session lifecycle, workspace file management, and channel routing. Agent-visible data lives in `.houston/` files. SQLite is only for chat conversation replay.

---

## Theming

Everything is controlled by CSS variables:

```css
@theme {
  --color-primary: #0d0d0d;           /* Near-black (default) */
  --color-primary-foreground: #ffffff;
  --color-secondary: #f9f9f9;
  --color-muted-foreground: #5d5d5d;
  --color-border: rgba(0, 0, 0, 0.08);
}
```

Override `--color-primary` for brand theming. All components pick it up automatically.

---

## Built with Houston

Build your own AI agent experience with `create-houston-experience`:

```bash
npx create-houston-experience my-app
```

*Building something? Open a PR to add it here.*

---

## AI Skills

Teach your coding agent how to build with Houston:

```bash
npx skills add ja-818/houston
```

Browse on [skills.sh](https://skills.sh).

---

## License

MIT
