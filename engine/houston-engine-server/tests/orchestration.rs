//! Integration tests for `/v1/orchestration/*`.

use houston_engine_core::agents_crud::{self, CreateAgent};
use houston_engine_core::workspaces::{self, CreateWorkspace};
use houston_engine_server::{build_router, ServerConfig, ServerState};
use std::net::SocketAddr;
use std::sync::Arc;
use tempfile::TempDir;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, TempDir, String, String) {
    let token = "orchestration-test".to_string();
    let home = TempDir::new().unwrap();
    let docs = TempDir::new().unwrap();
    let workspace = workspaces::create(
        docs.path(),
        CreateWorkspace {
            name: "alpha".into(),
            provider: None,
            model: None,
        },
    )
    .unwrap();
    let parent = agents_crud::create(
        docs.path(),
        &workspace.id,
        CreateAgent {
            name: "Parent".into(),
            config_id: "personal-assistant".into(),
            color: None,
            claude_md: None,
            installed_path: None,
            seeds: None,
            existing_path: None,
            temporary: false,
            origin: None,
        },
    )
    .unwrap();

    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: "professional".into(),
        app_beginner_system_prompt: "beginner".into(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let app = build_router(state);
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (addr, token, docs, workspace.id, parent.agent.folder_path)
}

#[tokio::test]
async fn create_and_run_creates_specialized_agents_via_http() {
    let (addr, tok, docs, workspace_id, parent_agent_path) = spawn().await;
    let client = reqwest::Client::new();

    let body: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/create-and-run"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspaceId": workspace_id,
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent",
            "agents": [
                {
                    "id": "research",
                    "name": "Research",
                    "rolePrompt": "You are a reusable research analyst.",
                    "taskPrompt": "Find hair trends",
                    "dependsOn": []
                },
                {
                    "id": "writer",
                    "name": "Writer",
                    "rolePrompt": "You are a reusable social post writer.",
                    "taskPrompt": "Draft captions",
                    "dependsOn": ["research"]
                }
            ]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let created = body["agents"].as_array().unwrap();
    assert_eq!(created.len(), 2, "unexpected response body: {body}");
    assert_eq!(created[0]["name"], "Research");
    assert_eq!(created[1]["name"], "Writer");
    assert_eq!(created[0]["nodeId"], "research");
    assert_eq!(created[1]["nodeId"], "writer");
    assert_eq!(created[1]["dependsOn"].as_array().unwrap()[0], "research");
    assert!(created[0]["agentPath"]
        .as_str()
        .unwrap()
        .contains("/Research"));
    let first_session_key = created[0]["sessionKey"].as_str().unwrap();
    let second_session_key = created[1]["sessionKey"].as_str().unwrap();
    assert!(first_session_key.starts_with("activity-"));
    assert!(second_session_key.starts_with("activity-"));
    assert_ne!(first_session_key, second_session_key);

    let status_body: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/status"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(status_body["workspaceId"], workspace_id);
    assert_eq!(status_body["nodes"].as_array().unwrap().len(), 2);

    let agents = agents_crud::list(docs.path(), &workspace_id).unwrap();
    let names: Vec<_> = agents.iter().map(|agent| agent.name.as_str()).collect();
    assert!(names.iter().any(|name| *name == "Parent"));
    let research = agents
        .iter()
        .find(|agent| agent.name == "Research")
        .unwrap();
    let writer = agents.iter().find(|agent| agent.name == "Writer").unwrap();
    assert!(research.temporary);
    assert!(writer.temporary);
    let research_prompt =
        std::fs::read_to_string(std::path::Path::new(&research.folder_path).join("CLAUDE.md"))
            .unwrap();
    assert!(research_prompt.contains("reusable research analyst"));
    assert!(research_prompt.contains("Mission handling"));
    assert!(!research_prompt.contains("hair trends"));
    assert!(!research_prompt.contains("Find hair trends"));

    let save_body: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/save-agents"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspaceId": workspace_id,
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent",
            "actionId": "save-test-action",
            "agentPaths": [research.folder_path.clone(), writer.folder_path.clone()]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(save_body["agents"].as_array().unwrap().len(), 2);
    let status_after_save: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/status"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent"
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        status_after_save["appliedSaveActionIds"]
            .as_array()
            .unwrap()[0],
        "save-test-action"
    );
    let repeated_save_body: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/save-agents"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspaceId": workspace_id,
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent",
            "actionId": "save-test-action",
            "agentPaths": [research.folder_path.clone(), writer.folder_path.clone()]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(repeated_save_body["agents"].as_array().unwrap().len(), 2);
    let saved = agents_crud::list(docs.path(), &workspace_id).unwrap();
    assert!(saved
        .into_iter()
        .filter(|agent| agent.name == "Research" || agent.name == "Writer")
        .all(|agent| !agent.temporary));
}

#[tokio::test]
async fn create_and_run_accepts_legacy_prompt_links() {
    let (addr, tok, _docs, workspace_id, parent_agent_path) = spawn().await;
    let client = reqwest::Client::new();

    let body: serde_json::Value = client
        .post(format!("http://{addr}/v1/orchestration/create-and-run"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspaceId": workspace_id,
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent",
            "agents": [
                { "id": "legacy", "name": "Legacy Worker", "prompt": "Do the old task", "dependsOn": [] }
            ]
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let created = body["agents"].as_array().unwrap();
    assert_eq!(created.len(), 1);
    assert_eq!(created[0]["name"], "Legacy Worker");
}

#[tokio::test]
async fn create_and_run_rejects_empty_agent_lists() {
    let (addr, tok, _docs, workspace_id, parent_agent_path) = spawn().await;
    let client = reqwest::Client::new();

    let response = client
        .post(format!("http://{addr}/v1/orchestration/create-and-run"))
        .bearer_auth(&tok)
        .json(&serde_json::json!({
            "workspaceId": workspace_id,
            "parentAgentPath": parent_agent_path,
            "parentSessionKey": "activity-parent",
            "agents": []
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), 400);
}
