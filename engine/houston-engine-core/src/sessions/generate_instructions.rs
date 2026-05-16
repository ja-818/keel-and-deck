//! AI-assisted agent instruction generator.
//!
//! Shells out to the user's configured provider CLI to generate CLAUDE.md
//! content and a list of suggested Composio integrations from a user-supplied
//! agent description. Unlike `summarize`, failures surface as `CoreError` so
//! the caller can show a toast — there is no silent fallback.

use crate::error::CoreResult;
use houston_terminal_manager::{claude_path, Provider};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

const GENERATE_TIMEOUT: Duration = Duration::from_secs(60);
const CLAUDE_GEN_MODEL: &str = "sonnet";
const CODEX_GEN_MODEL: &str = "gpt-4.1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInstructionsResult {
    pub name: String,
    pub instructions: String,
    pub suggested_integrations: Vec<String>,
}

pub async fn generate_instructions(
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<GenerateInstructionsResult> {
    let raw = run_provider_generate(description, provider, model)
        .await
        .map_err(crate::CoreError::Internal)?;
    parse_result(&raw).map_err(crate::CoreError::Internal)
}

fn build_prompt(description: &str) -> String {
    format!(
        r#"You are an expert at writing AI agent job descriptions (CLAUDE.md files).

Generate a CLAUDE.md job description for an AI agent based on this description:
"{description}"

The job description should:
- Start with a clear role definition (what the agent is and does)
- Include specific responsibilities and capabilities
- Include behavioral guidelines and constraints
- Be written in second person ("You are...", "You will...", "Your role...")
- Be practical, specific, and actionable
- Be between 200-500 words
- Use markdown headers and bullet points for clarity

Also suggest:
- A short agent name (2-4 words, title case, no generic words like "Agent" or "Assistant" unless truly fitting, e.g. "Email Inbox Manager", "Quant Analyst", "Sales Pipeline Bot")
- 1-4 relevant Composio integrations (toolkit names) that this agent would benefit from.
Common toolkits: GMAIL, GOOGLECALENDAR, GOOGLESHEETS, GOOGLEDOCS, SLACK, NOTION, GITHUB, JIRA, TRELLO, ASANA, HUBSPOT, SALESFORCE, SHOPIFY, STRIPE, TWITTER, LINKEDIN, DISCORD, AIRTABLE, EXCEL, GOOGLEDRIVE

Return ONLY valid JSON (no markdown fences):
{{"name": "...", "instructions": "...", "suggestedIntegrations": ["TOOLKIT1", "TOOLKIT2"]}}"#
    )
}

async fn run_provider_generate(
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> Result<String, String> {
    let prompt = build_prompt(description);
    match provider {
        Provider::Anthropic => run_claude_generate(&prompt, model).await,
        Provider::OpenAI => run_codex_generate(&prompt, model).await,
    }
}

async fn run_claude_generate(prompt: &str, model: Option<&str>) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new("claude");
    cmd.env("PATH", claude_path::shell_path());
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--model")
        .arg(model.unwrap_or(CLAUDE_GEN_MODEL))
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_command_with_prompt(cmd, prompt).await
}

async fn run_codex_generate(prompt: &str, model: Option<&str>) -> Result<String, String> {
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(model.unwrap_or(CODEX_GEN_MODEL))
        .arg("-");
    let stdout = run_command_with_prompt(cmd, prompt).await?;
    extract_codex_text(&stdout)
}

async fn run_command_with_prompt(
    mut cmd: tokio::process::Command,
    prompt: &str,
) -> Result<String, String> {
    cmd.kill_on_drop(true);
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .await
            .map_err(|e| format!("stdin write failed: {e}"))?;
        drop(stdin);
    }

    let output = match timeout(GENERATE_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out after 60 s".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("process exited {}: {}", output.status, stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn extract_codex_text(stdout: &str) -> Result<String, String> {
    let mut latest = String::new();
    for line in stdout.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        let Some(item) = event.get("item") else {
            continue;
        };
        if item.get("type").and_then(Value::as_str) == Some("agent_message") {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                latest = text.to_string();
            }
        }
    }
    if latest.trim().is_empty() {
        Err("codex output had no agent_message text".to_string())
    } else {
        Ok(latest)
    }
}

fn parse_result(raw: &str) -> Result<GenerateInstructionsResult, String> {
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let v: Value =
        serde_json::from_str(cleaned).map_err(|e| format!("JSON parse failed: {e}"))?;

    let name = v
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let instructions = v
        .get("instructions")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing 'instructions' field in response".to_string())?
        .to_string();

    let suggested_integrations = v
        .get("suggestedIntegrations")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    Ok(GenerateInstructionsResult {
        name,
        instructions,
        suggested_integrations,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_valid_json_response() {
        let raw = r#"{"name": "Email Manager", "instructions": "You are a helpful agent.", "suggestedIntegrations": ["GMAIL", "SLACK"]}"#;
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "Email Manager");
        assert_eq!(result.instructions, "You are a helpful agent.");
        assert_eq!(result.suggested_integrations, vec!["GMAIL", "SLACK"]);
    }

    #[test]
    fn strips_markdown_fences() {
        let raw = "```json\n{\"name\": \"Test Bot\", \"instructions\": \"Test.\", \"suggestedIntegrations\": []}\n```";
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "Test Bot");
        assert_eq!(result.instructions, "Test.");
        assert!(result.suggested_integrations.is_empty());
    }

    #[test]
    fn missing_name_defaults_to_empty_string() {
        let raw = r#"{"instructions": "Test."}"#;
        let result = parse_result(raw).unwrap();
        assert_eq!(result.name, "");
        assert!(result.suggested_integrations.is_empty());
    }
}
