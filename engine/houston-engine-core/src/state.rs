//! `EngineState` — the runtime container passed to every route handler.

use crate::paths::EnginePaths;
use houston_ui_events::DynEventSink;
use std::sync::Arc;

#[derive(Clone)]
pub struct EngineState {
    pub paths: EnginePaths,
    pub events: DynEventSink,
}

impl EngineState {
    pub fn new(paths: EnginePaths, events: DynEventSink) -> Self {
        Self { paths, events }
    }
}

pub type SharedEngineState = Arc<EngineState>;
