# Houston Always On

One-click deploy Houston Engine to a VPS (microVM probably) so agents run 24/7.

## What it is
User clicks "Deploy Always On". Houston provisions a microVM, installs Engine as a server, connects user's desktop/mobile to it. Agents keep running when laptop is closed.

## Status
**TBD — placeholder.** Directory exists to reserve the name. No code yet.

## Relation to other products
- Built on **Houston Engine** (Engine exposes HTTP/WS server so remote frontends can reach it)
- Houston App + Mobile connect to Always On instance instead of local Engine
- Independent from **Teams** — Always On is single-user; Teams is multi-tenant

## Unknowns to solve
- microVM provider (Fly.io Machines? Cloudflare Containers? Firecracker on bare-metal?)
- Remote access pattern — does Desktop App connect to Always On via `desktop-mobile-bridge/`, or direct HTTPS?
- Billing model
- Engine must expose network-reachable API (not just Rust crate dep) — prerequisite work
