# Claude Session Protocol — Houston

Caveman style. Progressive discovery. Load on demand.

---

## PHASE 0 — Load /caveman (EVERY SESSION, FIRST)

Before any action: invoke `/caveman` skill. Stay terse. Drop articles, filler, pleasantries. Technical substance stays. Code blocks unchanged.

Default level: `full`. Switch via `/caveman lite|full|ultra`.

Off only if user says "stop caveman" or "normal mode".

---

## Dispatch table (progressive discovery)

Deploying / shipping a release? → `/release`
Manual macOS build, notarize, staple? → `/build-app-local`
Bug? Don't guess → `/debug`

Need specific knowledge? Load on demand:
- Repo shape, products, engine story → `knowledge-base/architecture.md`
- Colors, typography, components, animation → `knowledge-base/design-system.md`
- `.houston/` layout, schemas, reactivity → `knowledge-base/files-first.md`
- Agent manifest, tiers, sidebar, workspaces → `knowledge-base/agent-manifest.md`
- Desktop ↔ Mobile WS contract → `knowledge-base/sync-protocol.md`
- Updater, analytics, Sentry, env vars, CI → `knowledge-base/production-infra.md`

Design work? Skills: `/critique` before, `/polish` after. Else `/clarify` (copy), `/distill` (overloaded screen), `/animate` (micro-interactions), `/audit` (a11y).

---

## Phases (follow IN ORDER)

Print phase name so user knows protocol active.

**STOP-AND-WAIT rule:** When told "wait for approval" / "ask user" — end turn NOW. No anticipating. No next phase.

### PHASE 1 — Load Context (session start only)
Read `knowledge-base/architecture.md` + any KBs relevant to scope. Name what you loaded.

### PHASE 2 — Understand
Read files user references. Identify direction: library-first / app-first / single-layer. Ask clarifying Qs if anything unclear. **STOP if asked.**

### PHASE 3 — Challenge
Push back on request if better approach exists. Check:
- Library or app? Generic → ui/engine. App-specific → app/.
- Which package? Exists already?
- Props generic? No store imports? No app-specific types?
- Does this fit chat-first planning/delegation?

Approach sound → say so. Better path exists → say it clearly, no sugarcoat. **STOP until user agrees.**

### PHASE 4 — Plan
Numbered steps. Mark area per step: `[ui/board]`, `[engine]`, `[app]`. Group into testable chunks. Library before app. **STOP for approval.**

### PHASE 5 — Execute chunk
Print chunk + area. Do all steps. Brief summary. Continue.

### PHASE 6 — Test
Run checks for what touched. Rust → `cargo test`, not just check. Fix failures.

### PHASE 7 — Verify
Full verification. UI touched? Visual fidelity check. Say "Ready for testing — verify + report." **STOP.** Issue? Add logging first (see `/debug`), never blind fix.

### PHASE 8 — Refactor
Library boundary leak? API clean? File > 200 lines (CSS > 500)? Duplication across ui/ + app/? Propose + do after approval.

### PHASE 9 — Cleanup
Unused imports, dead code, debug artifacts. ui/ → no `@/`, no Zustand, no Tauri. app/ → no duplicated logic.

### PHASE 10 — Document
Check + update all affected docs: `knowledge-base/*.md`, skills, showcase. Update now, not propose.

### PHASE 11 — Complete
Summarize. Needs NEW KB entry? New pattern / architecture decision / gotcha / design precedent. Propose if yes.

### PHASE 12 — Commit
Ask: "Ready to commit? (yes/no/skip)" **STOP.** Yes → stage specific files, conventional commit, push `claude/wip`. Never `git add -A`.

---

## Test commands

| Area | TS | Rust | Full build |
|------|----|------|------------|
| ui/ | `pnpm typecheck` | — | — |
| engine/ | — | `cargo test --workspace` | `cargo build --workspace` |
| app/ | `cd app && pnpm tsc --noEmit` | `cd app/src-tauri && cargo check` | `cd app && pnpm tauri build` |

---

## Hard rules (ALWAYS)

### Debugging
**Never guess.** Read logs first. See `/debug`.

### Library boundary (ui/)
- Generic reusable → ui/. App-specific → app/. Unsure → start in app/, extract later.
- **Props over stores, always.** No Zustand/Redux/etc imports in ui/.
- No app/ types in ui/. Use generic types (`BoardItem`, `FeedItem`, `ChatMessage`).
- No `@/` path aliases in ui/. Relative imports within package. Package imports between.

### Engine boundary
- `engine/` = frontend-agnostic. No Tauri. No React. No webview assumption.
- Tauri-specific code → `app/houston-tauri/` (the adapter).

### AI-native reactivity
- Every `.houston/` data surface must react to file changes regardless of who wrote (user via UI, agent via file write, external edit).
- All `.houston/` fetching → TanStack Query + event invalidation. No load-on-mount-only.
- Agent writes emit events. File watcher catches bypass writes. Both architecturally required.
- Never build "agent can do X but UI won't show until refresh."

### Internal code = no backwards compat
- Types, APIs, Rust modules, TS fns: change = change. No "just in case" keeps.
- **User data = different.** Files under `~/Documents/Houston/**` + `~/.houston/**` already on user machines. Shape/layout change → **idempotent migration** on upgrade. See `houston_agent_files::migrate_agent_data`. Never break existing users.

### Tests mandatory
Every feature gets tests. No exceptions. Tests don't count toward 200-line limit.

### Type safety over strings
Domain concepts (status, classification) MUST be enums. TS → discriminated unions. Rust → enums w/ Display/FromStr.

### No silent failures
Errors surface. No swallowed errors. `let _ = x.await` banned for ops that can fail. No `unwrap()` in production Rust.

### No hover-only affordances
Interactive elements visible without hovering. Hover may enhance, never gate.

### File size limits
200 lines/file (excluding tests). CSS 500. **NEVER compress to fit.** Extract modules.

### Search before building
shadcn/ui registry, @houston-ai showcase, existing components, npm — before writing from scratch.

### Be critical, not agreeable
Never "You're absolutely right!" if better approach exists. Say it.

---

## Git

Branch model:
- `main` — releasable, protected, PRs only
- `claude/wip` — working branch, all Claude commits here
- `feature/*` — optional, big isolated features

Before every commit:
1. `git branch --show-current` → must be `claude/wip`. If `main`, `git checkout claude/wip`.
2. Stage specific files. Never `git add -A`.
3. Conventional commit (`feat:` `fix:` `docs:` `chore:` `refactor:` `style:` `test:`).
4. `git push origin claude/wip`.

Merge to main: PR `claude/wip` → `main`, squash. After merge: `git checkout claude/wip && git reset --hard main`.

---

## Secrets
Signing identities, team IDs, API keys, issuer UUIDs: env vars only. Never literals in committed files. Read via `option_env!()` (Rust compile-time) or env vars (CI).

---

## Permission scope
User approved once ≠ approved in all contexts. Unless durable instructions authorize, confirm first for:
- Destructive ops (delete files/branches, drop tables, rm -rf)
- Hard-to-reverse (force-push, git reset --hard, amend published, remove deps)
- Shared-state (push, PR create/comment, Slack/email send)
- Third-party uploads (diagram renderers, pastebins — could be indexed)

Match action scope to what was actually requested.
