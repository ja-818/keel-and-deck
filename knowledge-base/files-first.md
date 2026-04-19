# Files-First (`.houston/`)

Houston uses files, not DB, for agent-visible data. SQLite only for chat replay + app prefs.

## Rule
If @houston-ai component renders it → `.houston/` folder.
If app-specific → `.houston/`.

## Layout

```
~/Documents/Houston/{Workspace}/{Agent}/
  .houston/
    agent.json                  AgentMeta (id, manifest_id, created_at, last_opened_at)
    activity/
      activity.json             Activity[]
      activity.schema.json      JSON Schema
    routines/
      routines.json + .schema.json
    routine_runs/
      routine_runs.json + .schema.json
    config/
      config.json + .schema.json
    learnings/
      learnings.json + .schema.json   ({id, text, created_at})
    prompts/
      system.md                 editable base system prompt
      self-improvement.md       editable learning directives
    sessions/
      {session_key}.sid         one file per conversation, holds Claude session id for --resume
  .agents/
    skills/<name>/SKILL.md      skill.sh / Claude Code convention
  .claude/
    skills/<name>               symlink → ../../.agents/skills/<name>
  CLAUDE.md                     agent instructions
  AGENTS.md                     symlink → CLAUDE.md (for Codex)
```

## Two generic commands
Frontend file I/O goes through exactly two Tauri commands:
- `read_agent_file(agent_path, rel_path) -> string` — atomic read, `""` if missing
- `write_agent_file(agent_path, rel_path, content) -> ()` — atomic temp+rename, emits matching `HoustonEvent`

No typed CRUD. Per-type folder + schema = type safety in TS.

## Schemas
Authoritative. Live in `ui/agent-schemas/src/*.schema.json`. Embedded in Rust via `include_str!` in `houston-agent-files::schemas`. Seeded into each agent's `.houston/<type>/<type>.schema.json` on first launch. Prompts instruct model to read schema before writing data file.

## Migration
`houston_agent_files::migrate_agent_data()` runs on every `seed_agent()`. Idempotent. Leaves legacy flat-layout files in place as rollback.

## Atomic writes
All writes: temp file + rename. Path-traversal safe via `houston-agent-files::safe_relative`.

## Activity statuses
`queue` · `running` · `needs_you` · `done` · `cancelled`

## Skills discovery
Skills live at `.agents/skills/<name>/SKILL.md`. Houston mirrors to `.claude/skills/<name>` via symlink (Claude Code reads). Flat `.md` under `.agents/skills/` auto-migrated to `<name>/SKILL.md` on next `list_skills`.

## SQLite (minimal)
Only two tables:
- `chat_feed` — keyed by `claude_session_id`. UI conversation replay on restart.
- `preferences` — app-level (last_workspace_id etc). Not scoped.

Everything else lives in files.

## AI-native reactivity (MANDATORY)

Users + LLMs equal participants. Both read/write all workspace data. All changes visible to both immediately.

### Two writers
1. **Frontend via Tauri commands** — user clicks "Create Activity" → Tauri → Rust writes file
2. **CLI agent direct writes** — agent writes `.agents/skills/<name>/SKILL.md` directly

### Three-layer reactivity stack
1. **TanStack Query (frontend)** — all `.houston/` fetches via `useQuery`. Query keys: `["activity", agentPath]` etc. Dedup, background refresh, stale-while-revalidate.
2. **Event emission on Tauri writes (Rust)** — `write_skill()` emits `SkillsChanged`, `create_activity()` emits `ActivityChanged`. Global listener invalidates matching query key.
3. **File watcher on `.houston/` (Rust, `notify`)** — catches direct agent writes bypassing Tauri. Emits same events. Debounced.

### The rule
Never build feature where agent changes data but UI won't reflect until refresh. If in `.houston/`, must be reactive.

## User data = upgrade-safe
Files under `~/Documents/Houston/**` + `~/.houston/**` exist on user machines. Changing shape/layout requires **idempotent migration** on upgrade. See `houston_agent_files::migrate_agent_data`. Never leave existing users broken.
