//! Antigravity CLI (`agy`) session runner.
//!
//! Counterpart of [`crate::claude_runner`] / [`crate::codex_runner`] /
//! [`crate::gemini_runner`] for Google's Antigravity provider.
//!
//! **v1.0.0 surface limitations** (verified against `agy --help`):
//!
//! - No structured streaming output: `agy --print` returns the final
//!   response as plain text on stdout. There is no `--output-format
//!   stream-json` equivalent yet, so this runner cannot emit partial
//!   `assistant_text_streaming` deltas. The user sees the response in
//!   one chunk when the CLI exits. When upstream ships a streaming
//!   flag, extend [`spawn_agy`] to drive a parser the same way
//!   `gemini_runner` does.
//! - No `--model` flag: the caller-supplied `model` is currently logged
//!   and discarded. The CLI uses Antigravity's default Gemini 3 Pro.
//! - No `--system` flag: any system prompt is folded into the prompt
//!   body via [`compose_agy_prompt`] (same XML-tag convention Houston
//!   uses for gemini-cli).
//! - Working dir is set via `--add-dir <path>` (repeatable). The CLI
//!   also accepts a process cwd; we set both so the model and the
//!   tools agree on which folder counts as "the workspace".
//! - Permission handling: `--dangerously-skip-permissions` mirrors what
//!   Houston already does for claude/codex/gemini. The user opted in
//!   to running an agent through Houston, so the CLI must not block
//!   on its own approval prompts.

use crate::cli_process::run_cli_process;
use crate::provider::InstallSource;
use crate::session_update::SessionUpdate;
use crate::types::SessionStatus;
use crate::Provider;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Spawn an Antigravity CLI session.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn_agy(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    working_dir: Option<PathBuf>,
    model: Option<String>,
    system_prompt: Option<String>,
) {
    tracing::info!(
        "[houston:session] spawning agy --print (resume={:?}, model_ignored={:?})",
        resume_session_id,
        model,
    );
    if let Some(m) = model.as_deref() {
        // agy v1.0.0 has no --model flag — log so we notice when the
        // schema changes upstream and we can start honoring caller
        // overrides instead of silently ignoring them.
        tracing::warn!(
            "[houston:session] agy v1.0.0 has no --model flag; ignoring requested model={m:?}"
        );
    }

    if let Some(ref dir) = working_dir {
        if !dir.is_dir() {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Working directory not found: {}. Was it deleted?",
                dir.display()
            ))));
            return;
        }
    }

    let (install_source, agy_path) = provider.resolve();
    let bin = match (install_source, agy_path) {
        (InstallSource::Missing, _) | (_, None) => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
                agy_missing_message().to_string(),
            )));
            return;
        }
        (_, Some(path)) => path,
    };

    let mut cmd = build_agy_command(
        &bin,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
    );

    let composed = compose_agy_prompt(system_prompt.as_deref(), &prompt);
    run_cli_process(tx, &mut cmd, &composed, provider).await;
}

fn build_agy_command(
    bin: &Path,
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
) -> Command {
    let mut cmd = Command::new(bin);
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.args(build_agy_args(resume_session_id, working_dir));
    if let Some(dir) = working_dir {
        cmd.current_dir(agy_compatible_path(dir));
    }
    cmd
}

/// Strip the Windows extended-length prefix from a path that's about to
/// be handed to `agy`. Same reasoning as gemini_runner: Go's file APIs
/// (which back `agy`) handle the `\\?\` prefix correctly in most cases,
/// but the surface area is large and untested at v1.0.0; better to
/// hand the CLI a clean drive-letter path until we have confidence.
fn agy_compatible_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(s) = path.to_str() {
            if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
                return PathBuf::from(format!(r"\\{rest}"));
            }
            if let Some(rest) = s.strip_prefix(r"\\?\") {
                return PathBuf::from(rest);
            }
        }
    }
    path.to_path_buf()
}

fn agy_missing_message() -> &'static str {
    "Antigravity CLI binary missing. Reinstall Houston or run \
     `POST /v1/antigravity/install` to download it again."
}

/// Build the argv for `agy`. Kept pure so it can be unit-tested without
/// spawning a process.
///
/// Order of flags:
/// 1. `--print` — non-interactive single-prompt mode. The CLI reads the
///    prompt from stdin and writes the final response to stdout.
/// 2. `--dangerously-skip-permissions` — auto-approve every tool call.
///    The user opted in to Houston spawning subprocesses already; the
///    CLI must not block on its own approval prompts.
/// 3. `--add-dir <cwd>` — when a working dir is set, register it with
///    the CLI's workspace so tool calls resolve relative paths against
///    the same root as the prompt context.
/// 4. `--conversation <id>` — resume the captured conversation id on
///    follow-up turns. The CLI also has `--continue` which resumes
///    "the most recent conversation"; we use the explicit `--conversation`
///    form so multi-session agents don't accidentally hijack each
///    other's history.
/// 5. `--print-timeout 30m` — extend beyond the 5-minute default so
///    long-running Gemini 3 Pro responses don't get cut off.
pub(crate) fn build_agy_args(
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
) -> Vec<OsString> {
    let mut args: Vec<OsString> = vec![
        OsString::from("--print"),
        OsString::from("--dangerously-skip-permissions"),
        OsString::from("--print-timeout"),
        OsString::from("30m"),
    ];
    if let Some(dir) = working_dir {
        args.push(OsString::from("--add-dir"));
        args.push(agy_compatible_path(dir).into_os_string());
    }
    if let Some(sid) = resume_session_id {
        args.push(OsString::from("--conversation"));
        args.push(OsString::from(sid));
    }
    args
}

