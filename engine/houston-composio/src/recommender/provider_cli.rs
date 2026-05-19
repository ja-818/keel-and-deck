//! Shared provider-CLI plumbing for the recommender family of LLM calls
//! (`llm_pick`, `generate_custom`, future features).
//!
//! All features in this module shell out to the user's already-logged-in
//! provider CLI: `claude -p` for Anthropic, `codex exec` for OpenAI,
//! `gemini --output-format stream-json` for Google. The same timing
//! budget, the same model choice, the same stdin-piping mechanic —
//! there's no reason for each feature to re-implement the spawn/timeout
//! dance.
//!
//! Public surface: [`run_provider`]. Everything else is implementation
//! detail kept `pub(super)` for documentation purposes.

use houston_terminal_manager::{claude_path, Provider};
use serde_json::Value;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

/// 90s upper bound for the provider CLI call. Empirically the recommender
/// prompts (1-2 KB context, JSON response) take 20-50s on
/// `claude -p --model haiku` end-to-end when the user's home network is
/// healthy; we add headroom for slow links and rare model latency spikes.
/// Beyond 90s the caller falls back to a deterministic result so the UX
/// never hangs.
pub(super) const PICK_TIMEOUT: Duration = Duration::from_secs(90);

/// Models we ship to. Cheap + fast tier — the recommender + generator
/// run synchronously in front of a user, so we trade absolute quality
/// for latency. If a feature ever needs a smarter tier, add a model
/// override parameter to [`run_provider`].
const CLAUDE_PICK_MODEL: &str = "haiku";
const CODEX_PICK_MODEL: &str = "gpt-5.5-mini";
const GEMINI_PICK_MODEL: &str = "gemini-3.1-flash-lite";

/// Dispatch to the right CLI. The CLI must already be installed and
/// authenticated; we don't try to recover from "command not found" here
/// — the caller surfaces that as a feature-specific error.
pub(super) async fn run_provider(prompt: &str, provider: Provider) -> Result<String, String> {
    match provider.id() {
        "anthropic" => run_claude(prompt).await,
        "openai" => run_codex(prompt).await,
        "gemini" => run_gemini(prompt).await,
        other => Err(format!(
            "recommender does not yet support provider {other}"
        )),
    }
}

async fn run_claude(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("claude");
    cmd.env("PATH", claude_path::shell_path());
    // The Claude Code CLI inherits ENTRYPOINT/CLAUDECODE markers when
    // launched from inside another Claude session. Strip them so the
    // child runs as a standalone -p invocation.
    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");
    cmd.arg("-p")
        .arg("--model")
        .arg(CLAUDE_PICK_MODEL)
        .arg("--output-format")
        .arg("text")
        .arg("--allowedTools")
        .arg("");
    run_with_prompt(cmd, prompt).await
}

async fn run_codex(prompt: &str) -> Result<String, String> {
    let bin = houston_cli_bundle::bundled_codex_path()
        .unwrap_or_else(|| std::path::PathBuf::from("codex"));
    let mut cmd = Command::new(&bin);
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("exec")
        .arg("--json")
        .arg("--dangerously-bypass-approvals-and-sandbox")
        .arg("--skip-git-repo-check")
        .arg("-c")
        .arg("model_reasoning_effort=\"low\"")
        .arg("--model")
        .arg(CODEX_PICK_MODEL)
        .arg("-");
    let stdout = run_with_prompt(cmd, prompt).await?;
    extract_codex_text(&stdout)
}

/// Spawn `gemini --output-format stream-json` with the prompt on stdin
/// and collect the assistant's final response. The CLI emits NDJSON;
/// every `type:"message"` event with `role:"assistant"` contributes to
/// the running response. `--yolo` + `--skip-trust` are required for
/// non-interactive use (matches the session runner upstream — see
/// `houston-terminal-manager::gemini_runner`).
async fn run_gemini(prompt: &str) -> Result<String, String> {
    let mut cmd = Command::new("gemini");
    cmd.env("PATH", claude_path::shell_path());
    cmd.arg("--output-format")
        .arg("stream-json")
        .arg("--yolo")
        .arg("--skip-trust")
        .arg("--model")
        .arg(GEMINI_PICK_MODEL);
    let stdout = run_with_prompt(cmd, prompt).await?;
    extract_gemini_text(&stdout)
}

async fn run_with_prompt(mut cmd: Command, prompt: &str) -> Result<String, String> {
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

    let output = match timeout(PICK_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(format!("process failed: {e}")),
        Err(_) => return Err("process timed out".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let trimmed: String = stderr.chars().take(200).collect();
        return Err(format!("process exited {}: {trimmed}", output.status));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Codex emits one JSON event per line on stdout. The agent's reply
/// lives in `event.item.text` when `event.item.type == "agent_message"`.
/// Walk every line; keep the latest match. Anything else (tool use,
/// reasoning traces) is ignored.
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

/// Gemini emits one NDJSON event per line. The assistant's reply lives
/// in `event.content` when `event.type == "message"` and
/// `event.role == "assistant"`. Stream events with `delta:true` are
/// incremental chunks of the same message — concatenate them in order
/// and let the final non-delta line (or end-of-stream) finalize.
///
/// Wire shape from `engine/houston-terminal-manager/src/gemini_parser.rs`
/// (pinned to gemini-cli v0.42.0).
fn extract_gemini_text(stdout: &str) -> Result<String, String> {
    let mut acc = String::new();
    for line in stdout.lines() {
        let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        if event.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        if event.get("role").and_then(Value::as_str) != Some("assistant") {
            continue;
        }
        if let Some(content) = event.get("content").and_then(Value::as_str) {
            acc.push_str(content);
        }
    }
    if acc.trim().is_empty() {
        Err("gemini output had no assistant message content".to_string())
    } else {
        Ok(acc)
    }
}
