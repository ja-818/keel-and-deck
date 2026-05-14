//! `EngineState` — the runtime container passed to every route handler.

use crate::paths::EnginePaths;
use crate::sessions::SessionRuntime;
use houston_db::Database;
use houston_ui_events::DynEventSink;
use std::sync::Arc;

#[derive(Clone)]
pub struct EngineState {
    pub paths: EnginePaths,
    pub events: DynEventSink,
    pub db: Database,
    /// Per-engine session state (Claude-session-ID tracker, pid map).
    pub sessions: SessionRuntime,
    /// Product-layer prompt prefix supplied by the embedding app (e.g. the
    /// Houston desktop app) via env. Prepended to caller-less sessions.
    /// Empty string if unset.
    pub app_system_prompt: String,
    /// Product-layer onboarding suffix supplied by the embedding app.
    /// Appended on first-run sessions.
    pub app_onboarding_prompt: String,
}

impl EngineState {
    pub fn new(paths: EnginePaths, events: DynEventSink, db: Database) -> Self {
        // Build a SessionRuntime with the persistent PID recorder
        // already wired in so every session::start logs its CLI pid to
        // `~/.houston/runtime/cli_pids.json`. Tests constructing
        // SessionRuntime via `Default` skip this and get a no-op
        // recorder by virtue of the `Option<DynPidRecorder>` being None.
        let sessions = SessionRuntime::with_pid_recorder(
            crate::runtime_pids::recorder(paths.home().to_path_buf()),
        );
        Self {
            paths,
            events,
            db,
            sessions,
            app_system_prompt: String::new(),
            app_onboarding_prompt: String::new(),
        }
    }

    /// Chainable setter for the app's product prompt.
    pub fn with_app_prompts(
        mut self,
        app_system_prompt: String,
        app_onboarding_prompt: String,
    ) -> Self {
        self.app_system_prompt = app_system_prompt;
        self.app_onboarding_prompt = app_onboarding_prompt;
        self
    }
}

pub type SharedEngineState = Arc<EngineState>;
