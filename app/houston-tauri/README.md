# houston-tauri — Tauri adapter for Houston Engine

This crate is the **adapter** that binds `houston-engine-*` crates to the
Houston desktop app (Tauri 2). It is not part of the engine — the engine
stays frontend-agnostic.

Responsibilities over time are shrinking as the engine moves behind a
subprocess + HTTP wire:

- **Today:** Tauri command handlers that proxy engine calls, managed
  state (`AppState`, `WatcherState`, scheduler), `TauriEventSink` impl of
  the engine's `EventSink` trait, and thin wrappers around
  `houston-file-watcher` + `houston-composio`.
- **Phase 4 end state:** subprocess supervisor for `houston-engine`,
  window/tray, OS-native commands (`reveal_file`, `open_url`,
  `pick_directory`, `open_in_editor`). Everything else lives behind the
  wire.

## Modules

| Module | Purpose |
|---|---|
| `state` | `AppState` (DB + event queue + scheduler) |
| `event_sink` | `TauriEventSink` — `EventSink` impl that fans events to the webview |
| `watcher_commands` | Tauri decorators around `houston-file-watcher` |
| `composio_commands` | Tauri decorators around `houston-composio` |
| `agent`, `agent_commands`, `agent_store`, `agent_files`, `conversations`, `self_improvement`, `paths`, `tray` | Domain logic the engine has not yet absorbed. Migrates to `houston-engine-core` during Phase 2. |

## Usage sketch

```rust
use houston_tauri::{state::AppState, tauri_sink};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db = tauri::async_runtime::block_on(open_db())?;
            app.manage(AppState { db, event_queue: None, scheduler: None });
            app.manage(houston_file_watcher::WatcherState::default());
            // tauri_sink(&app.handle()) produces a DynEventSink for engine code.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // OS-native commands stay here long-term.
            houston_tauri::agent_commands::reveal_file,
            // Engine-adjacent wrappers live here until Phase 4 deletes them.
            houston_tauri::composio_commands::list_composio_connections,
            houston_tauri::watcher_commands::start_agent_watcher,
        ])
        .run(tauri::generate_context!())
        .expect("run failed");
}
```

## See also

- `engine/houston-engine-server` — the binary this adapter spawns.
- `knowledge-base/engine-protocol.md` — wire contract.
- `knowledge-base/engine-server.md` — operator guide.
