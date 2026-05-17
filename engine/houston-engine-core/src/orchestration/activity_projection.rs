use super::types::NodeStatus;
use crate::agents::activity;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::path::Path;

pub fn update_status(
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
    status: NodeStatus,
) -> Result<(), String> {
    activity::set_status_by_session_key(
        Path::new(agent_path),
        session_key,
        status.as_activity_status(),
    )
    .map_err(|err| err.to_string())?;
    emit_changed(events, agent_path);
    Ok(())
}

pub fn update_description(
    events: &DynEventSink,
    agent_path: &str,
    session_key: &str,
    description: &str,
) -> Result<(), String> {
    activity::set_description_by_session_key(Path::new(agent_path), session_key, description)
        .map_err(|err| err.to_string())?;
    emit_changed(events, agent_path);
    Ok(())
}

pub fn emit_changed(events: &DynEventSink, agent_path: &str) {
    events.emit(HoustonEvent::ActivityChanged {
        agent_path: agent_path.to_string(),
    });
}
