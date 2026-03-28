//! keel-tauri — Tauri plugin wrapping keel-sessions and keel-db.
//!
//! Provides generic AppState, event types, and a session supervisor
//! for Tauri 2 desktop apps built with the Keel framework.

pub mod events;
pub mod state;
pub mod supervisor;

// Re-export sub-crates for convenience.
pub use keel_db;
pub use keel_sessions;
