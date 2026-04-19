//! Shared server state — cheap to clone via `Arc`.

use crate::config::ServerConfig;
use houston_ui_events::BroadcastEventSink;

/// Server state shared across request handlers.
pub struct ServerState {
    pub config: ServerConfig,
    /// Broadcast channel for WebSocket fanout. Every WS client subscribes.
    pub events: BroadcastEventSink,
}

impl ServerState {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            events: BroadcastEventSink::new(1024),
        }
    }
}
