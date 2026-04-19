//! Shared server state — cheap to clone via `Arc`.

use crate::config::ServerConfig;
use houston_engine_core::{paths::EnginePaths, EngineState};
use houston_ui_events::BroadcastEventSink;
use std::sync::Arc;

/// Server state shared across request handlers.
pub struct ServerState {
    pub config: ServerConfig,
    /// Broadcast channel for WebSocket fanout. Every WS client subscribes.
    pub events: BroadcastEventSink,
    /// Engine runtime container (DB, paths, sinks).
    pub engine: EngineState,
}

impl ServerState {
    pub fn new(config: ServerConfig) -> Self {
        let events = BroadcastEventSink::new(1024);
        let paths = EnginePaths::new(config.docs_dir.clone(), config.home_dir.clone());
        let engine = EngineState::new(paths, Arc::new(events.clone()));
        Self { config, events, engine }
    }
}
