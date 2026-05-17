use super::activity_projection;
use super::context;
use super::graph;
use super::scheduler;
use super::store;
use super::types::{CreateAndRunResult, CreatedAgent, ManifestStatus, NodeStatus};
use crate::sessions::SessionRuntime;
use chrono::Utc;
use houston_db::Database;
use houston_terminal_manager::Provider;
use houston_ui_events::DynEventSink;
use std::path::Path;

#[allow(clippy::too_many_arguments)]
pub async fn adjust_and_run(
    _docs_root: &Path,
    sessions: &SessionRuntime,
    events: &DynEventSink,
    db: &Database,
    app_system_prompt: &str,
    workspace_id: &str,
    parent_agent_path: &str,
    parent_session_key: &str,
    provider: Provider,
    model: Option<String>,
    adjustment: &str,
    target_node_ids: &[String],
    action_id: Option<&str>,
) -> Result<CreateAndRunResult, String> {
    let mut manifest = store::read(parent_agent_path, parent_session_key)
        .map_err(|err| format!("no active orchestration found for this conversation: {err}"))?;
    if manifest.workspace_id != workspace_id {
        return Err("orchestration workspace mismatch".into());
    }
    let action_id = action_id.map(str::trim).filter(|value| !value.is_empty());
    if let Some(action_id) = action_id {
        if manifest
            .applied_dispatch_action_ids
            .iter()
            .any(|applied| applied == action_id)
        {
            return Ok(CreateAndRunResult {
                agents: manifest.nodes.iter().map(CreatedAgent::from).collect(),
            });
        }
    }
    if manifest
        .nodes
        .iter()
        .any(|node| node.status == NodeStatus::Running)
    {
        return Err("orchestration is already running".into());
    }
    let affected = graph::affected_node_ids(&manifest.nodes, target_node_ids)?;

    manifest.revision += 1;
    manifest.status = ManifestStatus::Waiting;
    manifest.current_adjustment = Some(adjustment.trim().to_string());
    let mut affected_ids: Vec<_> = affected.iter().cloned().collect();
    affected_ids.sort();
    manifest.current_adjustment_targets = Some(affected_ids);
    if let Some(action_id) = action_id {
        manifest
            .applied_dispatch_action_ids
            .push(action_id.to_string());
    }
    manifest.updated_at = Utc::now().to_rfc3339();
    for node in &mut manifest.nodes {
        if !affected.contains(&node.id) {
            continue;
        }
        node.status = NodeStatus::Waiting;
        node.output = None;
        node.error = None;
        activity_projection::update_status(
            events,
            &node.agent_path,
            &node.session_key,
            NodeStatus::Waiting,
        )?;
        activity_projection::update_description(
            events,
            &node.agent_path,
            &node.session_key,
            "Waiting for dependencies.",
        )?;
    }

    store::write(&manifest).map_err(|err| err.to_string())?;
    scheduler::spawn(
        context::build(sessions, events, db, app_system_prompt, provider, model),
        manifest.clone(),
    );
    Ok(CreateAndRunResult {
        agents: manifest.nodes.iter().map(CreatedAgent::from).collect(),
    })
}
