use crate::types::Provider;

pub const BLOCKED_DELEGATION_NAMES: &[&str] =
    &["Agent", "Task", "TaskCreate", "TaskUpdate", "SendMessage"];

const BLOCKED_CODEX_ITEM_TYPES: &[&str] = &[
    "agent",
    "agent_task",
    "background_agent",
    "delegate",
    "delegation",
    "subagent",
    "task",
];

pub const NATIVE_DELEGATION_BLOCKED_MESSAGE: &str =
    "Provider-native delegation is disabled. Use Houston-owned orchestration instead.";

pub fn is_blocked_tool_name(name: &str) -> bool {
    BLOCKED_DELEGATION_NAMES
        .iter()
        .any(|blocked| blocked.eq_ignore_ascii_case(name))
}

pub fn is_blocked_codex_item_type(item_type: &str) -> bool {
    BLOCKED_CODEX_ITEM_TYPES
        .iter()
        .any(|blocked| blocked.eq_ignore_ascii_case(item_type))
}

pub fn is_claude_task_system_subtype(subtype: &str) -> bool {
    subtype
        .strip_prefix("task_")
        .is_some_and(|tail| !tail.is_empty())
}

pub fn violation_details(provider: Provider, name: &str) -> String {
    format!(
        "{NATIVE_DELEGATION_BLOCKED_MESSAGE} Provider `{provider}` attempted native delegation `{name}`."
    )
}
