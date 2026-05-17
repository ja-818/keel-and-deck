use super::scheduler;
use crate::sessions::SessionRuntime;
use houston_db::Database;
use houston_terminal_manager::Provider;
use houston_ui_events::DynEventSink;

pub fn build(
    sessions: &SessionRuntime,
    events: &DynEventSink,
    db: &Database,
    app_system_prompt: &str,
    provider: Provider,
    model: Option<String>,
) -> scheduler::SchedulerContext {
    scheduler::SchedulerContext {
        sessions: sessions.clone(),
        events: events.clone(),
        db: db.clone(),
        app_system_prompt: app_system_prompt.to_string(),
        provider,
        model,
    }
}
