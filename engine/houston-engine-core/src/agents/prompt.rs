//! Agent directory helpers used to assemble the system prompt and seed
//! template files.
//!
//! Relocated from `app/houston-tauri/src/agent.rs` and
//! `app/src-tauri/src/agent.rs` as part of the engine standalone migration.
//! Transport-neutral — the Tauri adapter, REST routes, and tests all consume
//! the same functions.

use crate::agents::self_improvement::SELF_IMPROVEMENT_GUIDANCE;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// Seed a single file into a directory if it doesn't already exist.
/// Never overwrites user edits.
pub fn seed_file(dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let path = dir.join(name);
    if !path.exists() {
        fs::write(&path, content).map_err(|e| format!("Failed to write {name}: {e}"))?;
    }
    Ok(())
}

/// Build a system prompt by reading agent files and assembling them.
///
/// - `base_prompt`: The base identity prompt (always included first).
/// - `bootstrap_name`: If this file exists, it's injected prominently as a
///   first-run signal.
/// - `files`: List of `(filename, section_label)` to read and inject.
pub fn build_system_prompt(
    dir: &Path,
    base_prompt: &str,
    bootstrap_name: Option<&str>,
    files: &[(&str, &str)],
) -> String {
    let mut sections = vec![base_prompt.to_string()];

    if let Some(name) = bootstrap_name {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!(
                "# FIRST RUN — BOOTSTRAP\n\
                 {name} exists. This is your first time. Follow it EXACTLY.\n\n\
                 {content}"
            ));
        }
    }

    for (name, label) in files {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!("# {label}\n\n{content}"));
        }
    }

    sections.join("\n\n---\n\n")
}

/// Info about an agent file for UI display.
#[derive(Serialize)]
pub struct AgentFileInfo {
    pub name: String,
    pub description: String,
    pub exists: bool,
}

/// List known agent files with their existence status.
pub fn list_files(dir: &Path, known: &[(&str, &str)]) -> Vec<AgentFileInfo> {
    known
        .iter()
        .map(|(name, desc)| AgentFileInfo {
            name: name.to_string(),
            description: desc.to_string(),
            exists: dir.join(name).exists(),
        })
        .collect()
}

/// Read an agent file, only allowing known file names.
pub fn read_file(dir: &Path, name: &str, allowed: &[&str]) -> Result<String, String> {
    if !allowed.contains(&name) {
        return Err(format!("Unknown agent file: {name}"));
    }
    fs::read_to_string(dir.join(name)).map_err(|e| format!("Failed to read {name}: {e}"))
}

// ---------------------------------------------------------------------------
// Houston-flavored seed + system prompt (used by sessions::start*).
// ---------------------------------------------------------------------------

/// Default CLAUDE.md content for a brand-new agent.
pub const DEFAULT_CLAUDE_MD: &str = r#"# Houston Agent

## Role
You are a helpful AI assistant.

## Rules
- Be concise and direct
- Ask before making destructive changes
- Explain your reasoning when making decisions
"#;

/// Default `.houston/prompts/system.md` content.
pub const DEFAULT_SYSTEM_PROMPT: &str = "\
You are an AI assistant running inside Houston, \
a native desktop app. Your workspace files are injected below. Follow them.\n\n\
Never use emojis unless being asked to.\n\n\
# Agent Data Files\n\n\
Your persistent data lives under `.houston/<type>/<type>.json` — e.g. the board \
is at `.houston/activity/activity.json`, routines at `.houston/routines/routines.json`. \
Every data folder has a co-located `<type>.schema.json` (JSON Schema draft-07). \
**Before writing any of these files, read the matching schema in the same folder \
and conform to it exactly.** Missing required fields or wrong enum values will \
break the UI. If you need a new data shape, propose it as a schema change rather \
than writing ad-hoc JSON.";