/// Compose the prompt body for stdin. `agy` v1.0.0 has no `--system`
/// flag; we wrap the system prompt in XML-style tags before the user
/// prompt so Gemini 3 treats it as instructions. Same convention
/// gemini_runner uses for parity.
pub(crate) fn compose_agy_prompt(system_prompt: Option<&str>, user_prompt: &str) -> String {
    match system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        Some(sp) => format!("<system>\n{sp}\n</system>\n\n{user_prompt}"),
        None => user_prompt.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn fresh_session_uses_print_mode() {
        let args = strings(build_agy_args(None, None));
        assert!(args.iter().any(|a| a == "--print"));
        assert!(args.iter().any(|a| a == "--dangerously-skip-permissions"));
        assert!(!args.iter().any(|a| a == "--conversation"));
    }

    #[test]
    fn skip_permissions_always_present() {
        // The user opted into Houston-managed permissions; the CLI
        // must never block on its own approval prompt. Regression
        // guard against accidentally dropping this in a future flag
        // rearrangement.
        for args in [
            build_agy_args(None, None),
            build_agy_args(Some("sess"), Some(Path::new("/tmp"))),
        ] {
            let s = strings(args);
            assert!(
                s.iter().any(|a| a == "--dangerously-skip-permissions"),
                "every agy spawn must include --dangerously-skip-permissions"
            );
        }
    }

    #[test]
    fn resume_passes_conversation_id() {
        let args = strings(build_agy_args(Some("conv-abc"), None));
        let pos = args.iter().position(|a| a == "--conversation").unwrap();
        assert_eq!(args[pos + 1], "conv-abc");
    }

    #[test]
    fn working_dir_becomes_add_dir() {
        let dir = PathBuf::from("/tmp/work");
        let args = strings(build_agy_args(None, Some(&dir)));
        let pos = args.iter().position(|a| a == "--add-dir").unwrap();
        assert_eq!(args[pos + 1], "/tmp/work");
    }

    #[test]
    fn print_timeout_is_30m() {
        // Defaults to 5m upstream; raise to 30m so long Gemini 3 Pro
        // turns don't get clipped. Regression guard.
        let args = strings(build_agy_args(None, None));
        let pos = args.iter().position(|a| a == "--print-timeout").unwrap();
        assert_eq!(args[pos + 1], "30m");
    }

    #[cfg(windows)]
    #[test]
    fn windows_extended_length_prefix_stripped_from_add_dir() {
        let dir = PathBuf::from(r"\\?\C:\Users\me\agent");
        let args = strings(build_agy_args(None, Some(&dir)));
        let pos = args.iter().position(|a| a == "--add-dir").unwrap();
        assert_eq!(args[pos + 1], r"C:\Users\me\agent");
    }

    #[cfg(windows)]
    #[test]
    fn windows_extended_unc_prefix_normalized_to_add_dir() {
        let dir = PathBuf::from(r"\\?\UNC\server\share\agent");
        let args = strings(build_agy_args(None, Some(&dir)));
        let pos = args.iter().position(|a| a == "--add-dir").unwrap();
        assert_eq!(args[pos + 1], r"\\server\share\agent");
    }

    #[test]
    fn args_never_emit_fictional_flags() {
        // Regression guards against ever introducing flags upstream
        // doesn't support yet.
        let args = strings(build_agy_args(Some("x"), Some(Path::new("/tmp"))));
        assert!(!args.iter().any(|a| a == "--output-format"));
        assert!(!args.iter().any(|a| a == "--model"));
        assert!(!args.iter().any(|a| a == "--system"));
        assert!(!args.iter().any(|a| a == "--system-prompt"));
    }

    #[test]
    fn compose_prompt_passthrough_when_no_system() {
        assert_eq!(compose_agy_prompt(None, "hello"), "hello");
    }

    #[test]
    fn compose_prompt_passthrough_when_system_is_empty_or_whitespace() {
        assert_eq!(compose_agy_prompt(Some(""), "hello"), "hello");
        assert_eq!(compose_agy_prompt(Some("   \n  "), "hello"), "hello");
    }

    #[test]
    fn compose_prompt_wraps_system_in_xml_tags() {
        let composed =
            compose_agy_prompt(Some("You are a friendly assistant."), "What is 2+2?");
        assert_eq!(
            composed,
            "<system>\nYou are a friendly assistant.\n</system>\n\nWhat is 2+2?",
        );
    }

    #[test]
    fn compose_prompt_preserves_user_prompt_verbatim() {
        let user = "first line\n\nsecond paragraph\n\n```python\nprint('hi')\n```";
        let composed = compose_agy_prompt(Some("sys"), user);
        assert!(composed.ends_with(user));
    }
}
