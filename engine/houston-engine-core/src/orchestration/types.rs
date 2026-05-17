use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentIntent {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub role_prompt: String,
    pub task_prompt: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAndRunResult {
    pub agents: Vec<CreatedAgent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedAgent {
    pub id: String,
    pub node_id: String,
    pub name: String,
    pub agent_path: String,
    pub session_key: String,
    pub depends_on: Vec<String>,
    pub status: NodeStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Waiting,
    Running,
    Done,
    Error,
    Blocked,
    Cancelled,
}

impl NodeStatus {
    pub fn as_activity_status(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::Running => "running",
            Self::Done => "done",
            Self::Error => "error",
            Self::Blocked => "blocked",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Done | Self::Error | Self::Blocked | Self::Cancelled
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManifestStatus {
    Waiting,
    Running,
    Done,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationNode {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(default)]
    pub role_prompt: String,
    #[serde(default)]
    pub task_prompt: String,
    pub depends_on: Vec<String>,
    pub agent_path: String,
    pub session_key: String,
    pub status: NodeStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationManifest {
    pub id: String,
    pub parent_agent_path: String,
    pub parent_session_key: String,
    pub workspace_id: String,
    pub revision: u64,
    pub status: ManifestStatus,
    pub max_concurrency: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_adjustment: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_adjustment_targets: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub applied_dispatch_action_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub applied_save_action_ids: Vec<String>,
    pub nodes: Vec<OrchestrationNode>,
    pub created_at: String,
    pub updated_at: String,
}

impl OrchestrationManifest {
    pub fn migrate_legacy_prompts(&mut self) {
        for node in &mut self.nodes {
            let legacy_prompt = node.prompt.as_deref().unwrap_or_default().trim();
            if node.role_prompt.trim().is_empty() && !legacy_prompt.is_empty() {
                node.role_prompt = legacy_prompt.to_string();
            }
            if node.task_prompt.trim().is_empty() && !legacy_prompt.is_empty() {
                node.task_prompt = legacy_prompt.to_string();
            }
            node.prompt = None;
        }
    }
}

impl From<&OrchestrationNode> for CreatedAgent {
    fn from(node: &OrchestrationNode) -> Self {
        Self {
            id: node.agent_path.clone(),
            node_id: node.id.clone(),
            name: node.name.clone(),
            agent_path: node.agent_path.clone(),
            session_key: node.session_key.clone(),
            depends_on: node.depends_on.clone(),
            status: node.status,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_defaults_applied_action_ids() {
        let raw = r#"{
            "id": "m",
            "parentAgentPath": "/parent",
            "parentSessionKey": "chat",
            "workspaceId": "workspace",
            "revision": 1,
            "status": "done",
            "maxConcurrency": 8,
            "nodes": [],
            "createdAt": "now",
            "updatedAt": "now"
        }"#;

        let manifest: OrchestrationManifest = serde_json::from_str(raw).unwrap();
        assert!(manifest.applied_dispatch_action_ids.is_empty());
        assert!(manifest.applied_save_action_ids.is_empty());
    }

    #[test]
    fn manifest_migrates_legacy_node_prompt() {
        let raw = r#"{
            "id": "m",
            "parentAgentPath": "/parent",
            "parentSessionKey": "chat",
            "workspaceId": "workspace",
            "revision": 1,
            "status": "done",
            "maxConcurrency": 8,
            "nodes": [{
                "id": "writer",
                "name": "Writer",
                "prompt": "Legacy task and role.",
                "dependsOn": [],
                "agentPath": "/writer",
                "sessionKey": "activity-writer",
                "status": "done"
            }],
            "createdAt": "now",
            "updatedAt": "now"
        }"#;

        let mut manifest: OrchestrationManifest = serde_json::from_str(raw).unwrap();
        manifest.migrate_legacy_prompts();
        assert_eq!(manifest.nodes[0].role_prompt, "Legacy task and role.");
        assert_eq!(manifest.nodes[0].task_prompt, "Legacy task and role.");
        assert!(manifest.nodes[0].prompt.is_none());
    }
}
