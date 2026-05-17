use super::types::AgentIntent;

pub fn saved_role_profile(intent: &AgentIntent) -> String {
    format!(
        r#"# Role

{}

## How to work

- Treat each user request as a new mission that may have its own topic, audience, format, constraints, and connected apps.
- Ask one targeted question only when required context is missing. If a safe assumption is enough, state it briefly and continue.
- Produce complete, ready-to-use outputs. Do not summarize work instead of delivering it.
- Keep technical implementation details out of user-facing replies unless the user asks for them.
- Never publish, send, delete, or make irreversible external changes without explicit user approval.

## Mission handling

Your durable role is reusable across missions. Current topics, examples, quantities, platforms, and one-time constraints arrive in the mission prompt, not in this standing role profile.
"#,
        intent.role_prompt.trim()
    )
}

pub fn validate_role_contract(intent: &AgentIntent) -> Result<(), String> {
    let id = intent.id.as_deref().unwrap_or_default();
    let role = normalize(&intent.role_prompt);
    let task = normalize(&intent.task_prompt);
    if role == task {
        return Err(format!(
            "agent {id} role prompt must describe reusable behavior, not repeat the task prompt"
        ));
    }
    if role_has_single_mission_marker(&role) {
        return Err(format!(
            "agent {id} role prompt contains current-mission language; put one-time mission details in taskPrompt"
        ));
    }
    Ok(())
}

fn normalize(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn role_has_single_mission_marker(value: &str) -> bool {
    [
        "for this mission",
        "for this task",
        "current mission",
        "current task",
        "this single mission",
    ]
    .iter()
    .any(|marker| value.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intent(role_prompt: &str, task_prompt: &str) -> AgentIntent {
        AgentIntent {
            id: Some("writer".into()),
            name: "Writer".into(),
            role_prompt: role_prompt.into(),
            task_prompt: task_prompt.into(),
            depends_on: Vec::new(),
        }
    }

    #[test]
    fn saved_profile_keeps_task_details_out() {
        let intent = intent(
            "You are a reusable social copywriter.",
            "For this mission, write five salon posts.",
        );
        let profile = saved_role_profile(&intent);
        assert!(profile.contains("reusable social copywriter"));
        assert!(!profile.contains("salon posts"));
        assert!(profile.contains("Current topics"));
    }

    #[test]
    fn rejects_role_that_repeats_task() {
        let intent = intent("Write five posts", "Write five posts");
        assert!(validate_role_contract(&intent).is_err());
    }

    #[test]
    fn rejects_current_mission_role_language() {
        let intent = intent(
            "For this mission, you write five posts about salons.",
            "Write five posts about salons.",
        );
        assert!(validate_role_contract(&intent).is_err());
    }
}
