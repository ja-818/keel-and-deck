# Changelog

All notable changes to Houston will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-05

### Added
- Houston unified app with experience system
- Experience manifests (JSON-only and custom React tiers)
- Workspace management (create, rename, delete)
- 10 built-in tab components (chat, board, skills, files, connections, context, routines, channels, events, learnings)
- 11 React packages (@houston-ai/core, chat, board, layout, workspace, skills, connections, events, routines, review, memory)
- 8 Rust crates (houston-sessions, houston-db, houston-tauri, houston-channels, houston-events, houston-scheduler, houston-memory, houston-skills)
- create-houston-experience CLI
- Component showcase app

### Changed
- Rebranded from Keel & Deck to Houston
- Workspace convention: .keel/ → .houston/
- Events: KeelEvent → HoustonEvent

[0.1.0]: https://github.com/ja-818/houston/releases/tag/v0.1.0
