use super::role_profile;
use super::types::{AgentIntent, NodeStatus, OrchestrationNode};
use std::collections::{HashMap, HashSet};

pub fn normalize_intents(intents: &[AgentIntent]) -> Result<Vec<AgentIntent>, String> {
    let mut normalized = Vec::with_capacity(intents.len());
    for (index, intent) in intents.iter().enumerate() {
        let id = intent
            .id
            .clone()
            .unwrap_or_else(|| format!("agent_{}", index + 1));
        if id.trim().is_empty() {
            return Err("agent id cannot be empty".into());
        }
        if intent.name.trim().is_empty() {
            return Err(format!("agent {id} name cannot be empty"));
        }
        if intent.role_prompt.trim().is_empty() {
            return Err(format!("agent {id} role prompt cannot be empty"));
        }
        if intent.task_prompt.trim().is_empty() {
            return Err(format!("agent {id} task prompt cannot be empty"));
        }
        role_profile::validate_role_contract(intent)?;
        normalized.push(AgentIntent {
            id: Some(id),
            name: intent.name.clone(),
            role_prompt: intent.role_prompt.clone(),
            task_prompt: intent.task_prompt.clone(),
            depends_on: intent.depends_on.clone(),
        });
    }
    validate_intents(&normalized)?;
    Ok(normalized)
}

pub fn validate_intents(intents: &[AgentIntent]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for intent in intents {
        let id = intent.id.as_deref().unwrap_or_default();
        if !ids.insert(id.to_string()) {
            return Err(format!("duplicate orchestration agent id: {id}"));
        }
    }
    for intent in intents {
        let id = intent.id.as_deref().unwrap_or_default();
        for dep in &intent.depends_on {
            if dep == id {
                return Err(format!("agent {id} cannot depend on itself"));
            }
            if !ids.contains(dep) {
                return Err(format!("agent {id} depends on unknown agent {dep}"));
            }
        }
    }
    reject_cycles(intents)
}

pub fn ready_node_indexes(nodes: &[OrchestrationNode]) -> Vec<usize> {
    nodes
        .iter()
        .enumerate()
        .filter_map(|(index, node)| {
            if node.status != NodeStatus::Waiting {
                return None;
            }
            let deps_done = node.depends_on.iter().all(|dep| {
                nodes
                    .iter()
                    .any(|candidate| candidate.id == *dep && candidate.status == NodeStatus::Done)
            });
            deps_done.then_some(index)
        })
        .collect()
}

pub fn blocked_node_indexes(nodes: &[OrchestrationNode]) -> Vec<usize> {
    nodes
        .iter()
        .enumerate()
        .filter_map(|(index, node)| {
            if node.status != NodeStatus::Waiting {
                return None;
            }
            let has_failed_dep = node.depends_on.iter().any(|dep| {
                nodes.iter().any(|candidate| {
                    candidate.id == *dep
                        && matches!(
                            candidate.status,
                            NodeStatus::Error | NodeStatus::Blocked | NodeStatus::Cancelled
                        )
                })
            });
            has_failed_dep.then_some(index)
        })
        .collect()
}

pub fn affected_node_ids(
    nodes: &[OrchestrationNode],
    target_ids: &[String],
) -> Result<HashSet<String>, String> {
    let existing: HashSet<_> = nodes.iter().map(|node| node.id.clone()).collect();
    if target_ids.is_empty() {
        return Ok(existing);
    }
    for target_id in target_ids {
        if !existing.contains(target_id) {
            return Err(format!("unknown orchestration agent id: {target_id}"));
        }
    }
    let mut affected: HashSet<String> = target_ids.iter().cloned().collect();
    loop {
        let before = affected.len();
        for node in nodes {
            if node.depends_on.iter().any(|dep| affected.contains(dep)) {
                affected.insert(node.id.clone());
            }
        }
        if affected.len() == before {
            return Ok(affected);
        }
    }
}

fn reject_cycles(intents: &[AgentIntent]) -> Result<(), String> {
    let deps: HashMap<&str, Vec<&str>> = intents
        .iter()
        .map(|intent| {
            (
                intent.id.as_deref().unwrap_or_default(),
                intent.depends_on.iter().map(String::as_str).collect(),
            )
        })
        .collect();
    let mut visiting = HashSet::new();
    let mut visited = HashSet::new();
    for id in deps.keys() {
        visit(id, &deps, &mut visiting, &mut visited)?;
    }
    Ok(())
}

fn visit<'a>(
    id: &'a str,
    deps: &HashMap<&'a str, Vec<&'a str>>,
    visiting: &mut HashSet<&'a str>,
    visited: &mut HashSet<&'a str>,
) -> Result<(), String> {
    if visited.contains(id) {
        return Ok(());
    }
    if !visiting.insert(id) {
        return Err(format!("orchestration dependency cycle includes {id}"));
    }
    for dep in deps.get(id).into_iter().flatten() {
        visit(dep, deps, visiting, visited)?;
    }
    visiting.remove(id);
    visited.insert(id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intent(id: &str, deps: &[&str]) -> AgentIntent {
        AgentIntent {
            id: Some(id.into()),
            name: id.into(),
            role_prompt: "You are a reusable worker.".into(),
            task_prompt: "run".into(),
            depends_on: deps.iter().map(|dep| dep.to_string()).collect(),
        }
    }

    #[test]
    fn rejects_cycles() {
        let result = validate_intents(&[intent("a", &["b"]), intent("b", &["a"])]);
        assert!(result.unwrap_err().contains("cycle"));
    }

    #[test]
    fn accepts_nested_dependencies() {
        validate_intents(&[
            intent("a", &[]),
            intent("b", &["a"]),
            intent("f", &["b"]),
            intent("c", &[]),
            intent("e", &["c"]),
        ])
        .unwrap();
    }

    #[test]
    fn affected_nodes_include_downstream_dependents() {
        let intents = [
            intent("a", &[]),
            intent("b", &["a"]),
            intent("f", &["b"]),
            intent("c", &[]),
            intent("e", &["c"]),
        ];
        let nodes: Vec<_> = intents
            .iter()
            .map(|intent| OrchestrationNode {
                id: intent.id.clone().unwrap(),
                name: intent.name.clone(),
                prompt: None,
                role_prompt: intent.role_prompt.clone(),
                task_prompt: intent.task_prompt.clone(),
                depends_on: intent.depends_on.clone(),
                agent_path: format!("/{}", intent.name),
                session_key: "activity-1".into(),
                status: NodeStatus::Done,
                output: Some("done".into()),
                error: None,
            })
            .collect();

        let affected = affected_node_ids(&nodes, &[String::from("b")]).unwrap();
        assert!(affected.contains("b"));
        assert!(affected.contains("f"));
        assert!(!affected.contains("a"));
        assert!(!affected.contains("c"));
        assert!(!affected.contains("e"));
    }

    #[test]
    fn rejects_role_prompts_that_repeat_task_prompts() {
        let mut repeated = intent("writer", &[]);
        repeated.role_prompt = "Write five posts".into();
        repeated.task_prompt = "Write five posts".into();

        let err = normalize_intents(&[repeated]).unwrap_err();
        assert!(err.contains("role prompt"));
    }

    #[test]
    fn rejects_current_mission_language_in_role_prompt() {
        let mut current_mission = intent("writer", &[]);
        current_mission.role_prompt =
            "For this mission, write five Facebook posts about a salon.".into();
        current_mission.task_prompt = "Write five Facebook posts about a salon.".into();

        let err = normalize_intents(&[current_mission]).unwrap_err();
        assert!(err.contains("current-mission"));
    }
}