/// Seed the Houston agent skeleton into an agent directory.
pub fn seed_agent(dir: &Path) -> Result<(), String> {
    seed_file(dir, "CLAUDE.md", DEFAULT_CLAUDE_MD)?;

    let agents_md = dir.join("AGENTS.md");
    if !agents_md.exists() {
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink("CLAUDE.md", &agents_md);
        }
        #[cfg(windows)]
        {
            let _ = std::os::windows::fs::symlink_file("CLAUDE.md", &agents_md);
        }
    }

    let prompts_dir = dir.join(".houston/prompts");
    let modes_dir = prompts_dir.join("modes");
    fs::create_dir_all(&modes_dir)
        .map_err(|e| format!("Failed to create .houston/prompts/modes: {e}"))?;

    seed_file(&prompts_dir, "system.md", DEFAULT_SYSTEM_PROMPT)?;
    seed_file(&prompts_dir, "self-improvement.md", SELF_IMPROVEMENT_GUIDANCE)?;

    if let Err(e) = houston_agent_files::migrate_agent_data(dir) {
        tracing::warn!("[agent] migration failed for {}: {e}", dir.display());
    }

    Ok(())
}

/// Build the Houston system prompt (prompt files + self-improvement +
/// skills index + integrations context).
pub fn build_houston_system_prompt(
    dir: &Path,
    working_dir_override: Option<&Path>,
    mode: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    let prompts_dir = dir.join(".houston/prompts");

    let effective_dir = working_dir_override.unwrap_or(dir);
    let working_dir = effective_dir.to_string_lossy();
    parts.push(format!(
        "# Working Directory — MANDATORY\n\n\
         Your working directory is: `{working_dir}`\n\n\
         **CRITICAL RULES:**\n\
         - ALL files you create, read, or modify MUST be within this directory.\n\
         - NEVER create files outside this directory (not in ~/, ~/.agents/, ~/Development/, /tmp/, or anywhere else).\n\
         - Skills go in `.agents/skills/` (relative to this directory).\n\
         - Houston data goes in `.houston/` (relative to this directory).\n\
         - If you need a new file or folder, create it HERE.\n\
         - When referencing paths, always use paths relative to or inside `{working_dir}`."
    ));

    if let Ok(content) = fs::read_to_string(prompts_dir.join("system.md")) {
        parts.push(content);
    } else {
        parts.push(DEFAULT_SYSTEM_PROMPT.to_string());
    }

    if let Some(m) = mode {
        let mode_path = prompts_dir.join(format!("modes/{m}.md"));
        let fallback_path = prompts_dir.join(format!("{m}.md"));
        if let Ok(content) =
            fs::read_to_string(&mode_path).or_else(|_| fs::read_to_string(&fallback_path))
        {
            parts.push(content);
        } else {
            tracing::warn!("[agent] mode file not found: {m}.md");
        }
    }

    parts.push(SELF_IMPROVEMENT_GUIDANCE.to_string());

    let skills_dir = dir.join(".agents/skills");
    if let Ok(index) = houston_skills::build_skills_index(&skills_dir) {
        if !index.is_empty() {
            parts.push(index);
        }
    }

    let integrations_path = dir.join(".houston/integrations.json");
    if let Ok(content) = fs::read_to_string(&integrations_path) {
        let names: Vec<String> =
            serde_json::from_str::<Vec<serde_json::Value>>(&content)
                .ok()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| {
                            v.get("toolkit").and_then(|t| t.as_str()).map(String::from)
                        })
                        .collect()
                })
                .or_else(|| {
                    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content)
                        .ok()
                        .map(|map| map.keys().cloned().collect())
                })
                .unwrap_or_default();

        if !names.is_empty() {
            parts.push(format!(
                "# Integrations — Previously Used\n\n\
                 You have used these Composio integrations in past sessions: {}.\n\
                 Prefer these when the task involves their services.",
                names.join(", ")
            ));
        }
    }

    parts.join("\n\n---\n\n")
}

