//! Cron-driven scheduler that fires enabled routines for a single agent.
//!
//! Relocated from `app/src-tauri/src/routine_runner.rs`. Transport-neutral:
//! the session-dispatch step goes through [`RoutineDispatcher`]; the
//! activity-creation step through [`ActivitySurface`] (see `runner.rs`).

use crate::routines::{
    self,
    runner::{run_routine, ActivitySurface, RoutineDispatcher},
    types::Routine,
};
use chrono::Utc;
use cron::Schedule;
use houston_ui_events::DynEventSink;
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

/// Managed state for the scheduler — wire into DI containers (Tauri state,
/// axum extractor) so routes/commands can sync + shutdown.
#[derive(Default)]
pub struct RoutineSchedulerState(pub Arc<Mutex<Option<RoutineScheduler>>>);

/// Cron jobs for one agent folder.
pub struct RoutineScheduler {
    agent_path: String,
    jobs: HashMap<String, tokio::task::JoinHandle<()>>,
    shutdown_tx: watch::Sender<bool>,
    events: DynEventSink,
    dispatcher: Arc<dyn RoutineDispatcher>,
    surface: Arc<dyn ActivitySurface>,
}

impl RoutineScheduler {
    pub fn new(
        agent_path: &str,
        events: DynEventSink,
        dispatcher: Arc<dyn RoutineDispatcher>,
        surface: Arc<dyn ActivitySurface>,
    ) -> Self {
        let (shutdown_tx, _) = watch::channel(false);
        Self {
            agent_path: agent_path.to_string(),
            jobs: HashMap::new(),
            shutdown_tx,
            events,
            dispatcher,
            surface,
        }
    }

    pub fn agent_path(&self) -> &str {
        &self.agent_path
    }

    /// Read routines from disk and reconcile cron tasks: spawn for newly
    /// enabled ones, abort for removed or disabled ones.
    pub fn sync(&mut self) {
        let dir = crate::routines::runner::expand_tilde(&PathBuf::from(&self.agent_path));
        let routines = routines::list(&dir).unwrap_or_default();

        let active_ids: HashMap<String, String> = routines
            .iter()
            .filter(|r| r.enabled)
            .map(|r| (r.id.clone(), r.schedule.clone()))
            .collect();

        let to_remove: Vec<String> = self
            .jobs
            .keys()
            .filter(|id| !active_ids.contains_key(*id))
            .cloned()
            .collect();
        for id in to_remove {
            if let Some(handle) = self.jobs.remove(&id) {
                handle.abort();
                tracing::info!("[routines] Stopped cron for routine {id}");
            }
        }

        for routine in &routines {
            if !routine.enabled || self.jobs.contains_key(&routine.id) {
                continue;
            }
            match self.spawn_cron(routine) {
                Ok(handle) => {
                    tracing::info!(
                        "[routines] Started cron for '{}' ({})",
                        routine.name,
                        routine.schedule
                    );
                    self.jobs.insert(routine.id.clone(), handle);
                }
                Err(e) => tracing::error!(
                    "[routines] Failed to start cron for '{}': {e}",
                    routine.name
                ),
            }
        }
    }

    fn spawn_cron(&self, routine: &Routine) -> Result<tokio::task::JoinHandle<()>, String> {
        // 5-field cron → 7-field (seconds + year).
        let cron_7 = format!("0 {} *", routine.schedule);
        let schedule = Schedule::from_str(&cron_7)
            .map_err(|e| format!("invalid cron '{}': {e}", routine.schedule))?;

        let agent_path = self.agent_path.clone();
        let routine_id = routine.id.clone();
        let events = self.events.clone();
        let dispatcher = self.dispatcher.clone();
        let surface = self.surface.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();

        Ok(tokio::spawn(async move {
            loop {
                let next = match schedule.upcoming(Utc).next() {
                    Some(t) => t,
                    None => return,
                };

                let delay = next.signed_duration_since(Utc::now());
                let sleep_dur = if delay.num_milliseconds() > 0 {
                    std::time::Duration::from_millis(delay.num_milliseconds() as u64)
                } else {
                    std::time::Duration::from_millis(0)
                };

                tokio::select! {
                    _ = tokio::time::sleep(sleep_dur) => {}
                    _ = shutdown_rx.changed() => {
                        if *shutdown_rx.borrow() {
                            return;
                        }
                    }
                }

                tracing::info!(
                    "[routines] Cron fired for routine {routine_id} at {}",
                    Utc::now().to_rfc3339()
                );

                if let Err(e) = run_routine(
                    events.clone(),
                    dispatcher.clone(),
                    surface.clone(),
                    &agent_path,
                    &routine_id,
                )
                .await
                {
                    tracing::error!(
                        "[routines] Error running routine {routine_id}: {e}"
                    );
                }
            }
        }))
    }

    pub fn shutdown(&mut self) {
        let _ = self.shutdown_tx.send(true);
        for (id, handle) in self.jobs.drain() {
            handle.abort();
            tracing::info!("[routines] Stopped cron for routine {id}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::routines::create;
    use crate::routines::runner::{DispatchContext, DispatchOutcome};
    use crate::routines::types::NewRoutine;
    use async_trait::async_trait;
    use houston_ui_events::NoopEventSink;
    use std::path::Path;
    use tempfile::TempDir;

    struct NoopDispatch;
    #[async_trait]
    impl RoutineDispatcher for NoopDispatch {
        async fn dispatch(&self, _ctx: DispatchContext<'_>) -> DispatchOutcome {
            DispatchOutcome::default()
        }
    }
    struct NoopSurface;
    impl ActivitySurface for NoopSurface {
        fn surface(
            &self,
            _wd: &Path,
            _t: &str,
            _d: &str,
            _s: &str,
            _r: &str,
            _rr: &str,
        ) -> Result<String, String> {
            Ok("x".into())
        }
    }

    #[tokio::test]
    async fn sync_tracks_enabled_routines_only() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        // Two enabled, one disabled.
        let mk = |name: &str, enabled: bool| NewRoutine {
            name: name.into(),
            description: "".into(),
            prompt: "p".into(),
            schedule: "0 9 * * *".into(),
            enabled,
            suppress_when_silent: true,
        };
        create(d.path(), mk("A", true)).unwrap();
        create(d.path(), mk("B", true)).unwrap();
        create(d.path(), mk("C", false)).unwrap();

        let mut sched = RoutineScheduler::new(
            &agent,
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 2);
        sched.shutdown();
        assert_eq!(sched.jobs.len(), 0);
    }

    #[tokio::test]
    async fn sync_rejects_invalid_cron_gracefully() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(
            d.path(),
            NewRoutine {
                name: "bad".into(),
                description: "".into(),
                prompt: "p".into(),
                schedule: "not a cron".into(),
                enabled: true,
                suppress_when_silent: true,
            },
        )
        .unwrap();

        let mut sched = RoutineScheduler::new(
            &agent,
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        // Invalid cron expression → no job spawned, but sync doesn't panic.
        assert_eq!(sched.jobs.len(), 0);
    }
}
