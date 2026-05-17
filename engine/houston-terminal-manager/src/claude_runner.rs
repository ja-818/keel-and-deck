use super::types::{NativeDelegationPolicy, Provider, SessionStatus};
use crate::claude_install_path;
use crate::cli_process::{run_cli_process, CliRunOutcome};
use crate::provider_error::MALFORMED_PROVIDER_JSON_MESSAGE;
use crate::session_update::SessionUpdate;
use std::ffi::OsString;
use tokio::process::Command;
use tokio::sync::mpsc;

const CLAUDE_SAFE_TOOLS: &[&str] = &[
    "Bash",
    "Glob",
    "Grep",
    "LSP",
    "Read",
    "WebFetch",
    "WebSearch",
    "Edit",
    "Write",
    "NotebookEdit",
];

const CLAUDE_SAFE_TOOLS_NO_EDIT: &[&str] = &[
    "Bash",
    "Glob",
    "Grep",
    "LSP",
    "Read",
    "WebFetch",
    "WebSearch",
];

const CLAUDE_BLOCKED_TOOLS: &[&str] = &["Agent", "Task", "TaskCreate", "TaskUpdate", "SendMessage"];

/// Absolute path to the Houston-managed `claude` if the runtime installer
/// dropped it (`~/.local/bin/claude` on Unix,
/// `%LOCALAPPDATA%\Programs\claude\claude.exe` on Windows). Falls back to
/// the bare name `"claude"` (PATH lookup) only when the installer hasn't
/// run yet, e.g. dev checkouts without `cli-deps.json`.
///
/// Spawning the absolute path matters: we pin a specific claude-code
/// version in `cli-deps.json` and pass flags
/// (`--include-partial-messages`, `--dangerously-skip-permissions`, ...)
/// that only newer versions support. PATH lookup can hit an older
/// `claude` from npm-global, homebrew, or a prior install, which then
/// rejects the flag with `error: unknown option '--include-partial-messages'`
/// and the session dies before producing any output.
fn claude_command_name() -> OsString {
    if claude_install_path::is_installed() {
        claude_install_path::cli_path().into_os_string()
    } else {
        OsString::from("claude")
    }
}

/// Spawn a Claude CLI session (`claude -p --output-format stream-json`).
pub(crate) async fn spawn_claude(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    prompt: String,
    resume_session_id: Option<String>,
    working_dir: Option<std::path::PathBuf>,
    model: Option<String>,
    effort: Option<String>,
    system_prompt: Option<String>,
    mcp_config: Option<std::path::PathBuf>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
    native_delegation_policy: NativeDelegationPolicy,
) {
    tracing::info!(
        "[houston:session] spawning claude -p (resume={:?})",
        resume_session_id
    );

    if let Some(ref dir) = working_dir {
        if !dir.is_dir() {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Working directory not found: {}. Was it deleted?",
                dir.display()
            ))));
            return;
        }
    }

    let mut cmd = Command::new(claude_command_name());
    configure_claude_command(
        &mut cmd,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
        model.as_deref(),
        effort.as_deref(),
        system_prompt.as_deref(),
        mcp_config.as_deref(),
        disable_builtin_tools,
        disable_all_tools,
        native_delegation_policy,
    );
    let outcome = run_cli_process(
        tx,
        &mut cmd,
        &prompt,
        Provider::Anthropic,
        native_delegation_policy,
    )
    .await;
    if should_retry_malformed_provider_json(outcome, resume_session_id.as_deref()) {
        tracing::warn!(
            "[houston:session] claude resume failed with malformed provider JSON; retrying fresh"
        );
        let _ = tx.send(SessionUpdate::ResumeInvalid);
        retry_fresh(
            tx,
            &prompt,
            working_dir.as_deref(),
            model.as_deref(),
            effort.as_deref(),
            system_prompt.as_deref(),
            mcp_config.as_deref(),
            disable_builtin_tools,
            disable_all_tools,
            native_delegation_policy,
        )
        .await;
    } else if outcome == CliRunOutcome::ProviderRequestMalformedJson {
        send_malformed_provider_json_status(tx);
    }
}

#[allow(clippy::too_many_arguments)]
async fn retry_fresh(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    prompt: &str,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
    native_delegation_policy: NativeDelegationPolicy,
) {
    let mut fresh_cmd = Command::new(claude_command_name());
    configure_claude_command(
        &mut fresh_cmd,
        None,
        working_dir,
        model,
        effort,
        system_prompt,
        mcp_config,
        disable_builtin_tools,
        disable_all_tools,
        native_delegation_policy,
    );
    let retry_outcome = run_cli_process(
        tx,
        &mut fresh_cmd,
        prompt,
        Provider::Anthropic,
        native_delegation_policy,
    )
    .await;
    if retry_outcome == CliRunOutcome::ProviderRequestMalformedJson {
        send_malformed_provider_json_status(tx);
    }
}

#[allow(clippy::too_many_arguments)]
fn configure_claude_command(
    cmd: &mut Command,
    resume_session_id: Option<&str>,
    working_dir: Option<&std::path::Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
    native_delegation_policy: NativeDelegationPolicy,
) {
    cmd.env("PATH", super::claude_path::shell_path());
    let args = build_claude_args(
        resume_session_id,
        model,
        effort,
        system_prompt,
        mcp_config,
        disable_builtin_tools,
        disable_all_tools,
        native_delegation_policy,
    );
    tracing::info!(
        "[houston:session] claude tool policy: {}",
        summarize_tool_policy(&args)
    );
    cmd.args(args);

    cmd.env_remove("CLAUDE_CODE_ENTRYPOINT");
    cmd.env_remove("CLAUDECODE");

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }
}