/// Composio CLI integration guidance appended to send_message prompts.
pub const COMPOSIO_GUIDANCE: &str = "\n\n---\n\n# Integrations — Composio CLI\n\n\
Before using any intagration WAIT AND READ THIS. Even if there are installed MCPs try to use Composio CLI to manage the interaction \
Always look if the tools is available in Composio first and try to install it, even if there's an available MCP for the integration \
Quick reference:\n\
- `composio search \"<what you want to do>\"` — find the right tool\n\
- `composio execute <TOOL_SLUG> -d '{ ... }'` — run a tool\n\
- `composio execute <TOOL_SLUG> --get-schema` — see required params\n\n\
Always search first, then execute.\n\n\
## When an app is not connected\n\n\
If `composio execute` fails because no account is linked for that \
toolkit, DO NOT open the browser for the user and DO NOT tell them \
to go to the Integrations tab. Instead:\n\n\
1. Offer to help connect the app right now. Ask in a friendly way, \
   e.g. \"I'd need you to connect your Gmail first. Want me to help?\"\n\
2. If the user says yes, run `composio link <toolkit> --no-wait` via \
   Bash and parse the JSON output.\n\
3. Present the `redirect_url` from that JSON as a markdown link. \
   **IMPORTANT**: append `#houston_toolkit=<toolkit>` to the URL so \
   the Houston chat can render it as a rich connect card with live \
   connection status instead of a plain button. Example: if the \
   JSON has `\"toolkit\": \"gmail\"` and \
   `\"redirect_url\": \"https://connect.composio.dev/link/lk_abc\"`, \
   output exactly: \
   `[Connect Gmail](https://connect.composio.dev/link/lk_abc#houston_toolkit=gmail)`. \
   The card renders the app name/logo and handles the click for you.\n\
4. After they tell you they've approved in the browser, retry the \
   original action.";

/// Onboarding guidance appended to start_onboarding prompts.
pub const ONBOARDING_GUIDANCE: &str = "\n\n---\n\n# Onboarding\n\n\
This is a brand new agent with no configuration yet. \
Welcome the user and briefly tell them what they can provide to get this agent working:\n\n\
- A job description — What role do you want me to perform? \
  e.g. SDR, Executive assistant, Customer Support Agent, Engineer.\n\
- Tools and integrations — Need Gmail or Slack? You can ask me to connect any tool \
  that has an API or an MCP, and those that don't have one, we'll find a way around.\n\
- Routines (anything to run on a schedule)\n\n\
Keep it short and warm. End with something like \
\"Or if you'd rather skip setup and jump straight in, just tell me what you need — \
we can figure it out as we go.\"\n\n\
IMPORTANT — Setup validation: Once the user provides their job description, \
you MUST write BOTH of these before setup is complete:\n\
1. Update CLAUDE.md at the workspace root with the agent's role, responsibilities, \
   and rules based on what the user described.\n\
2. Create at least one skill file in .agents/skills/ \
   (e.g. .agents/skills/core-workflow.md) with an ## Instructions section covering \
   the agent's primary workflow. Use the skill.sh convention: each skill is a markdown \
   file with ## Instructions and ## Learnings sections.\n\n\
Do NOT consider setup complete until both CLAUDE.md and at least one skill have been \
written. If the user skips the description and jumps straight to a task, still write \
a CLAUDE.md and skill based on what you can infer from the task.";

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn seed_file_is_write_once() {
        let d = TempDir::new().unwrap();
        seed_file(d.path(), "CLAUDE.md", "first").unwrap();
        seed_file(d.path(), "CLAUDE.md", "second").unwrap();
        assert_eq!(fs::read_to_string(d.path().join("CLAUDE.md")).unwrap(), "first");
    }

    #[test]
    fn build_system_prompt_assembles_known_sections() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("BOOT.md"), "boot body").unwrap();
        fs::write(d.path().join("section.md"), "section body").unwrap();

        let out = build_system_prompt(
            d.path(),
            "BASE",
            Some("BOOT.md"),
            &[("section.md", "Section")],
        );
        assert!(out.contains("BASE"));
        assert!(out.contains("FIRST RUN — BOOTSTRAP"));
        assert!(out.contains("boot body"));
        assert!(out.contains("# Section"));
        assert!(out.contains("section body"));
    }

    #[test]
    fn list_files_reports_existence() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("present.md"), "x").unwrap();
        let out = list_files(
            d.path(),
            &[("present.md", "exists"), ("absent.md", "missing")],
        );
        assert_eq!(out.len(), 2);
        assert!(out[0].exists);
        assert!(!out[1].exists);
    }

    #[test]
    fn read_file_rejects_unknown_name() {
        let d = TempDir::new().unwrap();
        let err = read_file(d.path(), "../etc/passwd", &["allowed.md"]).unwrap_err();
        assert!(err.contains("Unknown agent file"));
    }
}
