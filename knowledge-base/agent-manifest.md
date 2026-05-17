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
- **Built-in:** `app/src/agents/builtin/` — `personalAssistantAgent`
  (default agent for new workspaces) + `blankAgent` (start-from-scratch).
  The richer catalog lives in Houston Store under `store/agents/*`.
- **Installed:** `~/.houston/agents/{id}/houston.json` — installed from bundled Houston Store or downloaded from GitHub.
- **Override rule:** installed definition with same id as builtin → overrides builtin (dedup in `app/src/stores/agent-configs.ts`).

## Store install flow

Houston-owned Store agents are release-bundled:

```
store/
  catalog.json
    agents/<agent-id>/
      houston.json
      CLAUDE.md
      icon.png
      .agents/skills/<skill>/SKILL.md
```

`GET /v1/store/catalog` reads this bundled catalog when available.
`POST /v1/store/installs` with `repo: "houston-store/<agent-id>"`
copies the package to `~/.houston/agents/<agent-id>/` and writes
`.source.json` with `source: "houston-store"`, `version`, and
`content_hash`. Creating a workspace agent from that installed
definition copies packaged `.agents/skills/*` into the user's agent
root so chat Skills are available immediately.

Store agents must not use custom Overview dashboards or manifest
`useCases` for starter workflows. If a workflow should be visible to
users, package it as a real skill under `.agents/skills/*/SKILL.md`.
Store-packaged skills must not include legacy `inputs` or
`prompt_template` frontmatter. The chat Skill picker selects the
workflow, then the regular composer stays visible for free-form context.
Store manifests must also not seed `.houston/activity.json` or
`.houston/activity/activity.json`; fresh Store agents start with an empty
board and the app points users at New Mission. The engine ignores stale
activity seeds during create, and Store update sync clears the known
default intro card from existing Store agents only when it is the sole
board item.

Update checks compare installed `.source.json` to the bundled catalog
and refresh installed definitions when a newer app release carries a
newer package. The desktop catalog reloads after updates so existing
workspace agents pick up new tabs/defaults from the refreshed manifest.

After a bundled package update, Houston copies newly-added packaged
Skills into existing workspace agents with the same `config_id`.
Existing Skill bodies are not overwritten; user edits win. Matching
Skill frontmatter is refreshed from the bundled package so descriptions,
integrations, images, category, and featured state can update with a release.

## GitHub import flow
Engine route remains for developer/manual import. A caller posts an
`owner/repo` URL and Houston downloads `houston.json`, `CLAUDE.md`,
`icon.png`, `bundle.js` → `~/.houston/agents/{id}/`. The desktop
New Agent modal is Store-only for non-technical users.

## Agent creation
Seeds agent CLAUDE.md from manifest `claudeMd` field or manifest's `CLAUDE.md` file. Fallback: generic template.

## Default Personal assistant + tutorial

Every newly-created workspace gets a `Personal assistant` instance from the
built-in `personal-assistant` config. Users do not create it manually.
First-run onboarding is a seven-mission guided setup driven by
`app/src/components/onboarding/personal-assistant-onboarding.tsx` and the
`TUTORIAL_STEPS` machine in `tutorial-copy.ts`:

1. Welcome screen offers start vs. skip.
2. **Meet** — name + color the assistant.
3. **Brain** — pick provider (OpenAI / Anthropic) and create the workspace +
   assistant.
4. **Tools** — sign into Composio so the agent has hands.
5. **Try** — one real mission (`Plan my next working day`). The agent reads
   inbox + calendar in parallel, cross-references them, posts a structured
   plan with bold sections, and saves three draft replies. Ends with the
   literal `[TUTORIAL_COMPLETE]` token. CLAUDE.md is augmented with the
   tutorial directive while this step is mounted, stripped on unmount.
