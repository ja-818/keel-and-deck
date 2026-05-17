use super::types::{AgentIntent, NodeStatus, OrchestrationManifest, OrchestrationNode};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentIntentForSave {
    name: String,
    agent_path: String,
}

pub fn node_prompt(manifest: &OrchestrationManifest, node: &OrchestrationNode) -> String {
    let mut prompt = String::new();
    prompt.push_str("Your assigned task:\n");
    prompt.push_str(&node.task_prompt);
    prompt.push_str("\n\n");
    if let Some(adjustment) = manifest.current_adjustment.as_deref() {
        prompt.push_str("Latest user adjustment for this run:\n");
        prompt.push_str(adjustment);
        prompt.push_str("\n\n");
    }
    let deps: Vec<_> = node
        .depends_on
        .iter()
        .filter_map(|dep| manifest.nodes.iter().find(|candidate| candidate.id == *dep))
        .collect();
    if deps.is_empty() {
        return prompt;
    }
    prompt.push_str("Inputs from dependency agents:\n");
    for dep in deps {
        prompt.push_str("\n## ");
        prompt.push_str(&dep.name);
        prompt.push('\n');
        prompt.push_str(dep.output.as_deref().unwrap_or("No output captured."));
        prompt.push('\n');
    }
    prompt.push_str(
        "\nUse these dependency outputs as authoritative input. Do not ask the user for them again. Return only your updated result.",
    );
    prompt
}

pub fn parent_summary_prompt(manifest: &OrchestrationManifest) -> String {
    let mut prompt = String::from(
        "Prepare the final user-facing response in plain, non-technical language. Start with a short overview that names every specialized agent and states what each contributed. Then deliver the final work completely. Do not shorten, summarize, paraphrase, or replace final deliverables with a description of what an agent did. Use readable markdown. Do not mention files, JSON, prompts, APIs, routing, orchestration, delegation internals, or this handoff message.\n\n",
    );
    let final_nodes = terminal_nodes(manifest);
    let context_nodes: Vec<_> = manifest
        .nodes
        .iter()
        .filter(|node| {
            !final_nodes
                .iter()
                .any(|final_node| final_node.id == node.id)
        })
        .collect();

    if !context_nodes.is_empty() {
        prompt.push_str("Supporting agent outputs. Create a visible section for each agent listed here using the agent name as the heading. If the output is short, include it completely. If it is long and not the final deliverable, summarize the contribution briefly but do not omit the agent:\n\n");
        for node in context_nodes {
            prompt.push_str("Agent: ");
            prompt.push_str(&node.name);
            prompt.push_str("\nRole result summary source:\n");
            prompt.push_str(node.output.as_deref().unwrap_or_else(|| {
                node.error
                    .as_deref()
                    .unwrap_or("This agent did not produce output.")
            }));
            prompt.push_str("\n\n");
        }
    }

    prompt.push_str(
        "Final deliverables. Create a visible section for each final agent listed here using the agent name as the heading. Copy these outputs completely into the answer; do not compress them:\n\n",
    );
    for node in final_nodes {
        prompt.push_str("Final output from ");
        prompt.push_str(&node.name);
        prompt.push_str(":\n");
        prompt.push_str(node.output.as_deref().unwrap_or_else(|| {
            node.error
                .as_deref()
                .unwrap_or("This agent did not produce output.")
        }));
        prompt.push_str("\n\n");
    }
    if manifest
        .nodes
        .iter()
        .all(|node| node.status == NodeStatus::Done)
    {
        let save_agents: Vec<_> = manifest
            .nodes
            .iter()
            .map(|node| AgentIntentForSave {
                name: node.name.clone(),
                agent_path: node.agent_path.clone(),
            })
            .collect();
        let payload = serde_json::to_string(&save_agents).unwrap_or_else(|_| "[]".to_string());
        prompt.push_str("Adjustment routing reference. If the user later asks to change only one part of the work, choose the matching node ids here and emit the private adjust link with only those ids. The engine will rerun downstream dependents automatically:\n");
        for node in &manifest.nodes {
            prompt.push_str("- ");
            prompt.push_str(&node.id);
            prompt.push_str(": ");
            prompt.push_str(&node.name);
            prompt.push_str("\n");
        }
        prompt.push_str("\n");
        prompt.push_str("After the summary, ask whether the user wants anything adjusted. Do not show a save card yet. If the user later says the work is finished, says that is all, asks to keep the agents, or asks to reuse them later, ask whether they want to save or update the specialized agents for future chats. Do not include a save link in that question. Only after the user clearly confirms saving, show this exact save link so the app can offer saving or updating all or selected agents:\n");
        prompt.push_str("[save_agents](https://houston.ai/_/save-agents#agents=");
        prompt.push_str(&urlencoding::encode(&payload));
        prompt.push_str(")\n");
        prompt.push_str("Do not expose the raw URL or say the agents were already saved.");
    }
    prompt
}

fn terminal_nodes(manifest: &OrchestrationManifest) -> Vec<&OrchestrationNode> {
    manifest
        .nodes
        .iter()
        .filter(|node| {
            !manifest
                .nodes
                .iter()
                .any(|candidate| candidate.depends_on.iter().any(|dep| dep == &node.id))
        })
        .collect()
}

pub fn describe_intent_for_activity(intent: &AgentIntent) -> String {
    let summary: String = intent.task_prompt.chars().take(80).collect();
    summary
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::types::{ManifestStatus, NodeStatus, OrchestrationManifest};

    #[test]
    fn parent_summary_treats_dependency_leaves_as_final_deliverables() {
        let manifest = OrchestrationManifest {
            id: "m".into(),
            parent_agent_path: "/parent".into(),
            parent_session_key: "chat".into(),
            workspace_id: "workspace".into(),
            revision: 1,
            status: ManifestStatus::Done,
            max_concurrency: 8,
            current_adjustment: None,
            current_adjustment_targets: None,
            applied_dispatch_action_ids: Vec::new(),
            applied_save_action_ids: Vec::new(),
            nodes: vec![
                OrchestrationNode {
                    id: "extract".into(),
                    name: "Extractor".into(),
                    prompt: None,
                    role_prompt: "You extract reusable facts.".into(),
                    task_prompt: "extract".into(),
                    depends_on: vec![],
                    agent_path: "/extract".into(),
                    session_key: "activity-a".into(),
                    status: NodeStatus::Done,
                    output: Some("intermediate facts".into()),
                    error: None,
                },
                OrchestrationNode {
                    id: "final".into(),
                    name: "Final Writer".into(),
                    prompt: None,
                    role_prompt: "You write final answers.".into(),
                    task_prompt: "write".into(),
                    depends_on: vec!["extract".into()],
                    agent_path: "/final".into(),
                    session_key: "activity-b".into(),
                    status: NodeStatus::Done,
                    output: Some("complete deliverable".into()),
                    error: None,
                },
            ],
            created_at: "now".into(),
            updated_at: "now".into(),
        };

        let prompt = parent_summary_prompt(&manifest);
        assert!(prompt.contains("Supporting agent outputs"));
        assert!(prompt.contains("Final deliverables"));
        assert!(prompt.contains("complete deliverable"));
        assert!(prompt.contains("do not compress"));
        assert!(prompt.contains("names every specialized agent"));
        assert!(prompt.contains("Create a visible section for each agent"));
        assert!(prompt.contains("do not omit the agent"));
    }
}
