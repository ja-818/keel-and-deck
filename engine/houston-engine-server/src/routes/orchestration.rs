//! `/v1/orchestration/*` — engine-driven multi-agent orchestration.

use crate::app_prompts::selected_app_system_prompt;
use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{extract::State, routing::post, Json, Router};
use houston_engine_core::sessions::{resolve_agent_dir, resolve_provider};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/orchestration/create-and-run", post(create_and_run))
        .route("/orchestration/adjust-and-run", post(adjust_and_run))
        .route("/orchestration/status", post(status))
        .route("/orchestration/save-agents", post(save_agents))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAndRunBody {
    workspace_id: String,
    parent_agent_path: String,
    parent_session_key: String,
    agents: Vec<CreateAndRunAgentBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAndRunAgentBody {
    #[serde(default)]
    id: Option<String>,
    name: String,
    #[serde(default)]
    role_prompt: Option<String>,
    #[serde(default)]
    task_prompt: Option<String>,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    depends_on: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAgentsBody {
    workspace_id: String,
    #[serde(default)]
    parent_agent_path: Option<String>,
    #[serde(default)]
    parent_session_key: Option<String>,
    agent_paths: Vec<String>,
    #[serde(default)]
    action_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdjustAndRunBody {
    workspace_id: String,
    parent_agent_path: String,
    parent_session_key: String,
    adjustment: String,
    #[serde(default)]
    target_node_ids: Vec<String>,
    #[serde(default)]
    action_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusBody {
    parent_agent_path: String,
    parent_session_key: String,
}

async fn create_and_run(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<CreateAndRunBody>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if body.agents.is_empty() {
        return Err(ApiError(houston_engine_core::CoreError::BadRequest(
            "at least one specialized agent is required".into(),
        )));
    }

    let agents: Vec<_> = body
        .agents
        .into_iter()
        .map(|a| {
            let legacy_prompt = a.prompt.unwrap_or_default();
            let role_prompt = a
                .role_prompt
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    format!(
                        "You are a reusable specialized agent named {}. Understand the user's mission, ask one targeted question if essential context is missing, and deliver complete work in plain language.",
                        a.name
                    )
                });
            let task_prompt = a
                .task_prompt
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(legacy_prompt);
            houston_engine_core::orchestration::AgentIntent {
                id: a.id,
                name: a.name,
                role_prompt,
                task_prompt,
                depends_on: a.depends_on,
            }
        })
        .collect();

    let app_prompt = selected_app_system_prompt(&state.engine).await;
    let parent_agent_dir = resolve_agent_dir(&state.engine.paths, &body.parent_agent_path);
    let resolved = resolve_provider(&state.engine.paths, &parent_agent_dir);
    let provider = resolved.provider;
    let model = resolved.model;

    let result = houston_engine_core::orchestration::create_and_run(
        state.engine.paths.docs(),
        &state.engine.sessions,
        &state.engine.events,
        &state.engine.db,
        &app_prompt,
        &body.workspace_id,
        &body.parent_agent_path,
        &body.parent_session_key,
        provider,
        model,
        &agents,
    )
    .await
    .map_err(|e| ApiError(houston_engine_core::CoreError::Internal(e)))?;

    Ok(Json(serde_json::to_value(result).unwrap_or_default()))
}

async fn adjust_and_run(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<AdjustAndRunBody>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if body.adjustment.trim().is_empty() {
        return Err(ApiError(houston_engine_core::CoreError::BadRequest(
            "adjustment is required".into(),
        )));
    }

    let app_prompt = selected_app_system_prompt(&state.engine).await;
    let parent_agent_dir = resolve_agent_dir(&state.engine.paths, &body.parent_agent_path);
    let resolved = resolve_provider(&state.engine.paths, &parent_agent_dir);
    let result = houston_engine_core::orchestration::adjust_and_run(
        state.engine.paths.docs(),
        &state.engine.sessions,
        &state.engine.events,
        &state.engine.db,
        &app_prompt,
        &body.workspace_id,
        &body.parent_agent_path,
        &body.parent_session_key,
        resolved.provider,
        resolved.model,
        &body.adjustment,
        &body.target_node_ids,
        body.action_id.as_deref(),
    )
    .await
    .map_err(|e| ApiError(houston_engine_core::CoreError::Internal(e)))?;

    Ok(Json(serde_json::to_value(result).unwrap_or_default()))
}

async fn save_agents(
    State(state): State<Arc<ServerState>>,
    Json(body): Json<SaveAgentsBody>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if body.agent_paths.is_empty() {
        return Err(ApiError(houston_engine_core::CoreError::BadRequest(
            "at least one agent path is required".into(),
        )));
    }
    let agent_paths: Vec<PathBuf> = body.agent_paths.into_iter().map(PathBuf::from).collect();
    let agents = if let (Some(parent_agent_path), Some(parent_session_key)) = (
        body.parent_agent_path.as_deref(),
        body.parent_session_key.as_deref(),
    ) {
        houston_engine_core::orchestration::save_agents(
            state.engine.paths.docs(),
            &body.workspace_id,
            parent_agent_path,
            parent_session_key,
            &agent_paths,
            body.action_id.as_deref(),
        )?
    } else {
        houston_engine_core::agents_crud::save_temporary(
            state.engine.paths.docs(),
            &body.workspace_id,
            &agent_paths,
        )?
    };
    Ok(Json(serde_json::json!({ "agents": agents })))
}

async fn status(
    State(_state): State<Arc<ServerState>>,
    Json(body): Json<StatusBody>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let manifest = houston_engine_core::orchestration::status(
        &body.parent_agent_path,
        &body.parent_session_key,
    )?;
    Ok(Json(serde_json::to_value(manifest).unwrap_or_default()))
}
