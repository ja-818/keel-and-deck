use super::activity_projection;
use super::context;
use super::graph;
use super::prompts;
use super::role_profile;
use super::scheduler;
use super::store;
use super::types::{
    AgentIntent, CreateAndRunResult, CreatedAgent, ManifestStatus, NodeStatus,
    OrchestrationManifest, OrchestrationNode,
};
use crate::agents::activity;
use crate::agents::types::NewActivity;
use crate::agents_crud::{self, CreateAgent};
use crate::sessions::SessionRuntime;
use chrono::Utc;
use houston_db::Database;
use houston_terminal_manager::Provider;
use houston_ui_events::DynEventSink;
use std::path::Path;
use uuid::Uuid;

const MAX_CONCURRENCY: usize = 8;

#[allow(clippy::too_many_arguments)]
pub async fn create_and_run(
    docs_root: &Path,
    sessions: &SessionRuntime,
    events: &DynEventSink,
    db: &Database,
    app_system_prompt: &str,
    workspace_id: &str,
    parent_agent_path: &str,
    parent_session_key: &str,
    provider: Provider,
    model: Option<String>,
    agents_to_create: &[AgentIntent],
) -> Result<CreateAndRunResult, String> {
    let intents = graph::normalize_intents(agents_to_create)?;
    let now = Utc::now().to_rfc3339();
    let mut nodes = Vec::with_capacity(intents.len());

    for intent in &intents {
        nodes.push(create_node(
            docs_root,
            workspace_id,
            parent_agent_path,
            parent_session_key,
            events,
            provider,
            model.clone(),
            intent,
        )?);
    }

    let manifest = OrchestrationManifest {
        id: Uuid::new_v4().to_string(),
        parent_agent_path: parent_agent_path.to_string(),
        parent_session_key: parent_session_key.to_string(),
        workspace_id: workspace_id.to_string(),
        revision: 1,
        status: ManifestStatus::Waiting,
        max_concurrency: MAX_CONCURRENCY,
        current_adjustment: None,
        current_adjustment_targets: None,
        applied_dispatch_action_ids: Vec::new(),
        applied_save_action_ids: Vec::new(),
        nodes,
        created_at: now.clone(),
        updated_at: now,
    };
    store::write(&manifest).map_err(|err| err.to_string())?;
    scheduler::spawn(
        context::build(sessions, events, db, app_system_prompt, provider, model),
        manifest.clone(),
    );
    Ok(CreateAndRunResult {
        agents: manifest.nodes.iter().map(CreatedAgent::from).collect(),
    })
}

#[allow(clippy::too_many_arguments)]
fn create_node(
    docs_root: &Path,
    workspace_id: &str,
    parent_agent_path: &str,
    parent_session_key: &str,
    events: &DynEventSink,
    provider: Provider,
    model: Option<String>,
    intent: &AgentIntent,
) -> Result<OrchestrationNode, String> {
    let saved_role_profile = role_profile::saved_role_profile(intent);
    let created = agents_crud::create(
        docs_root,
        workspace_id,
        CreateAgent {
            name: intent.name.clone(),
            config_id: "generated-custom".into(),
            color: None,
            claude_md: Some(saved_role_profile.clone()),
            installed_path: None,
            seeds: None,
            existing_path: None,
            temporary: true,
            origin: Some(agents_crud::generated_agent_origin(
                intent.id.as_deref().unwrap_or(&intent.name),
                &intent.name,
                &saved_role_profile,
                parent_agent_path,
                parent_session_key,
            )),
        },
    )
    .map_err(|err| err.to_string())?;
    let activity = activity::create(
        Path::new(&created.agent.folder_path),
        NewActivity {
            title: intent.name.clone(),
            description: prompts::describe_intent_for_activity(intent),
            agent: Some(intent.name.clone()),
            worktree_path: None,
            provider: Some(provider.to_string()),
            model,
            orchestration_parent_agent_path: Some(parent_agent_path.to_string()),
            orchestration_parent_session_key: Some(parent_session_key.to_string()),
        },
    )
    .map_err(|err| err.to_string())?;
    let session_key = activity
        .session_key
        .clone()
        .unwrap_or_else(|| format!("activity-{}", activity.id));
    activity_projection::update_status(
        events,
        &created.agent.folder_path,
        &session_key,
        NodeStatus::Waiting,
    )?;
    Ok(OrchestrationNode {
        id: intent.id.clone().unwrap_or_default(),
        name: intent.name.clone(),
        prompt: None,
        role_prompt: saved_role_profile,
        task_prompt: intent.task_prompt.clone(),
        depends_on: intent.depends_on.clone(),
        agent_path: created.agent.folder_path,
        session_key,
        status: NodeStatus::Waiting,
        output: None,
        error: None,
    })
}
