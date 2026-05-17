use super::activity_projection;
use super::graph;
use super::parent_summary;
use super::prompts;
use super::store;
use super::types::{ManifestStatus, NodeStatus, OrchestrationManifest};
use crate::conversations;
use crate::sessions::{self, SessionRuntime, StartParams};
use chrono::Utc;
use houston_db::Database;
use houston_terminal_manager::Provider;
use houston_ui_events::DynEventSink;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Clone)]
pub struct SchedulerContext {
    pub sessions: SessionRuntime,
    pub events: DynEventSink,
    pub db: Database,
    pub app_system_prompt: String,
    pub provider: Provider,
    pub model: Option<String>,
}

pub fn spawn(ctx: SchedulerContext, manifest: OrchestrationManifest) {
    tokio::spawn(async move {
        if let Err(err) = run(ctx, manifest).await {
            tracing::error!("[orchestration] scheduler failed: {err}");
        }
    });
}

async fn run(ctx: SchedulerContext, mut manifest: OrchestrationManifest) -> Result<(), String> {
    manifest.status = ManifestStatus::Running;
    manifest.updated_at = Utc::now().to_rfc3339();
    store::write(&manifest).map_err(|err| err.to_string())?;

    loop {
        refresh_running_nodes(&ctx, &mut manifest)?;
        block_failed_dependents(&ctx, &mut manifest)?;
        start_ready_nodes(&ctx, &mut manifest).await?;
        store::write(&manifest).map_err(|err| err.to_string())?;

        if manifest.nodes.iter().all(|node| node.status.is_terminal()) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    manifest.status = if manifest
        .nodes
        .iter()
        .all(|node| node.status == NodeStatus::Done)
    {
        ManifestStatus::Done
    } else {
        ManifestStatus::Error
    };
    manifest.updated_at = Utc::now().to_rfc3339();
    store::write(&manifest).map_err(|err| err.to_string())?;
    parent_summary::spawn(&ctx, &manifest).await
}

async fn start_ready_nodes(
    ctx: &SchedulerContext,
    manifest: &mut OrchestrationManifest,
) -> Result<(), String> {
    let running = manifest
        .nodes
        .iter()
        .filter(|node| node.status == NodeStatus::Running)
        .count();
    let slots = manifest.max_concurrency.saturating_sub(running);
    if slots == 0 {
        return Ok(());
    }
    let ready = graph::ready_node_indexes(&manifest.nodes);
    for index in ready.into_iter().take(slots) {
        let prompt = prompts::node_prompt(manifest, &manifest.nodes[index]);
        let node = &mut manifest.nodes[index];
        node.status = NodeStatus::Running;
        node.error = None;
        node.output = None;
        activity_projection::update_status(
            &ctx.events,
            node.agent_path.as_str(),
            &node.session_key,
            NodeStatus::Running,
        )?;
        let start_result = sessions::start(
            &ctx.sessions,
            ctx.events.clone(),
            ctx.db.clone(),
            &ctx.app_system_prompt,
            StartParams {
                agent_dir: PathBuf::from(&node.agent_path),
                working_dir: PathBuf::from(&node.agent_path),
                session_key: node.session_key.clone(),
                prompt,
                visible_user_message: false,
                system_prompt: None,
                source: Some("orchestration".into()),
                provider: ctx.provider.clone(),
                model: ctx.model.clone(),
                native_delegation_policy: houston_terminal_manager::NativeDelegationPolicy::Block,
                effort: None,
            },
        )
        .await;
        if let Err(err) = start_result {
            node.status = NodeStatus::Error;
            node.error = Some(err.to_string());
            activity_projection::update_status(
                &ctx.events,
                node.agent_path.as_str(),
                &node.session_key,
                NodeStatus::Error,
            )?;
            activity_projection::update_description(
                &ctx.events,
                node.agent_path.as_str(),
                &node.session_key,
                &err.to_string(),
            )?;
        }
    }
    Ok(())
}

fn refresh_running_nodes(
    ctx: &SchedulerContext,
    manifest: &mut OrchestrationManifest,
) -> Result<(), String> {
    for node in manifest
        .nodes
        .iter_mut()
        .filter(|node| node.status == NodeStatus::Running)
    {
        let entries =
            conversations::list(Path::new(&node.agent_path)).map_err(|err| err.to_string())?;
        let Some(entry) = entries
            .into_iter()
            .find(|entry| entry.session_key == node.session_key)
        else {
            continue;
        };
        let status = entry.status.as_deref().unwrap_or("running");
        if status == "running" {
            continue;
        }
        node.output = entry.description;
        node.status = match status {
            "done" => NodeStatus::Done,
            "cancelled" => NodeStatus::Cancelled,
            "blocked" => NodeStatus::Blocked,
            _ => NodeStatus::Error,
        };
        if node.status == NodeStatus::Error {
            node.error = Some(
                node.output
                    .clone()
                    .unwrap_or_else(|| format!("agent finished with status {status}")),
            );
        }
        activity_projection::update_status(
            &ctx.events,
            &node.agent_path,
            &node.session_key,
            node.status,
        )?;
    }
    Ok(())
}

fn block_failed_dependents(
    ctx: &SchedulerContext,
    manifest: &mut OrchestrationManifest,
) -> Result<(), String> {
    for index in graph::blocked_node_indexes(&manifest.nodes) {
        let node = &mut manifest.nodes[index];
        node.status = NodeStatus::Blocked;
        node.error = Some("A dependency did not finish successfully.".into());
        activity_projection::update_status(
            &ctx.events,
            &node.agent_path,
            &node.session_key,
            NodeStatus::Blocked,
        )?;
        activity_projection::update_description(
            &ctx.events,
            &node.agent_path,
            &node.session_key,
            "Waiting stopped because a dependency did not finish successfully.",
        )?;
    }
    Ok(())
}