6. **Skill** — same chat, one chip. The user clicks "Save this as a Skill"
   and the agent writes `.agents/skills/plan-my-working-day/SKILL.md`
   (frontmatter + procedure body) in a single shot. Ends with
   `[SKILL_COMPLETE]`. Detection prefers the on-disk `useSkills()` lookup
   (skill `name === ONBOARDING_SKILL_SLUG`) over the token. The done
   screen is a full-page `MissionDoneScreen` showing the resulting
   `SkillCard` — same component the user sees in the chat empty state.
7. **Routine** — same chat, one chip. The user clicks "Make it a routine"
   and the agent asks for one thing (the time), confirms, then appends a
   new entry to `.houston/routines/routines.json` whose `prompt` simply
   says `Run the \`plan-my-working-day\` skill.` (the procedure lives in
   the Skill from M5, the routine just schedules it). Ends with
   `[ROUTINE_COMPLETE]`. Done screen is a full-page `MissionDoneScreen`
   showing the routine name, "Every weekday at HH:MM", and which Skill
   it runs.
8. **Summary** — final celebratory screen with the assistant's avatar /
   name and the two cards (Skill + Routine) read live from
   `useSkills` + `useRoutines`. The "Enter Houston" CTA fires
   `finishOnboarding`, which arms the UI tour and clears
   `tutorialActive` so the workspace shell takes over.

**Always-on Skip.** Missions 4-7 each render a small "Skip tutorial" link
wired to `finishOnboarding` directly (not through the per-step
`onContinue`). If the model wedges or the user changes their mind, one
click stops any in-flight session and lands them in the workspace shell
with the default Personal assistant still created in M3. The Skip is
deliberately separate from `onContinue` because the latter advances
mission-by-mission.

**CLAUDE.md augmentation pattern.** Try, Skill, and Routine each append a
uniquely-marked section to the agent's `CLAUDE.md` on mount and strip it
on unmount via `tutorial-system-prompt.ts`, `skill-system-prompt.ts`,
`routine-system-prompt.ts`. Each mount-time write also strips any prior
sibling sections, and each unmount-time strip is a no-op when nothing
matches, so concurrent unmount-of-prev / mount-of-next writes converge
cleanly no matter which write lands last.

Skipping onboarding at the welcome screen still creates the default Personal
assistant, but skips every tutorial artifact: no Try mission, no Skill,
no Routine, no Summary, no UI tour.

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

Engine route: `POST /v1/store/workspaces/install-from-github`. Rust impl: `houston_engine_core::store::install_workspace_from_github`. Server wiring: `engine/houston-engine-server/src/routes/store.rs`.

## Sidebar structure

```
+-----------------------------+
| [WorkspaceSwitcher] [Settings] |
|-----------------------------|
| > Dashboard                 |  all agents overview
| > Connections               |  workspace-wide integrations
|-----------------------------|
| Your AI Agents              |
|   > Research Agent    [2]   |  sorted by lastOpenedAt
|   > Project Manager         |
|   + New Agent               |  row-style action, opens Store picker
+-----------------------------+
```

Agent rows show a count chip for `needs_you` activity items. If any
activity item is `running`, the row avatar uses the same comet glow as
running board cards. The row `...` menu replaces the count chip on hover
and keyboard focus. It keeps the count chip hidden while open. The first-level
menu shows Rename, Change color, Delete; Change color opens the color picker
submenu.

## Workspace
- Storage: `~/.houston/workspaces/workspaces.json` (index) + one dir per workspace `~/.houston/workspaces/{Name}/`. `HOUSTON_DOCS` env var overrides the root.
- First launch: welcome screen, create first workspace
- Engine routes: `GET /v1/workspaces`, `POST /v1/workspaces`, `POST /v1/workspaces/:id/rename`, `DELETE /v1/workspaces/:id`, `PATCH /v1/workspaces/:id/provider`, `GET|PUT /v1/workspaces/:id/context` (`engine/houston-engine-server/src/routes/workspaces.rs`). Frontend reaches them via `@houston-ai/engine-client` — no Tauri commands in the path.
- Store: `useWorkspaceStore` — `loadWorkspaces()`, `setCurrent()`, `create()`, `rename()`, `delete()`

