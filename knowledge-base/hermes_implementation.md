# Self-Improving Agent System — Implementation Plan for Houston

## Document Purpose

This document is a comprehensive implementation plan for adding a **self-improving agent system** to the Houston library. It is written so that an engineer (or AI agent) with **zero context** about the project can understand the motivation, architecture, and every implementation step.

An evaluating agent should assess: architectural soundness, completeness, feasibility, edge cases, and whether the plan achieves its stated goals.

---

## Table of Contents

1. [Background & Motivation](#1-background--motivation)
2. [What We're Building (And Why Each Piece Exists)](#2-what-were-building-and-why-each-piece-exists)
3. [Architecture Overview](#3-architecture-overview)
4. [File & Directory Conventions](#4-file--directory-conventions)
5. [Implementation: houston-skills (New Crate)](#5-implementation-houston-skills-new-crate)
6. [Implementation: houston-memory (Rewrite)](#6-implementation-houston-memory-rewrite)
7. [Implementation: houston-db Enhancement (FTS5 Session Search)](#7-implementation-houston-db-enhancement-fts5-session-search)
8. [Implementation: houston-cli Enhancement](#8-implementation-houston-cli-enhancement)
9. [Implementation: houston-tauri Enhancement](#9-implementation-houston-tauri-enhancement)
10. [Implementation: Self-Improvement Prompt Fragment](#10-implementation-self-improvement-prompt-fragment)
11. [Implementation: @houston-ai/skills Enhancement](#11-implementation-houston-aiskills-enhancement)
12. [Implementation: @houston-ai/memory Rewrite](#12-implementation-houston-aimemory-rewrite)
13. [App Integration](#13-app-integration)
14. [Implementation Order & Dependencies](#14-implementation-order--dependencies)
15. [Testing Strategy](#15-testing-strategy)
16. [Security Considerations](#16-security-considerations)
17. [Open Questions & Decisions](#17-open-questions--decisions)

---

## 1. Background & Motivation

### What is Houston?

Houston is a framework for building AI agent desktop apps. It has two halves:

- **Houston (Rust crates)** — Backend: session management, database, workspace persistence, scheduling, channel adapters, Tauri integration
- **Houston UI (React packages)** — Frontend: UI components for chat, kanban boards, layouts, skills, memory, events

Apps built on Houston (Houston, Houston) are native macOS desktop apps (Tauri 2) where users interact with AI agents through chat. The agents execute tasks, manage kanban boards, connect to messaging platforms (Telegram, Slack), and run on schedules.

The AI execution engine is **Claude CLI** — agents are spawned as `claude -p --output-format stream-json` processes. The Rust backend manages their lifecycle, parses their streaming output, and persists conversations.

### What is the Self-Improving Agent System?

Currently, agents in Houston apps are **stateless across sessions**. Each session starts from the same system prompt + workspace files. The agent doesn't learn from past work, doesn't remember user preferences across sessions, and can't search its own history.

The **Hermes Agent** (by Nous Research, https://github.com/nousresearch/hermes-agent) is an open-source AI agent that solves this with a "built-in learning loop." It is the most successful implementation of self-improving agents in the open-source ecosystem (24k+ GitHub stars). Its key insight: **most of the self-improvement system is prompt engineering + file I/O + session lifecycle hooks, not exotic ML infrastructure.**

We want to implement the Hermes self-improvement model in Houston so that every app built on the framework gets self-improving agents by default.

### Why This Matters

An agent that self-improves through use is **dramatically more valuable** than one that doesn't:

1. **Session 1:** Deploy a Docker service. Takes 12 tool calls, hits networking issues, figures them out.
2. **Session 2:** Same task. Agent checks its skills, finds the procedure, deploys in 3 calls. And discovers the base image changed — patches the skill inline.
3. **Session 10:** Agent has accumulated skills for deployment, testing, email drafting, API integration. Each session is faster than the last.

Without self-improvement, session 10 is identical to session 1. The agent is a goldfish.

### The Hermes Model (What We're Copying)

Hermes's self-improvement system has 5 components:

| Component | What It Does | How Hermes Implements It |
|---|---|---|
| **Skills** | Reusable procedures the agent creates from experience | Markdown files on disk with YAML frontmatter. Agent CRUDs them via tool calls. |
| **Memory** | Agent's persistent notes + user profile | Two character-bounded markdown files. Agent curates them proactively. |
| **Nudge/Review** | Background reflection that triggers learning | Silent background subagent reviews conversation every N turns/after completion. |
| **Session Search** | Full-text search across all past conversations | SQLite FTS5 virtual table over message history. |
| **Prompt Injection** | Getting skills/memory into the agent's context | System prompt includes skills index + memory snapshot + guidance on when to learn. |

**Key Hermes design decisions we're preserving:**

1. **Files over databases for agent-written content.** Skills and memory are markdown files on disk — readable by users, editable in any text editor, git-trackable. Conversations (which are write-heavy, indexed, not user-edited) go in the database.

2. **Progressive disclosure for skills.** The system prompt gets only a compact index (name + one-line description per skill). The agent loads full skill content on demand. This keeps the prompt small even with 50+ skills.

3. **Character-bounded memory forces curation.** MEMORY.md has a 2,200 character limit. USER.md has 1,375. When full, the agent must replace stale entries to make room. Without limits, memory becomes an infinite dump where retrieval quality degrades.

4. **Frozen snapshots preserve cache.** Memory and user profile are loaded once at session start and injected into the system prompt. They don't change mid-session. This preserves the LLM's prompt prefix cache for performance. Updates take effect next session.

5. **Self-improvement is prompt-driven, not algorithmic.** The LLM decides what to learn based on system prompt guidance. There's no classifier, no heuristic engine, no ML model. The prompt says "if you used a skill and it was wrong, fix it now" — and the LLM does.

6. **Post-session review as a separate agent.** After a session completes, a one-shot "review agent" examines the transcript and decides what to persist. This catches learnings the agent missed during the heat of execution.

---

## 2. What We're Building (And Why Each Piece Exists)

### New Crate: `houston-skills`

**What:** Filesystem operations for reading, writing, listing, and patching skill files.

**Why it's a separate crate:** Skills are a self-contained concept (a directory of markdown files with frontmatter). They don't depend on the database, Tauri, sessions, or any other houston crate. Keeping them isolated means they can be used by the CLI, the Tauri backend, tests, and potentially non-Tauri apps.

**Why not in houston-db:** Skills are user-visible, user-editable files. Putting them in SQLite would hide them from users and make them harder to version-control. Hermes uses the filesystem for the same reason.

### Rewritten Crate: `houston-memory`

**What:** Character-bounded persistent memory with two files (agent notes + user profile).

**Why rewrite:** The current `houston-memory` is being removed as part of a v2 refactor. The new implementation is much simpler — two markdown files with section delimiters, character limits, and entry-level CRUD. No vector search, no embeddings, no external dependencies.

**Why character limits:** This is the most important design decision. Hermes caps MEMORY.md at 2,200 chars and USER.md at 1,375 chars. This forces the agent to curate — to decide what's most important and evict stale entries. Without limits, every agent would accumulate thousands of memory entries, context would bloat, and retrieval quality would collapse. The limit is the feature.

**Why two files (not one):** Separation of concerns. Agent notes ("the staging server requires VPN") are different from user profile ("prefers terse output, based in Bogota"). The system prompt can present them differently, and character limits can be tuned independently.

### Enhanced: `houston-db` (FTS5)

**What:** Full-text search index over persisted conversation messages.

**Why:** An agent that can search its own history ("what approach did we use for the auth integration last week?") is dramatically more capable. Hermes uses SQLite FTS5 — we already use libsql (SQLite-compatible), so this is a natural fit.

**Why not vector search:** FTS5 is built into SQLite, requires no external dependencies, no embeddings model, and is fast for keyword queries. It covers 90% of recall use cases. Vector search can be added later as an enhancement.

### Enhanced: `houston-cli`

**What:** New CLI commands for skill CRUD, memory CRUD, and session search.

**Why CLI:** This is how the agent interacts with the self-improvement system during a session. The agent is a Claude CLI process that can execute bash commands. `houston skill view docker-deploy` is a bash command that returns the full skill content. The agent doesn't need MCP, function calling schemas, or API endpoints — it needs bash commands.

**Why not MCP tools:** The existing pattern in Houston is CLI-based — the planning agent runs `houston task create/list/update` via bash. This is deliberate: CLI tools are always available (no process to manage), stateless (no connection to maintain), debuggable (users can run them manually), and the agent learns them through a SKILL.md document.

### Enhanced: `houston-tauri`

**What:** Three additions: (a) enhanced `build_system_prompt()` that includes skills index + memory snapshot, (b) post-session review that spawns a reflection agent, (c) new Tauri commands for frontend access.

**Why in houston-tauri:** This crate is already the integration layer between all other houston crates and the Tauri app. System prompt assembly, session lifecycle, and Tauri commands all live here.

### Self-Improvement Prompt Fragment

**What:** A standard text block shipped as a Rust constant that gets injected into every agent's system prompt. Contains guidance on when to create skills, when to save memory, and how to self-correct.

**Why a constant (not a file):** This is framework behavior, not user configuration. It should be compiled into the binary, versioned with the library, and not accidentally deleted or modified by users. Apps can override it if needed, but the default should Just Work.

**Why this is the most important piece:** Without the prompt guidance, the agent has the tools but no motivation to use them. The prompt fragment is what transforms a normal agent into a self-improving one. It's the equivalent of Hermes's `SKILLS_GUIDANCE` and `MEMORY_GUIDANCE` constants.

### Enhanced: `@houston-ai/skills` and `@houston-ai/memory`

**What:** React components for viewing and managing skills and memory in the app UI.

**Why:** Users need visibility into what the agent has learned. "What skills does my agent have?" and "What does it remember about me?" are essential trust-building questions. The UI also allows manual editing — users can correct wrong skills or remove outdated memory entries.

---

## 3. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APP (Houston / Houston)                   │
│                                                                      │
│  Frontend (React)                    Backend (Rust/Tauri)            │
│  ┌─────────────────┐                ┌────────────────────────────┐  │
│  │ @houston-ai/skills  │◄──invoke()───│ Tauri Commands              │  │
│  │ @houston-ai/memory  │              │ skill_list, skill_view,     │  │
│  │ @houston-ai/chat    │              │ memory_load, memory_add,    │  │
│  │                   │              │ session_search              │  │
│  └─────────────────┘                └──────────┬─────────────────┘  │
│                                                  │                    │
│                                    ┌─────────────┼──────────────┐    │
│                                    │             │              │    │
│                                    ▼             ▼              ▼    │
│                              ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│                              │houston-skills│ │houston-memory│ │houston-db  │ │
│                              │(filesystem│ │(filesystem│ │(FTS5    │ │
│                              │ CRUD)     │ │ CRUD)     │ │ search) │ │
│                              └─────┬─────┘ └─────┬─────┘ └────┬────┘ │
│                                    │             │             │      │
│                                    ▼             ▼             │      │
│                              .houston/skills/  .houston/memory/      │      │
│                                                                │      │
│  ┌──────────────────────────────────────────────────────────┐  │      │
│  │                    houston-tauri                              │  │      │
│  │                                                            │  │      │
│  │  build_system_prompt()                                     │  │      │
│  │  ├─ base prompt (app-provided)                             │  │      │
│  │  ├─ SELF_IMPROVEMENT_GUIDANCE (houston constant)              │  │      │
│  │  ├─ memory snapshot (from houston-memory)                     │  │      │
│  │  ├─ skills index (from houston-skills)                        │  │      │
│  │  └─ workspace files (SOUL.md, HEARTBEAT.md, etc.)          │  │      │
│  │                                                            │  │      │
│  │  spawn_and_monitor()                                       │  │      │
│  │  ├─ spawns Claude CLI session                              │  │      │
│  │  ├─ streams output → events                                │  │      │
│  │  ├─ persists feed items → houston-db ──────────────────────┘  │      │
│  │  └─ on completion → spawn_review() (if ReviewOptions set)  │      │
│  │      ├─ loads transcript                                   │      │
│  │      ├─ spawns one-shot Claude review session              │      │
│  │      ├─ review agent calls houston skill/memory CLI           │      │
│  │      └─ emits ReviewCompleted event                        │      │
│  └──────────────────────────────────────────────────────────┘  │      │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │                    houston-cli                                │        │
│  │  (what agents call during sessions via bash)               │        │
│  │                                                            │        │
│  │  houston skill list/view/create/patch/delete                  │        │
│  │  houston memory list/add/replace/remove                       │        │
│  │  houston search "query"                                       │        │
│  └──────────────────────────────────────────────────────────┘        │
└───────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Self-Improvement Loop

```
SESSION START
│
├─ houston_skills::build_skills_index(".houston/skills/")
│  → compact list: "docker-deploy — Deploy services via Docker Compose..."
│
├─ houston_memory::load_snapshot(".houston/memory/")
│  → frozen MEMORY.md text + USER.md text (will not change this session)
│
├─ houston_tauri::build_system_prompt(base, skills_index, memory, workspace_files)
│  → complete system prompt with self-improvement guidance
│
└─ spawn_and_monitor(prompt, ..., review_options)
   │
   │  DURING SESSION (agent tool calls via bash):
   │  ├─ `houston skill list`              → see available procedures
   │  ├─ `houston skill view X`            → load full procedure
   │  ├─ `houston skill patch X --old --new` → fix wrong step (INLINE)
   │  ├─ `houston skill create X --content` → save new procedure
   │  ├─ `houston memory add "fact"`        → save agent note
   │  ├─ `houston memory add --target user` → save user preference
   │  ├─ `houston memory replace 3 "new"`   → curate: replace stale entry
   │  ├─ `houston search "auth issue"`      → recall past session context
   │  └─ ... normal work (file edits, API calls, etc.)
   │
   │  SESSION COMPLETES
   │
   └─ POST-SESSION REVIEW (if review_options.enabled):
      ├─ load full transcript from houston-db
      ├─ spawn one-shot Claude:
      │   context = transcript
      │   tools = houston skill create/patch + houston memory add/replace
      │   prompt = "Review conversation. Save reusable procedures as skills.
      │             Save user preferences to memory. If nothing worth saving,
      │             say 'Nothing to save.' and stop."
      ├─ review agent writes to .houston/skills/ and .houston/memory/
      ├─ review agent dies
      └─ emit HoustonEvent::ReviewCompleted { skills_created, skills_updated, ... }

NEXT SESSION
└─ skills index rebuilt (now includes newly created skills)
└─ memory re-loaded (now includes new entries)
└─ agent is smarter than last time
```

---

## 4. File & Directory Conventions

### Workspace Layout

Every Houston app has a workspace directory. The self-improvement system uses:

```
<workspace>/
└── .houston/
    ├── skills/
    │   ├── <skill-name>/
    │   │   ├── SKILL.md           # Required: procedure + metadata
    │   │   ├── templates/         # Optional: supporting files
    │   │   │   └── scaffold.json
    │   │   ├── references/        # Optional: reference documents
    │   │   └── scripts/           # Optional: helper scripts
    │   └── <another-skill>/
    │       └── SKILL.md
    ├── memory/
    │   ├── MEMORY.md              # Agent's personal notes
    │   └── USER.md                # User profile
    └── ... (other workspace files)
```

### SKILL.md Format

```markdown
---
name: docker-deploy
description: Deploy services via Docker Compose with bridge network workarounds
version: 3
tags: [devops, docker, deployment]
created: 2026-03-28
last_used: 2026-04-04
---

## Procedure

1. Verify Docker daemon is running: `docker info`
2. Check compose file syntax: `docker compose config`
3. Create external network if needed: `docker network create app-net`
4. Deploy: `docker compose up -d --build`
5. Verify: `docker compose ps` — all containers should be "Up"
6. Check logs for errors: `docker compose logs --tail=50`

## Pitfalls

- **Bridge network DNS:** Containers in different compose projects can't resolve
  each other by service name. Use `external: true` network and connect both
  projects to it.
- **Base image drift:** Always pin to specific tags (e.g., `node:20.11-alpine`),
  not `node:latest`. The `latest` tag broke the build on 2026-04-01 when
  Alpine 3.20 dropped Python 2 support.
- **Port conflicts:** Check `docker ps` for existing port bindings before deploying.
  Port 3000 is commonly occupied by other dev servers.

## History

- v1: Created after 12-step deployment struggle (2026-03-28)
- v2: Fixed base image reference — was alpine:3.18, not alpine:3.19 (2026-04-01)
- v3: Added external network workaround after cross-project DNS failure (2026-04-04)
```

**Frontmatter fields:**

| Field | Required | Type | Description |
|---|---|---|---|
| `name` | Yes | string, max 64 chars | Unique identifier (also the directory name) |
| `description` | Yes | string, max 256 chars | One-line summary (shown in skills index) |
| `version` | No | integer | Incremented on each update |
| `tags` | No | string[] | Categorization (for future filtering) |
| `created` | No | date (YYYY-MM-DD) | When the skill was first created |
| `last_used` | No | date (YYYY-MM-DD) | Updated when `skill view` is called |

### MEMORY.md Format

```
Environment: macOS Sonoma 15.2, Homebrew, pnpm 9.1, Rust 1.82 nightly
§
The staging server at staging.example.com requires VPN — always check VPN status first
§
Project uses Tailwind CSS v4 — NO config file, all configuration in CSS @theme blocks
§
API rate limit is 100 req/min for the free tier. Use exponential backoff, not fixed retry.
```

**Format rules:**
- Entry delimiter: `§` (U+00A7 SECTION SIGN) on its own line
- Entries are plain text, not structured
- No frontmatter
- Maximum 2,200 characters total (configurable per app)
- The agent is told the current usage (e.g., "62% — 1,364/2,200 chars") so it knows when to curate

### USER.md Format

Same format as MEMORY.md but for user profile information:

```
Name: James. CTO. Based in Bogota, Colombia.
§
Prefers action over discussion — don't ask for permission on obvious tasks
§
Deep expertise in Rust and React. New to infrastructure/DevOps.
§
Communication style: terse, direct. Hates filler words and unnecessary summaries.
```

**Maximum 1,375 characters** (configurable per app).

**Why these specific limits:** Hermes uses 2,200 / 1,375. These numbers aren't magic — they're tuned so that:
- Memory + user profile together fit in ~1,000 tokens (small fraction of context)
- The limit is large enough to hold 8-15 meaningful entries
- The limit is small enough that the agent must curate (can't just dump everything)

---

## 5. Implementation: `houston-skills` (New Crate)

### Crate Setup

```
houston/crates/houston-skills/
├── Cargo.toml
├── src/
│   ├── lib.rs          # Public API
│   ├── format.rs       # SKILL.md parsing and serialization
│   ├── index.rs        # Skills index builder
│   └── patch.rs        # Fuzzy find-and-replace for skill patching
```

**Dependencies:** `serde`, `serde_yaml` (frontmatter), `thiserror`, `chrono` (dates). No async. No database. No Tauri.

### Public API

```rust
// --- Types ---

/// Compact skill summary for index/listing
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    pub version: Option<u32>,
    pub tags: Vec<String>,
    pub last_used: Option<String>,  // YYYY-MM-DD
}

/// Full skill content
pub struct Skill {
    pub summary: SkillSummary,
    pub content: String,           // Full markdown body (everything after frontmatter)
    pub supporting_files: Vec<String>,  // Relative paths to templates/, references/, scripts/
}

/// Skill creation input
pub struct CreateSkillInput {
    pub name: String,               // Will be validated: alphanumeric + hyphens, max 64 chars
    pub description: String,        // Max 256 chars
    pub content: String,            // Markdown body
    pub tags: Option<Vec<String>>,
}

// --- Functions ---

/// List all skills in the directory. Returns name + description only (progressive disclosure).
pub fn list_skills(skills_dir: &Path) -> Result<Vec<SkillSummary>, SkillError>;

/// Load a skill's full content. Updates `last_used` in frontmatter.
pub fn load_skill(skills_dir: &Path, name: &str) -> Result<Skill, SkillError>;

/// Create a new skill. Validates frontmatter, checks name uniqueness.
pub fn create_skill(skills_dir: &Path, input: CreateSkillInput) -> Result<(), SkillError>;

/// Targeted find-and-replace within a skill's SKILL.md.
/// Uses fuzzy matching (whitespace-normalized) to find `old_text`.
/// Increments version number. Appends to ## History if present.
pub fn patch_skill(
    skills_dir: &Path,
    name: &str,
    old_text: &str,
    new_text: &str,
) -> Result<(), SkillError>;

/// Full rewrite of a skill's SKILL.md content (preserves frontmatter metadata).
pub fn edit_skill(skills_dir: &Path, name: &str, new_content: &str) -> Result<(), SkillError>;

/// Delete a skill (removes entire directory).
pub fn delete_skill(skills_dir: &Path, name: &str) -> Result<(), SkillError>;

/// Write a supporting file under a skill's directory.
/// `subdir` must be one of: "templates", "references", "scripts", "assets".
pub fn write_supporting_file(
    skills_dir: &Path,
    skill_name: &str,
    subdir: &str,
    file_name: &str,
    content: &str,
) -> Result<(), SkillError>;

/// Remove a supporting file.
pub fn remove_supporting_file(
    skills_dir: &Path,
    skill_name: &str,
    subdir: &str,
    file_name: &str,
) -> Result<(), SkillError>;

/// Build compact skills index for system prompt injection.
/// Output format:
///   SKILLS (N available — use `houston skill view <name>` to load full procedure)
///   • docker-deploy — Deploy services via Docker Compose...
///   • api-testing — Test REST APIs with authentication...
/// Returns empty string if no skills exist.
pub fn build_skills_index(skills_dir: &Path) -> Result<String, SkillError>;
```

### SKILL.md Parsing (`format.rs`)

The SKILL.md file has YAML frontmatter delimited by `---` lines, followed by markdown content:

```rust
/// Parse a SKILL.md file into frontmatter + body.
/// Frontmatter is between the first and second `---` lines.
pub fn parse_skill_file(content: &str) -> Result<(SkillFrontmatter, String), SkillError>;

/// Serialize frontmatter + body back to SKILL.md format.
pub fn serialize_skill_file(frontmatter: &SkillFrontmatter, body: &str) -> String;

/// Validate frontmatter fields:
/// - `name` required, max 64 chars, alphanumeric + hyphens only
/// - `description` required, max 256 chars
/// - `version` if present, must be positive integer
/// - Content body max 50,000 chars (generous limit, prevents abuse)
pub fn validate_skill(frontmatter: &SkillFrontmatter, body: &str) -> Result<(), SkillError>;
```

### Fuzzy Patch (`patch.rs`)

When the agent patches a skill, the `old_text` may not match exactly (whitespace differences, line breaks). Implement whitespace-normalized matching:

```rust
/// Find `old_text` in `content` using whitespace-normalized matching.
/// Collapses consecutive whitespace (including newlines) into single spaces for comparison.
/// Returns the byte range of the actual (non-normalized) match in the original content.
pub fn fuzzy_find(content: &str, old_text: &str) -> Option<std::ops::Range<usize>>;
```

**Why fuzzy matching:** When an agent sees a skill's content in a chat message and then tries to patch it, formatting differences (extra newlines, trailing spaces) are common. Hermes uses fuzzy matching for the same reason. Without it, patches fail silently and the agent gives up.

### Skills Index Builder (`index.rs`)

```rust
/// Scan skills_dir, parse each SKILL.md's frontmatter, build compact index.
/// Sorts by last_used (most recent first), then alphabetically.
pub fn build_skills_index(skills_dir: &Path) -> Result<String, SkillError> {
    // 1. Read all <name>/SKILL.md files in skills_dir
    // 2. Parse frontmatter only (skip body for performance)
    // 3. Sort: last_used desc, then name asc
    // 4. Format as:
    //    SKILLS ({count} available — use `houston skill view <name>` to load full procedure)
    //    • {name} — {description}
    //    • {name} — {description}
    //    ...
    // 5. If no skills, return empty string (not "SKILLS (0 available)")
}
```

---

## 6. Implementation: `houston-memory` (Rewrite)

### Crate Setup

```
houston/crates/houston-memory/
├── Cargo.toml
├── src/
│   ├── lib.rs          # Public API
│   ├── entries.rs      # Entry parsing, CRUD operations
│   └── prompt.rs       # System prompt block builder
```

**Dependencies:** `thiserror`. That's it. This is an extremely simple crate.

### Constants

```rust
/// Section delimiter between entries
pub const ENTRY_DELIMITER: &str = "\n§\n";

/// Default character limit for MEMORY.md
pub const DEFAULT_MEMORY_LIMIT: usize = 2_200;

/// Default character limit for USER.md
pub const DEFAULT_USER_LIMIT: usize = 1_375;
```

### Public API

```rust
/// Memory target: agent notes or user profile
pub enum MemoryTarget {
    Agent,  // MEMORY.md
    User,   // USER.md
}

/// A single memory entry with its index
pub struct MemoryEntry {
    pub index: usize,
    pub text: String,
}

/// Snapshot of both memory files for system prompt injection
pub struct MemorySnapshot {
    pub agent_entries: Vec<MemoryEntry>,
    pub agent_chars: usize,
    pub agent_limit: usize,
    pub user_entries: Vec<MemoryEntry>,
    pub user_chars: usize,
    pub user_limit: usize,
}

/// Configuration for memory limits (apps can override defaults)
pub struct MemoryConfig {
    pub memory_limit: usize,  // Default: 2_200
    pub user_limit: usize,    // Default: 1_375
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            memory_limit: DEFAULT_MEMORY_LIMIT,
            user_limit: DEFAULT_USER_LIMIT,
        }
    }
}

// --- Functions ---

/// Load a frozen snapshot of both memory files.
/// Returns entries + character counts for prompt building.
/// If files don't exist, returns empty entries (not an error).
pub fn load_snapshot(
    memory_dir: &Path,
    config: &MemoryConfig,
) -> Result<MemorySnapshot, MemoryError>;

/// List entries from a specific target file.
pub fn list_entries(
    memory_dir: &Path,
    target: MemoryTarget,
) -> Result<Vec<MemoryEntry>, MemoryError>;

/// Add an entry to a target file.
/// Returns error if adding would exceed the character limit.
/// The error message includes current usage so the agent knows to curate.
pub fn add_entry(
    memory_dir: &Path,
    target: MemoryTarget,
    text: &str,
    config: &MemoryConfig,
) -> Result<(), MemoryError>;

/// Replace an entry by index.
/// Returns error if the new text would cause the file to exceed its limit.
pub fn replace_entry(
    memory_dir: &Path,
    target: MemoryTarget,
    index: usize,
    new_text: &str,
    config: &MemoryConfig,
) -> Result<(), MemoryError>;

/// Remove an entry by index.
pub fn remove_entry(
    memory_dir: &Path,
    target: MemoryTarget,
    index: usize,
) -> Result<(), MemoryError>;

/// Build formatted memory block for system prompt injection.
/// Output format:
///   ══════════════════════════════════════
///   MEMORY (your personal notes) [62% — 1,364/2,200 chars]
///   ══════════════════════════════════════
///   Entry 1 here
///   §
///   Entry 2 here
///
///   ══════════════════════════════════════
///   USER PROFILE [45% — 619/1,375 chars]
///   ══════════════════════════════════════
///   Name: James...
///   §
///   ...
///
/// Returns empty string if both files are empty.
pub fn build_memory_prompt(
    memory_dir: &Path,
    config: &MemoryConfig,
) -> Result<String, MemoryError>;
```

### Entry Parsing (`entries.rs`)

```rust
/// Parse a memory file (MEMORY.md or USER.md) into entries.
/// Splits on ENTRY_DELIMITER ("§" on its own line).
/// Trims whitespace from each entry.
/// Filters out empty entries.
pub fn parse_entries(content: &str) -> Vec<String>;

/// Serialize entries back to file format.
/// Joins with ENTRY_DELIMITER.
pub fn serialize_entries(entries: &[String]) -> String;

/// Calculate total character count of serialized entries.
/// This is what's compared against the limit.
pub fn char_count(entries: &[String]) -> usize;
```

### Limit Enforcement

When `add_entry` is called and the result would exceed the character limit:

```rust
Err(MemoryError::LimitExceeded {
    target: "MEMORY.md",
    current: 2050,
    limit: 2200,
    entry_size: 280,
    message: "MEMORY.md is at 93% capacity (2,050/2,200 chars). This entry (280 chars) \
              would exceed the limit. Use `houston memory replace <index> \"...\"` to replace \
              a stale entry, or `houston memory remove <index>` to free space first."
})
```

The error message is designed to be read by the agent — it tells the agent exactly what to do (replace or remove) rather than just failing.

---

## 7. Implementation: `houston-db` Enhancement (FTS5 Session Search)

### New Migration

Add to houston-db's migration system:

```sql
-- FTS5 virtual table for full-text search over chat messages
CREATE VIRTUAL TABLE IF NOT EXISTS chat_feed_fts USING fts5(
    content,
    content='chat_feed',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- Keep FTS5 in sync with chat_feed
CREATE TRIGGER IF NOT EXISTS chat_feed_fts_insert AFTER INSERT ON chat_feed BEGIN
    INSERT INTO chat_feed_fts(rowid, content) VALUES (new.id, new.data_json);
END;

CREATE TRIGGER IF NOT EXISTS chat_feed_fts_delete AFTER DELETE ON chat_feed BEGIN
    INSERT INTO chat_feed_fts(chat_feed_fts, rowid, content) VALUES('delete', old.id, old.data_json);
END;

CREATE TRIGGER IF NOT EXISTS chat_feed_fts_update AFTER UPDATE ON chat_feed BEGIN
    INSERT INTO chat_feed_fts(chat_feed_fts, rowid, content) VALUES('delete', old.id, old.data_json);
    INSERT INTO chat_feed_fts(rowid, content) VALUES (new.id, new.data_json);
END;
```

### New Repository Functions

```rust
/// Search result from FTS5 query
pub struct SearchResult {
    pub feed_key: String,          // Session/conversation identifier
    pub source: Option<String>,    // Channel source if any
    pub timestamp: String,
    pub snippet: String,           // Text around the match (from FTS5 snippet())
    pub rank: f64,                 // FTS5 rank score
}

/// Search session group — multiple matches grouped by session
pub struct SessionSearchResult {
    pub feed_key: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
    pub match_count: usize,
    pub snippets: Vec<String>,     // Top N snippets from this session
}

/// Full-text search across persisted chat feed.
/// Groups results by feed_key (session), excludes `exclude_feed_key` if provided.
/// Returns up to `max_sessions` sessions, each with up to `max_snippets` snippets.
pub async fn search_sessions(
    db: &Database,
    query: &str,
    exclude_feed_key: Option<&str>,
    max_sessions: usize,           // Default: 10
    max_snippets_per_session: usize, // Default: 3
) -> Result<Vec<SessionSearchResult>, DbError>;

/// List recent sessions (no search query). Returns metadata only.
/// Useful for "what have I been working on?" queries.
pub async fn list_recent_sessions(
    db: &Database,
    limit: usize,                  // Default: 20
) -> Result<Vec<SessionMetadata>, DbError>;

/// Load the full conversation for a specific session.
/// Used by the review agent and potentially by session search for LLM summarization.
pub async fn get_session_transcript(
    db: &Database,
    feed_key: &str,
) -> Result<Vec<FeedItem>, DbError>;
```

### FTS5 Query Sanitization

User/agent queries need to be sanitized for FTS5 syntax:

```rust
/// Sanitize a search query for FTS5.
/// - Wraps hyphenated/dotted terms in quotes ("chat-send" → "\"chat-send\"")
/// - Strips dangerous FTS5 metacharacters (^, NEAR, etc.)
/// - Preserves: simple keywords, "quoted phrases", OR, NOT, prefix*
pub fn sanitize_fts_query(query: &str) -> String;
```

---

## 8. Implementation: `houston-cli` Enhancement

### New Subcommands

Add to the existing houston CLI binary:

```
houston skill list [--json]
houston skill view <name> [--json]
houston skill create <name> --description "..." --content "..."
houston skill patch <name> --old "..." --new "..."
houston skill edit <name> --content "..."
houston skill delete <name>
houston skill write-file <name> --subdir templates --file scaffold.json --content "..."
houston skill remove-file <name> --subdir templates --file scaffold.json

houston memory list [--target agent|user] [--json]
houston memory add "entry text" [--target agent|user]
houston memory replace <index> "new text" [--target agent|user]
houston memory remove <index> [--target agent|user]

houston search "query" [--max-sessions 10] [--json]
houston search --recent [--limit 20] [--json]
```

**Global flags (existing pattern):** `--db-path PATH --project-id ID --workspace-dir PATH`

**Output conventions:**
- Default: human-readable (for manual use)
- `--json`: machine-readable JSON on stdout (for agent consumption)
- Errors: always to stderr
- Exit code: 0 success, 1 error

### SKILL.md for houston CLI

Update the existing `crates/houston-cli/skills/SKILL.md` to include the new commands. This is the self-describing document that agents read to learn all available commands. It already documents `houston task` commands — add `houston skill`, `houston memory`, and `houston search`.

The SKILL.md should include:
1. All commands with flags
2. Example usage for each command
3. Output format description
4. Guidance on **when** to use each command (matching the self-improvement prompt fragment)

---

## 9. Implementation: `houston-tauri` Enhancement

### A. Enhanced `build_system_prompt()`

Add skills index and memory snapshot as inputs to the existing system prompt assembly function:

```rust
/// Build a complete system prompt with self-improvement context.
///
/// Assembly order:
/// 1. base_prompt (app-provided identity, behavior rules)
/// 2. SELF_IMPROVEMENT_GUIDANCE (houston constant — see section 10)
/// 3. memory_snapshot (from houston_memory::build_memory_prompt)
/// 4. skills_index (from houston_skills::build_skills_index)
/// 5. workspace_files (SOUL.md, HEARTBEAT.md, etc.)
/// 6. Additional context (tools, platform info, etc.)
pub fn build_system_prompt(
    base_prompt: &str,
    memory_snapshot: &str,
    skills_index: &str,
    workspace_files: &[(&str, &str)],  // (filename, content) pairs
    include_self_improvement: bool,     // Apps can opt out
) -> String;
```

**Why `include_self_improvement` flag:** Some sessions shouldn't self-improve — e.g., a quick one-shot classifier or a feedback extraction agent. Apps control this per session.

### B. Post-Session Review

Add `ReviewOptions` to the session runner:

```rust
/// Configuration for post-session review.
pub struct ReviewOptions {
    /// Path to the skills directory (.houston/skills/)
    pub skills_dir: PathBuf,
    /// Path to the memory directory (.houston/memory/)
    pub memory_dir: PathBuf,
    /// Path to the database (for --db-path flag in houston CLI commands)
    pub db_path: PathBuf,
    /// Working directory for the review agent
    pub working_dir: PathBuf,
    /// Custom review prompt (if None, uses DEFAULT_REVIEW_PROMPT)
    pub review_prompt: Option<String>,
    /// Maximum iterations for the review agent (default: 8)
    pub max_iterations: Option<u32>,
}

/// Default review prompt shipped with houston.
pub const DEFAULT_REVIEW_PROMPT: &str = r#"
Review the conversation above and consider what's worth persisting for future sessions.

SKILLS — Create or update a skill if:
- A complex task succeeded (5+ steps) and the procedure is reusable
- An error was overcome through trial and error with a generalizable fix
- A non-obvious workflow was discovered that would apply to similar future tasks
- You used an existing skill and found it wrong or incomplete (patch it)

MEMORY — Save to memory if:
- The user revealed preferences, habits, or personal details worth remembering
- The user corrected your approach or expressed expectations about behavior
- You discovered environment facts, tool quirks, or project conventions
- Something happened that would help you avoid the same mistake next time

Do NOT save:
- Trivial observations ("user asked me to edit a file")
- Things already captured in existing skills or memory
- Task-specific details that won't apply to future sessions
- Anything that can be derived from reading the codebase

If nothing is worth saving, respond with only: "Nothing to save."
"#;

/// Event emitted when post-session review completes
pub enum HoustonEvent {
    // ... existing variants ...

    ReviewCompleted {
        session_key: String,
        skills_created: Vec<String>,    // Names of new skills
        skills_updated: Vec<String>,    // Names of patched skills
        memory_entries_added: usize,    // Count of new memory entries
        user_entries_added: usize,      // Count of new user profile entries
    },
}
```

**Implementation of `spawn_review()`:**

```rust
/// Spawn a post-session review agent.
/// Called after spawn_and_monitor() completes successfully.
async fn spawn_review(
    app_handle: &AppHandle,
    session_key: &str,
    transcript: &str,           // Full session transcript as text
    options: &ReviewOptions,
) -> Result<ReviewResult, ReviewError> {
    // 1. Build the review prompt:
    //    "[CONVERSATION TRANSCRIPT]\n{transcript}\n\n[REVIEW INSTRUCTIONS]\n{review_prompt}"

    // 2. Build system prompt for the review agent:
    //    - Minimal identity ("You are a review agent...")
    //    - List of available tools: houston skill create/patch, houston memory add/replace
    //    - The workspace-dir and db-path flags for houston CLI

    // 3. Spawn Claude CLI:
    //    claude -p --output-format stream-json --max-turns {max_iterations}
    //    (with --dangerously-skip-permissions since this is automated)
    //    Working dir: options.working_dir
    //    Stdin: the assembled prompt

    // 4. Parse the output to detect which skills/memory were modified:
    //    Look for tool calls to `houston skill create`, `houston skill patch`,
    //    `houston memory add`, `houston memory replace` in the stream output

    // 5. Emit HoustonEvent::ReviewCompleted with summary

    // 6. Return ReviewResult
}
```

**Integration with `spawn_and_monitor()`:**

The existing `spawn_and_monitor()` function takes a `PersistOptions` for feed persistence. Add an optional `ReviewOptions`:

```rust
pub fn spawn_and_monitor(
    app_handle: &AppHandle,
    session_key: &str,
    prompt: &str,
    resume_id: Option<String>,
    working_dir: &Path,
    system_prompt: &str,
    chat_state: Option<ChatSessionState>,
    persist_options: Option<PersistOptions>,
    review_options: Option<ReviewOptions>,    // NEW
) -> JoinHandle<SessionResult>;
```

After the session completes with status `Completed` (not `Error` or `Cancelled`), if `review_options` is `Some`:

1. Load the session transcript from the database (using `persist_options` feed_key)
2. Call `spawn_review()` in a background tokio task (non-blocking)
3. The review runs independently — the main session has already returned to the user

### C. New Tauri Commands

```rust
// --- Skills ---

#[tauri::command]
pub fn skill_list(workspace_dir: String) -> Result<Vec<SkillSummary>, String> {
    let skills_dir = PathBuf::from(&workspace_dir).join(".houston/skills");
    houston_skills::list_skills(&skills_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn skill_view(workspace_dir: String, name: String) -> Result<Skill, String> {
    let skills_dir = PathBuf::from(&workspace_dir).join(".houston/skills");
    houston_skills::load_skill(&skills_dir, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn skill_create(workspace_dir: String, input: CreateSkillInput) -> Result<(), String> {
    let skills_dir = PathBuf::from(&workspace_dir).join(".houston/skills");
    houston_skills::create_skill(&skills_dir, input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn skill_patch(
    workspace_dir: String,
    name: String,
    old_text: String,
    new_text: String,
) -> Result<(), String> {
    let skills_dir = PathBuf::from(&workspace_dir).join(".houston/skills");
    houston_skills::patch_skill(&skills_dir, &name, &old_text, &new_text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn skill_delete(workspace_dir: String, name: String) -> Result<(), String> {
    let skills_dir = PathBuf::from(&workspace_dir).join(".houston/skills");
    houston_skills::delete_skill(&skills_dir, &name).map_err(|e| e.to_string())
}

// --- Memory ---

#[tauri::command]
pub fn memory_load(workspace_dir: String) -> Result<MemorySnapshot, String> {
    let memory_dir = PathBuf::from(&workspace_dir).join(".houston/memory");
    let config = MemoryConfig::default();
    houston_memory::load_snapshot(&memory_dir, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_add(
    workspace_dir: String,
    target: String,    // "agent" or "user"
    entry: String,
) -> Result<(), String> {
    let memory_dir = PathBuf::from(&workspace_dir).join(".houston/memory");
    let target = parse_target(&target)?;
    let config = MemoryConfig::default();
    houston_memory::add_entry(&memory_dir, target, &entry, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_replace(
    workspace_dir: String,
    target: String,
    index: usize,
    new_text: String,
) -> Result<(), String> {
    let memory_dir = PathBuf::from(&workspace_dir).join(".houston/memory");
    let target = parse_target(&target)?;
    let config = MemoryConfig::default();
    houston_memory::replace_entry(&memory_dir, target, index, &new_text, &config)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn memory_remove(
    workspace_dir: String,
    target: String,
    index: usize,
) -> Result<(), String> {
    let memory_dir = PathBuf::from(&workspace_dir).join(".houston/memory");
    let target = parse_target(&target)?;
    houston_memory::remove_entry(&memory_dir, target, index).map_err(|e| e.to_string())
}

// --- Search ---

#[tauri::command]
pub async fn session_search(
    state: tauri::State<'_, AppState>,
    query: String,
    exclude_feed_key: Option<String>,
) -> Result<Vec<SessionSearchResult>, String> {
    houston_db::search_sessions(
        &state.db,
        &query,
        exclude_feed_key.as_deref(),
        10,  // max sessions
        3,   // max snippets per session
    )
    .await
    .map_err(|e| e.to_string())
}
```

---

## 10. Implementation: Self-Improvement Prompt Fragment

This is the most important piece. It's a Rust constant shipped with `houston-tauri` that gets injected into every agent's system prompt (unless the app opts out).

```rust
/// Self-improvement guidance injected into agent system prompts.
/// This is what makes agents self-improving. Without it, agents have the tools
/// but no motivation to use them.
pub const SELF_IMPROVEMENT_GUIDANCE: &str = r#"
## Self-Improvement

You have persistent skills and memory that survive across sessions. They make you better over time. Use them.

### Checking Existing Knowledge (DO THIS FIRST)

Before starting complex work, check if your past self already solved this:
- Run `houston skill list` to see available procedures
- Run `houston skill view <name>` to load a relevant procedure before starting
- Run `houston search "keywords"` to recall relevant past sessions

### Skills — Reusable Procedures (.houston/skills/)

Skills are step-by-step procedures you've learned from experience. They persist across sessions.

**Using skills:** When you find a relevant skill, follow its procedure. It was written by you (or a past version of you) based on real experience — trust it.

**Create a skill when:**
- A task took 5+ steps and the procedure would be reusable for similar tasks
- You fixed a tricky error through trial and error (save the fix, not just the error)
- You discovered a non-trivial workflow that isn't documented elsewhere
- The user asks you to remember a procedure

Use: `houston skill create <name> --description "..." --content "..."`

**Update a skill when:**
- You're using a skill and find a step that's wrong, outdated, or incomplete
- Patch it IMMEDIATELY — don't wait to be asked, don't finish the task first
- Skills that aren't maintained become liabilities

Use: `houston skill patch <name> --old "wrong step" --new "correct step"`

### Memory — Persistent Notes (.houston/memory/)

Two memory stores persist across sessions:
- **MEMORY** — your notes about the environment, tools, conventions, and lessons learned
- **USER PROFILE** — what you know about the user (preferences, role, communication style)

**Save proactively (do NOT wait to be asked):**
- User corrects your approach or says "don't do that" → save what they wanted instead
- User shares a preference, habit, or personal detail → save to user profile
- You discover an environment fact, API quirk, or tool behavior → save to memory
- You learn a project convention or architectural decision → save to memory
- A stable fact would help a future session avoid your current struggle → save to memory

Use: `houston memory add "the fact"` or `houston memory add --target user "the preference"`

**Priority:** User corrections and preferences > environment facts > procedural knowledge.

**Curation:** Memory is bounded. If adding an entry would exceed the limit, replace the least relevant existing entry with `houston memory replace <index> "new text"`. Do not just fail to save — curate.

### What NOT to Save

- Trivial observations ("user asked me to edit a file")
- Things already in existing skills or memory (check first)
- Task-specific details that won't apply to future sessions
- Anything derivable from reading the codebase or git history
"#;
```

### Why Each Section Exists

| Section | Purpose | What Happens Without It |
|---|---|---|
| "Checking Existing Knowledge" | Agent searches skills/memory BEFORE starting work | Agent re-derives solutions it already knows |
| "Create a skill when" | Triggers for autonomous skill creation | Agent never creates skills (the tools exist but are unused) |
| "Update a skill when... IMMEDIATELY" | Forces inline self-correction | Skills rot — wrong steps persist forever |
| "Save proactively" | List of triggers for memory saves | Agent only saves when explicitly asked (misses 90% of learnings) |
| "Priority" ordering | Tells agent what matters most | Agent saves trivia over corrections |
| "Curation" guidance | Forces replacement over failure | Agent hits limit, gives up, stops learning |
| "What NOT to save" | Prevents memory pollution | Memory fills with noise, useful entries get evicted |

---

## 11. Implementation: `@houston-ai/skills` Enhancement

### Current State

`@houston-ai/skills` already has: `SkillsGrid`, `SkillDetailPage`, `CommunitySkillsSection`. These were built for Houston's skill system (database-backed).

### Required Changes

Adapt to the filesystem-based skill format. The component API should accept:

```tsx
// Types matching the Rust houston-skills types
interface SkillSummary {
  name: string;
  description: string;
  version?: number;
  tags?: string[];
  lastUsed?: string;  // ISO date
}

interface Skill extends SkillSummary {
  content: string;           // Full markdown body
  supportingFiles?: string[]; // Relative file paths
}

// SkillsGrid props
interface SkillsGridProps {
  skills: SkillSummary[];
  onSkillClick?: (name: string) => void;
  onSkillDelete?: (name: string) => void;
  emptyState?: React.ReactNode;
}

// SkillDetailPage props
interface SkillDetailPageProps {
  skill: Skill;
  onEdit?: (name: string, newContent: string) => void;
  onDelete?: (name: string) => void;
  onBack?: () => void;
}
```

### New UI Elements

1. **Usage indicator on each skill card:** Show `version`, `last_used`, and `tags` as badges
2. **Markdown rendering** for skill content (using the existing markdown renderer from `@houston-ai/chat`)
3. **Edit mode** — users can edit SKILL.md content directly (textarea with markdown preview)
4. **History section** — show the `## History` section prominently if present (shows how the skill evolved)

---

## 12. Implementation: `@houston-ai/memory` Rewrite

### Current State

`@houston-ai/memory` has a `MemoryBrowser` component built for the old houston-memory (vector-based). Needs full rewrite.

### New Components

```tsx
// Types matching the Rust houston-memory types
interface MemoryEntry {
  index: number;
  text: string;
}

interface MemorySnapshot {
  agentEntries: MemoryEntry[];
  agentChars: number;
  agentLimit: number;
  userEntries: MemoryEntry[];
  userChars: number;
  userLimit: number;
}

// Main component
interface MemoryBrowserProps {
  snapshot: MemorySnapshot;
  onAddEntry?: (target: 'agent' | 'user', text: string) => void;
  onReplaceEntry?: (target: 'agent' | 'user', index: number, text: string) => void;
  onRemoveEntry?: (target: 'agent' | 'user', index: number) => void;
}
```

### UI Design

Two sections (MEMORY and USER PROFILE), each showing:

1. **Usage bar** — visual progress bar showing character usage (e.g., 62% — 1,364/2,200 chars)
   - Green (< 70%), Yellow (70-90%), Red (> 90%)
2. **Entry list** — each entry as a card with:
   - The text content
   - Edit button (inline editing)
   - Delete button (with confirmation)
3. **Add entry** — text input at the bottom of each section
4. **Empty state** — "No memories yet. Your agent will save important learnings here as it works."

---

## 13. App Integration (Houston & Houston)

### What Apps Need to Do

Apps integrate by:

1. **Passing `ReviewOptions` to `spawn_and_monitor()`** — enables post-session review
2. **Including skills index and memory in the system prompt** — via enhanced `build_system_prompt()`
3. **Registering new Tauri commands** — the skill/memory/search commands
4. **Adding UI views** — wire `@houston-ai/skills` and `@houston-ai/memory` to Tauri commands

### Houston Integration

Houston already has a skills system (database-backed, with feedback learning). The migration:

1. **Replace DB-backed skills with filesystem skills.** Migrate existing skills from `skills` DB table to `.houston/skills/<name>/SKILL.md` files. Houston's `## Instructions + ## Learnings` format maps to `## Procedure + ## Pitfalls`.
2. **Keep the feedback learning flow as an addition.** Houston's explicit feedback loop (user approves with feedback → classifier updates skills) is complementary to inline self-correction. Both can coexist.
3. **Add `ReviewOptions` to issue execution sessions.** After an execution agent completes, the review agent examines the transcript.
4. **Add `ReviewOptions` to routine execution sessions.** Same for routine completions.
5. **Houston chat (planning agent) can also self-improve.** The planning agent learns which types of tasks it delegates well vs. poorly.

### Houston Integration

Houston is simpler (single workspace, chat-first):

1. **Skills and memory in `~/Documents/Houston/.houston/`** (the workspace directory).
2. **Add `ReviewOptions` to the single chat session.** After each conversation turn? No — after the session ends (user closes app or starts new conversation). Mid-conversation reviews would be disruptive.
3. **Heartbeat as nudge mechanism.** Houston already has heartbeats. The heartbeat prompt can include: "Check if there are any recent learnings worth persisting to memory." This approximates Hermes's periodic nudge without a background subagent.
4. **Memory review via heartbeat.** Add to HEARTBEAT.md: "Review recent interactions. If you learned something reusable, save it."

---

## 14. Implementation Order & Dependencies

### Dependency Graph

```
houston-skills (NEW, no deps)
houston-memory (REWRITE, no deps)
     │              │
     └──────┬───────┘
            │
     houston-db (ENHANCE, existing)
            │
     houston-cli (ENHANCE, depends on houston-skills + houston-memory + houston-db)
            │
     houston-tauri (ENHANCE, depends on all above)
            │
     ┌──────┴───────┐
     │              │
@houston-ai/skills  @houston-ai/memory
(ENHANCE)        (REWRITE)
     │              │
     └──────┬───────┘
            │
     App Integration
     (Houston, Houston)
```

### Recommended Build Order

**Phase 1: Foundation (no dependencies, can be built in parallel)**

| Step | Crate | What | Estimated Effort |
|---|---|---|---|
| 1a | `houston-skills` | New crate: format.rs, index.rs, patch.rs, lib.rs + tests | Medium |
| 1b | `houston-memory` | Rewrite: entries.rs, prompt.rs, lib.rs + tests | Small |

These two have zero dependencies on each other or any other crate. Build and test in isolation.

**Phase 2: Database & CLI (depends on Phase 1)**

| Step | Crate | What | Estimated Effort |
|---|---|---|---|
| 2a | `houston-db` | FTS5 migration, search functions, query sanitization + tests | Medium |
| 2b | `houston-cli` | Add `houston skill`, `houston memory`, `houston search` subcommands + tests | Medium |

2a and 2b can be partially parallelized (CLI skill/memory commands don't need FTS5).

**Phase 3: Integration (depends on Phase 1 + 2)**

| Step | Crate | What | Estimated Effort |
|---|---|---|---|
| 3a | `houston-tauri` | Enhanced build_system_prompt() + ReviewOptions + spawn_review() + Tauri commands | Large |
| 3b | `houston-tauri` | Self-improvement prompt fragment (SELF_IMPROVEMENT_GUIDANCE constant) | Small |

**Phase 4: Frontend (depends on Phase 3 for types, can start earlier with mocked data)**

| Step | Package | What | Estimated Effort |
|---|---|---|---|
| 4a | `@houston-ai/skills` | Adapt to filesystem-based skill format, add edit mode | Medium |
| 4b | `@houston-ai/memory` | Full rewrite: usage bars, entry CRUD, bounded memory UI | Medium |

**Phase 5: App Integration (depends on Phase 3 + 4)**

| Step | App | What | Estimated Effort |
|---|---|---|---|
| 5a | Houston | Migrate DB skills to filesystem, add ReviewOptions, wire UI | Large |
| 5b | Houston | Add skills/memory dirs, add ReviewOptions, wire UI, heartbeat nudge | Medium |

### Critical Path

`houston-skills` → `houston-cli` (skill commands) → `houston-tauri` (prompt + review) → App Integration

The skills crate is the foundation. Everything else depends on it.

---

## 15. Testing Strategy

### houston-skills Tests

```rust
#[test] fn test_create_skill_validates_frontmatter() { ... }
#[test] fn test_create_skill_rejects_duplicate_name() { ... }
#[test] fn test_create_skill_rejects_invalid_name() { ... }  // special chars, too long
#[test] fn test_load_skill_updates_last_used() { ... }
#[test] fn test_patch_skill_fuzzy_matching() { ... }  // whitespace differences
#[test] fn test_patch_skill_increments_version() { ... }
#[test] fn test_patch_skill_fails_if_old_text_not_found() { ... }
#[test] fn test_delete_skill_removes_directory() { ... }
#[test] fn test_build_skills_index_sorted_by_last_used() { ... }
#[test] fn test_build_skills_index_empty_directory() { ... }
#[test] fn test_supporting_files_restricted_to_allowed_subdirs() { ... }
```

### houston-memory Tests

```rust
#[test] fn test_add_entry_within_limit() { ... }
#[test] fn test_add_entry_exceeds_limit_returns_helpful_error() { ... }
#[test] fn test_replace_entry_updates_in_place() { ... }
#[test] fn test_replace_entry_checks_new_size_against_limit() { ... }
#[test] fn test_remove_entry_by_index() { ... }
#[test] fn test_remove_entry_invalid_index() { ... }
#[test] fn test_parse_entries_handles_empty_file() { ... }
#[test] fn test_parse_entries_handles_missing_file() { ... }  // returns empty, not error
#[test] fn test_char_count_includes_delimiters() { ... }
#[test] fn test_build_memory_prompt_shows_usage_percentage() { ... }
#[test] fn test_build_memory_prompt_empty_returns_empty_string() { ... }
```

### houston-db FTS5 Tests

```rust
#[tokio::test] async fn test_fts5_search_basic_keyword() { ... }
#[tokio::test] async fn test_fts5_search_quoted_phrase() { ... }
#[tokio::test] async fn test_fts5_search_excludes_current_session() { ... }
#[tokio::test] async fn test_fts5_search_groups_by_session() { ... }
#[tokio::test] async fn test_fts5_search_empty_query_returns_recent() { ... }
#[tokio::test] async fn test_fts5_query_sanitization() { ... }
#[tokio::test] async fn test_fts5_triggers_keep_index_in_sync() { ... }
```

### houston-cli Tests

Test via the binary's actual CLI interface (integration tests):

```rust
#[test] fn test_skill_create_and_list() { ... }
#[test] fn test_skill_view_returns_full_content() { ... }
#[test] fn test_skill_patch_updates_content() { ... }
#[test] fn test_memory_add_and_list() { ... }
#[test] fn test_memory_add_exceeds_limit() { ... }
#[test] fn test_memory_replace() { ... }
#[test] fn test_search_returns_results() { ... }
#[test] fn test_json_output_flag() { ... }
```

### Integration Tests

End-to-end test of the self-improvement loop:

```rust
#[tokio::test]
async fn test_self_improvement_loop() {
    // 1. Create a workspace with empty skills/ and memory/
    // 2. Build system prompt (should include guidance but no skills/memory)
    // 3. Simulate a session that creates a skill via houston CLI
    // 4. Verify skill file exists on disk with correct format
    // 5. Build system prompt again (should now include the skill in index)
    // 6. Simulate a session that patches the skill
    // 7. Verify skill version incremented and content updated
    // 8. Simulate memory add + verify char count enforcement
}
```

---

## 16. Security Considerations

### Skill Content Security

Hermes has a `skills_guard.py` that scans skill content for malicious patterns. We should implement similar protection:

**Block on create/edit/patch:**
- Prompt injection patterns: "ignore previous instructions", "disregard rules", "system:" prefixes
- Credential exfiltration: `curl` with env vars, `cat ~/.ssh`, `cat .env`
- Invisible unicode: zero-width spaces, directional overrides (could hide malicious instructions)

**Implementation:** A `validate_skill_content()` function in `houston-skills` that runs regex patterns against content. Returns `SkillError::SecurityViolation` with explanation.

**Why:** If the agent can write skills, and skills are injected into prompts, a malicious skill could hijack future sessions. This is a real attack vector that Hermes encountered in production.

### Memory Content Security

Same patterns apply to memory entries. A `validate_memory_content()` function in `houston-memory`.

### Review Agent Sandboxing

The post-session review agent should:
- Only have access to `houston skill` and `houston memory` CLI commands (not arbitrary bash)
- Run with `--max-turns` limit (default 8) to prevent infinite loops
- Have its output monitored for the same security patterns

---

## 17. Open Questions & Decisions

### Q1: Should skills be per-workspace or global?

**Hermes:** Global (`~/.hermes/skills/`). Skills apply everywhere.
**Houston current:** Per-project (`.houston/skills/`). Skills are project-specific.

**Recommendation:** Both. `.houston/skills/` for workspace-local skills + `~/.houston/skills/` for global skills. Index builder scans both, with local taking precedence on name conflicts. This lets "how to deploy this specific app" be local while "how to write good commit messages" is global.

**Decision needed:** Is the added complexity worth it, or should we start with workspace-local only?

### Q2: Should the review agent use the same model as the main session?

**Hermes:** Yes, same model.
**Cost concern:** A review agent call after every session adds ~$0.05-0.50 per session.

**Recommendation:** Make it configurable. Default to same model. Apps can override with a cheaper model or disable review entirely for cost-sensitive sessions.

### Q3: Should memory limits be configurable per app?

**Recommendation:** Yes. Ship defaults (2,200 / 1,375) but allow apps to override via `MemoryConfig`. Some apps may want more memory (power users) or less (constrained contexts).

### Q4: FTS5 search — should we add LLM summarization?

**Hermes:** Yes, uses an auxiliary model (Gemini Flash) to summarize search results.
**Our constraint:** We're Claude-only (Claude CLI). Spawning a summarization session for every search query adds latency and cost.

**Recommendation:** Start without summarization. Return raw FTS5 snippets. The agent can read the snippets and synthesize context itself — it's already an LLM. Add summarization later if raw snippets prove insufficient.

### Q5: Should inline skill patching require user approval?

**Hermes:** No. The agent patches skills immediately without asking.
**Risk:** Agent could degrade a skill with a bad patch.

**Recommendation:** No approval required. The skill has version history (## History section) and can be reverted manually. The whole point is frictionless self-improvement. Adding approval gates would kill the learning loop.

### Q6: Community skills / skill sharing?

**Hermes:** Has a skills marketplace (agentskills.io). OpenClaw had ClawHub (with security issues).

**Recommendation:** Out of scope for v1. Build the local system first. Community sharing is a future feature that depends on the security scanning being robust.

### Q7: How does this interact with Houston's existing feedback learning flow?

Houston currently has: task completes → user approves with feedback → one-shot Claude analyzes feedback → updates skill files.

**Recommendation:** Keep both. The feedback flow is explicit (user-driven). The Hermes system is implicit (agent-driven). They're complementary:
- Agent patches skills inline during execution (immediate corrections)
- Review agent saves new skills/memory after completion (reflection)
- User feedback updates skills after approval (directed learning)

All three write to the same `.houston/skills/` directory. The skill format supports all three sources.

---

## Summary

This implementation plan adds a Hermes-style self-improving agent system to Houston through:

1. **`houston-skills`** — New crate for filesystem-based skill CRUD with progressive disclosure
2. **`houston-memory`** — Rewritten crate for character-bounded persistent memory
3. **`houston-db`** — FTS5 full-text search over conversation history
4. **`houston-cli`** — New commands for agents to manage skills, memory, and search
5. **`houston-tauri`** — Enhanced prompt assembly, post-session review, Tauri commands
6. **Prompt fragment** — The soul of the system: guidance that makes agents self-improve
7. **`@houston-ai/skills`** — Enhanced UI for viewing/editing skills
8. **`@houston-ai/memory`** — Rewritten UI for bounded memory with usage indicators

The system is library-level — apps get self-improving agents by default with minimal integration work.
