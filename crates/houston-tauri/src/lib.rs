//! houston-tauri — Tauri plugin wrapping houston crates for AI agent desktop apps.
//!
//! Provides generic AppState, event types, and a session supervisor
//! for Tauri 2 desktop apps built with the Houston framework.

pub mod agent_sessions;
pub mod channel_manager;
pub mod chat_session;
pub mod composio;
pub mod composio_auth;
pub mod composio_commands;
pub mod events;
pub mod paths;
pub mod self_improvement;
pub mod session_queue;
pub mod session_runner;
pub mod state;
pub mod supervisor;
pub mod tray;
pub mod workspace;
pub mod workspace_commands;
pub mod workspace_store;

// Re-export sub-crates for convenience.
pub use houston_db;
pub use houston_sessions;
pub use houston_events;
pub use houston_scheduler;
pub use houston_channels;
pub use houston_memory;