## Prompt assembly
The final system prompt is `<product_prompt>\n\n---\n\n<agent_context>`, built in two layers:

**Product layer (owned by the embedding app, not the engine).**
Lives in `app/src-tauri/src/houston_prompt/` for the Houston desktop app. Covers the app-context dictionary, concise user voice, the silent interaction loop (classify request, check info, check integrations, decide approval, execute, consider memory), Skills/memory guidance, Routines guidance, and Composio guidance. Passed to the engine at boot via env vars `HOUSTON_APP_SYSTEM_PROMPT` + `HOUSTON_APP_ONBOARDING_PROMPT` — the engine keeps them as opaque strings. Callers can also override per-session via the `systemPrompt` field on `startSession`.

Beginner mode adds a second product-layer prompt, `HOUSTON_APP_BEGINNER_SYSTEM_PROMPT`. The desktop app persists the user preference in engine preferences under `experience_level`. Session-start and orchestration routes read that preference at request time:
- `professional` or missing beginner prompt → standard `app_system_prompt`
- `beginner` + beginner prompt present → `app_beginner_system_prompt`

This matters because beginner mode can instruct the parent assistant to propose delegation, emit the `create-agents` link UI, and later summarize delegated work in plain language. The engine still stays prompt-agnostic apart from carrying the selected opaque product prompt string into the session runtime.

The desktop UI consumes those product-layer delegation links before markdown rendering. The assistant emits `[suggest_agents](https://houston.ai/_/create-agents#intents=<json>)`, `[adjust_agents](https://houston.ai/_/adjust-agents#intent=<json>)`, and `[save_agents](https://houston.ai/_/save-agents#agents=<json>)` as transport markers, not user-facing links. Their hash payload is encoded JSON and can contain literal markdown delimiters such as `)` because `encodeURIComponent` does not escape every punctuation character. Keep extraction parser-based and validate the decoded payload before removing the marker; do not replace it with a regex that stops at the first `)`, or the UI will leak encoded JSON and Streamdown may render a blocked-link warning.

Houston-owned delegation must stay distinct from provider-native child-agent features in beginner mode. If a provider exposes tools like `Agent`, `Task`, `TaskCreate`, `TaskUpdate`, or `SendMessage`, beginner sessions block them so the only sub-agent workflow is the engine-owned orchestration route and UI. Professional sessions allow provider-native delegation and do not receive the beginner dispatcher prompt. This is enforced by a server-selected `NativeDelegationPolicy`: `beginner` maps to `Block`, `professional` maps to `Allow`. The policy flows through `StartParams` into `houston-terminal-manager`, where provider launch flags and parser behavior are scoped per session. If a blocked beginner session still emits native delegation in stdout, including Claude system events like `task_started`, `task_progress`, `task_updated`, or `task_notification`, the parser marks it as a fatal policy violation, the process manager kills the CLI subprocess immediately, and the session ends with a visible error instead of rendering or allowing the native agent run.

Delegation payloads support dependency graphs. Each `suggest_agents` item should include a stable `id` and `dependsOn`; agents with dependencies wait until upstream agents finish, then receive those dependency outputs in their run prompt. Agent instructions are split between `rolePrompt` and `taskPrompt`: `rolePrompt` is the reusable identity, while `taskPrompt` is the current mission assignment and may contain temporary topic, quantity, platform, and example details. The engine wraps `rolePrompt` into a durable saved role profile before writing generated agent instructions, and validates that the role does not repeat the task or contain current-mission language. The engine persists the graph as `.houston/orchestration/<parentSessionKey>.json` on the parent agent. Child activities are a status projection only, not the source of truth.

