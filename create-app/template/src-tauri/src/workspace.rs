use houston_tauri::workspace as kw;
use std::path::Path;

pub fn seed_workspace(dir: &Path) -> Result<(), String> {
    kw::seed_file(dir, "CLAUDE.md", CLAUDE_MD)?;
    Ok(())
}

pub fn build_system_prompt(dir: &Path) -> String {
    let mut parts = Vec::new();

    // 1. Base prompt
    parts.push(BASE_SYSTEM_PROMPT.to_string());

    // 2. Self-improvement guidance
    parts.push(
        houston_tauri::self_improvement::SELF_IMPROVEMENT_GUIDANCE.to_string(),
    );

    // 3. Learnings snapshot
    let memory_dir = dir.join(".houston/memory");
    let config = houston_memory::LearningsConfig::default();
    if let Ok(prompt) = houston_memory::build_learnings_prompt(&memory_dir, &config) {
        if !prompt.is_empty() {
            parts.push(prompt);
        }
    }

    // 4. Skills index (.agents/skills — skill.sh / Claude Code convention)
    let skills_dir = dir.join(".agents/skills");
    if let Ok(index) = houston_skills::build_skills_index(&skills_dir) {
        if !index.is_empty() {
            parts.push(index);
        }
    }

    // 5. Workspace files (CLAUDE.md)
    for (name, label) in &PROMPT_FILES {
        if let Ok(content) = std::fs::read_to_string(dir.join(name)) {
            parts.push(format!("# {label}\n\n{content}"));
        }
    }

    parts.join("\n\n---\n\n")
}

const PROMPT_FILES: [(&str, &str); 1] = [("CLAUDE.md", "CLAUDE.md — Agent Instructions")];

const BASE_SYSTEM_PROMPT: &str = "\
You are an AI assistant running inside {{APP_NAME_TITLE}}, \
a native desktop app. Your workspace files are injected below. Follow them.";

const CLAUDE_MD: &str = r#"# {{APP_NAME_TITLE}} Agent

## Role
You are a helpful AI assistant.

## Rules
- Be concise and direct
- Ask before making destructive changes
- Explain your reasoning when making decisions
"#;
