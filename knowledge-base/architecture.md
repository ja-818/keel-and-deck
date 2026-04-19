# Architecture

Houston = open platform. Organized as **6 products + 3 code libraries**.

## The 6 products (end-user)

| Product | Dir | What |
|---------|-----|------|
| Houston App | `app/` | Desktop app (Tauri 2). Non-technical users create agents, run parallel terminal sessions. |
| Houston Mobile | `mobile/` | Mobile companion. Mirrors desktop. |
| Houston Store | `store/` | Registry of pre-built agents. One-click install. |
| Houston Website | `website/` | gethouston.ai landing. |
| Houston Always On | `always-on/` | One-click deploy Engine to VPS/microVM. Agents 24/7. **TBD.** |
| Houston Teams | `teams/` | Hosted multi-tenant agent pool w/ perms. **TBD.** |

## The 3 code libraries

| Library | Dir | What | Consumers |
|---------|-----|------|-----------|
| Houston UI | `ui/` | `@houston-ai/*` React components | App, Mobile, future hosted products' frontends |
| Houston Engine | `engine/` | Rust crates. **Frontend-agnostic backend.** Open source. Anyone self-hosts or uses as desktop-app backend. | App (via `app/houston-tauri` adapter), Always On, Teams, Cloud customers |
| Houston Cloud | `cloud/` | Managed Engine deployments. **TBD.** | Third-party devs building on Engine |

## Key distinction: Engine is standalone

**Houston Engine is the reusable backend.** Devs run it themselves (open source) or rent it via Cloud. Devs put ANY frontend on top — Houston App is just ONE consumer.

- Engine stays pure Rust, no Tauri, no React, no webview assumption
- `app/houston-tauri/` is the **adapter** that applies Engine to the Tauri desktop frontend. Lives under `app/`, not `engine/`.
- Future Always On + Teams consume Engine over network (HTTP/WS — **not yet built**)

## Infra dirs (not products)

| Dir | What |
|-----|------|
| `desktop-mobile-bridge/` | Cloudflare Worker + Durable Object. Rendezvous server for Desktop↔Mobile (NAT traversal). Deploys separately. Only App-family infra. |
| `knowledge-base/` | These caveman docs. Loaded on demand. |
| `scripts/` | Version bump, release, CLI binary fetch. |

## Engine crates (`engine/`)

All pure libraries. No frontend assumptions.

- `houston-db` — libSQL. Only `chat_feed` + `preferences` tables.
- `houston-terminal-manager` — Claude/Codex subprocess manager, parser, streaming
- `houston-events` — hook/webhook/lifecycle queue
- `houston-channels` — Telegram/Slack adapters
- `houston-scheduler` — cron + heartbeat
- `houston-agent-files` — `.houston/` file I/O, schemas, migration
- `houston-agents-conversations` — chat feed persistence
- `houston-ui-events` — typed event bus (frontend-neutral — Tauri adapter wires it)
- `houston-file-watcher` — `notify` on `.houston/`, emits events
- `houston-composio` — Composio MCP server lifecycle
- `houston-sync` — WebSocket sync envelope
- `houston-skills` — skill discovery + management

**Missing for Engine standalone:** HTTP/WS server binary. Today Engine is Rust-dep-only. Always On + Teams can't ship until this exists.

## App-side Rust (`app/`)

- `app/houston-tauri/` — Tauri adapter. Binds engine crates to Tauri state/events/commands. **Not part of Engine.**
- `app/src-tauri/` — Tauri binary. Depends on `houston-tauri` + engine crates.

## UI packages (`ui/`)

`@houston-ai/` + `core, chat, board, layout, connections, events, memory, routines, skills, review, agent, agent-schemas, sync-protocol`

Internal. External devs don't `npm install` these — they write `houston.json` + `CLAUDE.md` + optional `bundle.js`.

## Current gap to vision

| Goal | Status |
|------|--------|
| Clear product dirs | ✅ done |
| App ↔ Engine clear boundary | ✅ `app/houston-tauri` split |
| UI standalone | ✅ |
| Engine reusable by non-Tauri frontends | ❌ no server binary |
| Always On / Teams / Cloud | ❌ TBD placeholders |
| Store populated | ❌ placeholder |

## Direction of work
- **library-first** — new reusable capability → ui/ or engine/, then consumed by app/
- **app-first** — feature needed in app/, extract to library when reuse appears
- **single-layer** — only one area touched

Not sure? Start in app/. Extract later.
