//! Shim over `houston_engine_core::agents`.
//!
//! Phase 2 migration relocated typed CRUD into the engine. This module keeps
//! the `crate::agent_store::*` import path stable for in-process callers while
//! adapting the engine's `CoreResult<T>` return type to the legacy
//! `Result<T, String>` contract that Tauri commands rely on.
//!
//! Cross-agent conversation listing is owned by `houston_engine_core::conversations`
//! (REST at `/v1/conversations/*`) and is NOT re-exposed through this shim.

use houston_engine_core::agents as core;
use std::path::Path;

pub use core::types;
pub use core::types::*;

/// File-backed store for `.houston/` agent data.
pub struct AgentStore {
    inner: core::AgentStore,
}

impl AgentStore {
    pub fn new(project_folder: &Path) -> Self {
        Self {
            inner: core::AgentStore::new(project_folder),
        }
    }

    pub fn ensure_houston_dir(&self) -> Result<(), String> {
        self.inner.ensure_houston_dir().map_err(|e| e.to_string())
    }

    // -- Activity --
    pub fn list_activity(&self) -> Result<Vec<Activity>, String> {
        self.inner.list_activity().map_err(|e| e.to_string())
    }
    pub fn create_activity(
        &self,
        title: &str,
        description: &str,
        agent: Option<&str>,
        worktree_path: Option<&str>,
    ) -> Result<Activity, String> {
        self.inner
            .create_activity(NewActivity {
                title: title.to_string(),
                description: description.to_string(),
                agent: agent.map(str::to_string),
                worktree_path: worktree_path.map(str::to_string),
            })
            .map_err(|e| e.to_string())
    }
    pub fn update_activity(&self, id: &str, updates: ActivityUpdate) -> Result<Activity, String> {
        self.inner
            .update_activity(id, updates)
            .map_err(|e| e.to_string())
    }
    pub fn delete_activity(&self, id: &str) -> Result<(), String> {
        self.inner.delete_activity(id).map_err(|e| e.to_string())
    }

    // -- Routines --
    pub fn list_routines(&self) -> Result<Vec<Routine>, String> {
        self.inner.list_routines().map_err(|e| e.to_string())
    }
    pub fn create_routine(&self, input: NewRoutine) -> Result<Routine, String> {
        self.inner.create_routine(input).map_err(|e| e.to_string())
    }
    pub fn update_routine(&self, id: &str, updates: RoutineUpdate) -> Result<Routine, String> {
        self.inner
            .update_routine(id, updates)
            .map_err(|e| e.to_string())
    }
    pub fn delete_routine(&self, id: &str) -> Result<(), String> {
        self.inner.delete_routine(id).map_err(|e| e.to_string())
    }

    // -- Routine Runs --
    pub fn list_routine_runs(&self) -> Result<Vec<RoutineRun>, String> {
        self.inner.list_routine_runs().map_err(|e| e.to_string())
    }
    pub fn list_routine_runs_for(&self, routine_id: &str) -> Result<Vec<RoutineRun>, String> {
        self.inner
            .list_routine_runs_for(routine_id)
            .map_err(|e| e.to_string())
    }
    pub fn create_routine_run(&self, routine_id: &str) -> Result<RoutineRun, String> {
        self.inner
            .create_routine_run(routine_id)
            .map_err(|e| e.to_string())
    }
    pub fn update_routine_run(
        &self,
        id: &str,
        updates: RoutineRunUpdate,
    ) -> Result<RoutineRun, String> {
        self.inner
            .update_routine_run(id, updates)
            .map_err(|e| e.to_string())
    }

    // -- Config --
    pub fn read_config(&self) -> Result<ProjectConfig, String> {
        self.inner.read_config().map_err(|e| e.to_string())
    }
    pub fn write_config(&self, cfg: &ProjectConfig) -> Result<(), String> {
        self.inner.write_config(cfg).map_err(|e| e.to_string())
    }
}