fn build_claude_args(
    resume_session_id: Option<&str>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
    mcp_config: Option<&std::path::Path>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
    native_delegation_policy: NativeDelegationPolicy,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("-p"),
        OsString::from("--output-format"),
        OsString::from("stream-json"),
        OsString::from("--verbose"),
        OsString::from("--include-partial-messages"),
    ];

    if disable_all_tools {
        args.push(OsString::from("--allowedTools"));
        args.push(OsString::from(""));
    } else {
        let safe_tools = if disable_builtin_tools {
            CLAUDE_SAFE_TOOLS_NO_EDIT
        } else {
            CLAUDE_SAFE_TOOLS
        };
        args.push(OsString::from("--dangerously-skip-permissions"));
        args.push(OsString::from("--tools"));
        args.push(OsString::from(safe_tools.join(",")));
        if native_delegation_policy.blocks() {
            args.push(OsString::from("--disallowedTools"));
            args.push(OsString::from(CLAUDE_BLOCKED_TOOLS.join(",")));
        }
    }

    if let Some(m) = model {
        args.push(OsString::from("--model"));
        args.push(OsString::from(m));
    }
    if let Some(e) = effort {
        args.push(OsString::from("--effort"));
        args.push(OsString::from(e));
    }
    if let Some(sp) = system_prompt {
        args.push(OsString::from("--system-prompt"));
        args.push(OsString::from(sp));
    }
    if let Some(mcp) = mcp_config {
        args.push(OsString::from("--mcp-config"));
        args.push(mcp.as_os_str().to_os_string());
    }
    if let Some(session_id) = resume_session_id {
        args.push(OsString::from("--resume"));
        args.push(OsString::from(session_id));
    }

    args
}

fn summarize_tool_policy(args: &[OsString]) -> String {
    let mut parts = Vec::new();
    for flag in ["--tools", "--allowedTools", "--disallowedTools"] {
        if let Some(pos) = args.iter().position(|arg| arg == flag) {
            let value = args
                .get(pos + 1)
                .map(|arg| arg.to_string_lossy().to_string())
                .unwrap_or_default();
            parts.push(format!("{flag}={value}"));
        }
    }
    if parts.is_empty() {
        "no explicit tool policy".to_string()
    } else {
        parts.join(" ")
    }
}

fn should_retry_malformed_provider_json(
    outcome: CliRunOutcome,
    resume_session_id: Option<&str>,
) -> bool {
    outcome == CliRunOutcome::ProviderRequestMalformedJson && resume_session_id.is_some()
}

fn send_malformed_provider_json_status(tx: &mpsc::UnboundedSender<SessionUpdate>) {
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
        MALFORMED_PROVIDER_JSON_MESSAGE.to_string(),
    )));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_malformed_provider_json_only_for_resume() {
        assert!(should_retry_malformed_provider_json(
            CliRunOutcome::ProviderRequestMalformedJson,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::ProviderRequestMalformedJson,
            None,
        ));
    }

    #[test]
    fn does_not_retry_other_outcomes() {
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::Failed,
            Some("claude-session-id"),
        ));
        assert!(!should_retry_malformed_provider_json(
            CliRunOutcome::Completed,
            Some("claude-session-id"),
        ));
    }

    #[test]
    fn disallows_provider_native_agent_tools_when_policy_blocks() {
        let args: Vec<String> = build_claude_args(
            None,
            None,
            None,
            None,
            None,
            false,
            false,
            NativeDelegationPolicy::Block,
        )
        .into_iter()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

        let tools_pos = args
            .iter()
            .position(|arg| arg == "--tools")
            .expect("tools allowlist must be present");
        assert_eq!(args[tools_pos + 1], CLAUDE_SAFE_TOOLS.join(","));

        let blocked_pos = args
            .iter()
            .position(|arg| arg == "--disallowedTools")
            .expect("disallowedTools must be present");
        assert_eq!(args[blocked_pos + 1], CLAUDE_BLOCKED_TOOLS.join(","));
        assert!(args[blocked_pos + 1].split(',').any(|tool| tool == "Task"));
    }

    #[test]
    fn allows_provider_native_agent_tools_when_policy_allows() {
        let args: Vec<String> = build_claude_args(
            None,
            None,
            None,
            None,
            None,
            false,
            false,
            NativeDelegationPolicy::Allow,
        )
        .into_iter()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

        assert!(args.iter().any(|arg| arg == "--tools"));
        assert!(!args.iter().any(|arg| arg == "--disallowedTools"));
    }

    #[test]
    fn edit_tools_drop_from_allowlist_when_builtin_edits_disabled() {
        let args: Vec<String> = build_claude_args(
            None,
            None,
            None,
            None,
            None,
            true,
            false,
            NativeDelegationPolicy::Block,
        )
        .into_iter()
        .map(|arg| arg.to_string_lossy().to_string())
        .collect();

        let tools_pos = args
            .iter()
            .position(|arg| arg == "--tools")
            .expect("tools allowlist must be present");
        assert_eq!(args[tools_pos + 1], CLAUDE_SAFE_TOOLS_NO_EDIT.join(","));
    }

    #[test]
    fn summarizes_tool_policy_without_prompt() {
        let args = build_claude_args(
            None,
            None,
            None,
            Some("secret product prompt"),
            None,
            false,
            false,
            NativeDelegationPolicy::Block,
        );

        let summary = summarize_tool_policy(&args);

        assert!(summary.contains("--tools="));
        assert!(summary.contains("--disallowedTools="));
        assert!(!summary.contains("secret product prompt"));
    }
}