Adjustment loops reuse the same temporary agents and the same DAG. When a parent chat already has an orchestration manifest for `parentAgentPath + parentSessionKey`, user feedback should call `/v1/orchestration/adjust-and-run`, not emit another `suggest_agents` marker. Adjustment dispatches carry a stable per-message `actionId`; the manifest records consumed action ids so long chat histories can stay visible without remounting old control links and re-running previous work. The right beginner drawer shows the same agents moving back to `waiting`, then `running`, then terminal status as dependencies allow. That drawer must filter child conversations by the active mission context `{ parentAgentPath, parentSessionKey }`; do not infer it from legacy `chat-${agent.id}` keys.

Temporary specialized agents may reuse the same display name across different parent chats. Their folders are uniqued with an id suffix while `.houston/agent.json` keeps the human name, so hidden temporary agents from older runs cannot block a new delegation with `CONFLICT`.

Generated agents created by orchestration use the builtin `generated-custom`
config, not a free-floating `custom` id. Their `.houston/agent.json` carries
`origin.kind = "orchestration"` plus a stable role id/fingerprint. Saving them
is an upsert against user-created generated agents in the same workspace:
matching generated agents are updated, Houston/system/template agents are never
touched, and temporary execution instances remain hidden. Legacy visible
`custom` generated agents are migrated to `generated-custom` on agent list so
they open as chat-first reusable agents instead of the empty New Agent state.

**Agent-context layer (engine-owned).**
Built in `engine/houston-engine-core/src/agents/prompt.rs::build_agent_context`:
1. **Working directory block** — hard rules scoping file I/O to `<agent-root>`.
2. Mode file `.houston/prompts/modes/<mode>.md` (optional, user-editable).
3. Learnings snapshot — `.houston/learnings/learnings.json`, text fields only, rendered as bounded background context. IDs/timestamps stay storage/UI-only.
4. **Workspace context block** — assembled from `<workspace>/WORKSPACE.md` + `<workspace>/USER.md` (the agent's parent dir) by `workspace_context::build_prompt_section`. Always included for any agent whose parent dir has a `.houston/`. Files are NOT seeded — they only exist once the user or an agent writes them; until then the section renders an "(empty so far, ask the user when relevant)" marker so the agent knows the slot exists. Section explicitly authorizes the agent to read/write these two files (carve-out from the working-directory rule) and tells it that edits take effect on the **next** chat.
5. Skills index — `.agents/skills/` via `houston_skills::build_skills_index`.
6. Integrations block — based on `.houston/integrations.json` if present.

`CLAUDE.md` is read by the CLI (claude/codex) itself at startup, not injected by the engine.

Users cannot edit the product prompt — it's compiled into the app binary. Per-agent surfaces that ARE user-editable: `CLAUDE.md` (job description), `.agents/skills/` (skills), `.houston/learnings/learnings.json` (learnings), `.houston/prompts/modes/*.md` (mode overrides). Per-workspace surfaces (shared by every agent in the workspace): `WORKSPACE.md` (about the company/project), `USER.md` (about the human running it). Both edited from Settings → Workspace → Shared context, or directly by agents when the user shares new info.

## Board / Activity tab
`@houston-ai/board::AIBoard` = `KanbanBoard` + `KanbanDetailPanel` + `ChatPanel`. Each card = activity from `.houston/activity/activity.json`. Click → opens chat w/ conversation history. App `board-tab.tsx` ~140 lines, thin store wrapper.

`AIBoard` props: `items, feedItems (keyed by sessionKey), isLoading, onCreateConversation, onSendMessage, onLoadHistory, onDelete, onApprove, onSelect, selectedId`.

Status transitions: session completes → `useSessionEvents` (listens to the WS `*` firehose) → activity status flipped to `needs_you` via the engine update route. The emitted `ActivityChanged` event auto-invalidates TanStack Query → board refreshes.

Columns can have `onAdd` callback → renders "+" button for creating activities from board.
