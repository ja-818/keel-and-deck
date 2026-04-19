# Agent Manifest

Agent definitions = what AI agent looks like. Which tabs. What prompt. What files seeded. Primary dev surface of platform.

## Three tiers

1. **JSON-only** — `houston.json` + `CLAUDE.md`. Defines tabs, prompt, colors, icon. Uses built-in tab components.
2. **Custom React** — `houston.json` + `bundle.js`. Custom components. Import `@houston-ai/*` as peer deps.
3. **Workspace template** — `workspace.json` + `agents/` folder. Bundles multiple agents from one GitHub repo.

## Manifest shape
```ts
interface AgentManifest {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;           // Lucide icon name
  color?: string;          // brand override
  category?: AgentCategory;
  author?: string;
  tags?: string[];
  tabs: AgentTab[];
  defaultTab?: string;
  claudeMd?: string;       // CLAUDE.md template content
  systemPrompt?: string;
  agentSeeds?: Record<string, string>;
  features?: string[];     // Rust feature flags needed
}

interface AgentTab {
  id: string;
  label: string;
  builtIn?: "chat" | "board" | "skills" | "files" | "connections" | "context" | "routines" | "channels" | "events" | "learnings";
  customComponent?: string;
  badge?: "activity" | "none";
}
```

## Locations
- **Built-in:** `app/src/agents/builtin/` (9 agents: Default, Project Manager, Meeting Assistant, Research, Data Analyst, Code Reviewer, DevOps, Content Writer, Customer Support)
- **Installed:** `~/.houston/agents/{id}/houston.json` — downloaded from GitHub
- **Override rule:** installed definition w/ same id as builtin → overrides builtin (dedup in `loader.ts`)

## Import flow
"New Agent > GitHub" dialog. User pastes `owner/repo`. Houston downloads `houston.json`, `CLAUDE.md`, `icon.png`, `bundle.js` → `~/.houston/agents/{id}/`.

## Agent creation
Seeds agent CLAUDE.md from manifest `claudeMd` field or manifest's `CLAUDE.md` file. Fallback: generic template.

## Workspace templates

Bundle multiple agents in one GitHub repo. Import → create workspace w/ all agents ready.

```
my-workspace/
  workspace.json
  agents/
    agent-one/
      houston.json
      CLAUDE.md
    agent-two/
      houston.json
      CLAUDE.md
```

**workspace.json:**
```json
{
  "name": "Workspace Name",
  "description": "Optional.",
  "agents": ["agent-one", "agent-two"]
}
```

**Import:** "New Workspace > Import from GitHub". Paste `owner/repo`. Houston downloads workspace.json, installs all agent defs, creates workspace, creates agent instances w/ CLAUDE.md + seed files. All agents chat-ready immediately.

Rust cmd: `install_workspace_from_github` in `app/src-tauri/src/commands/store.rs`.

## Sidebar structure

```
+-----------------------------+
| [WorkspaceSwitcher] [Settings] |
|-----------------------------|
| > Dashboard                 |  all agents overview
| > Connections               |  workspace-wide integrations
|-----------------------------|
| Your AI Agents              |
|   > Research Agent          |  sorted by lastOpenedAt
|   > Project Manager         |
|   + New Agent               |  pick agent definition
+-----------------------------+
```

## Workspace
- Storage: `~/.houston/workspaces.json` (index) + one dir per workspace `~/.houston/workspaces/{Name}/`
- First launch: welcome screen, create first workspace
- Rust cmds: `list_workspaces`, `create_workspace`, `rename_workspace`, `delete_workspace` (`app/src-tauri/src/commands/workspaces.rs`)
- Store: `useWorkspaceStore` — `loadWorkspaces()`, `setCurrent()`, `create()`, `rename()`, `delete()`

## Prompt assembly
Order (in `agent.rs`):
1. `.houston/prompts/system.md` — base prompt
2. `.houston/prompts/self-improvement.md` — learning directives
3. `.houston/memory/` — learnings snapshot
4. `.agents/skills/` — skills index
5. `CLAUDE.md` — agent instructions

Both prompt files seeded on creation via `seed_file()` (write-once, never overwrite).

## Board / Activity tab
`@houston-ai/board::AIBoard` = `KanbanBoard` + `KanbanDetailPanel` + `ChatPanel`. Each card = activity from `.houston/activity.json`. Click → opens chat w/ conversation history. App `board-tab.tsx` ~140 lines, thin store wrapper.

`AIBoard` props: `items, feedItems (keyed by sessionKey), isLoading, onCreateConversation, onSendMessage, onLoadHistory, onDelete, onApprove, onSelect, selectedId`.

Status transitions: session completes → `useSessionEvents` → activity = `"needs_you"`. `ActivityChanged` event from Rust update cmd auto-invalidates TanStack Query → board refreshes.

Columns can have `onAdd` callback → renders "+" button for creating activities from board.
