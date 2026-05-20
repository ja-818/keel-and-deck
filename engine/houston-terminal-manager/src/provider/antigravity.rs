//! Antigravity provider adapter — Google's `agy` CLI.
//!
//! Antigravity 2.0 launched on 2026-05-19 as Google's successor to the
//! Gemini CLI. The `agy` binary is brand-new (v1.0.0 at the time of this
//! integration) and the surface is intentionally minimal — see
//! `agy --help` for the canonical flag list. Notable gaps Houston has to
//! work around:
//!
//! - **No structured streaming output**: there is no `--output-format` /
//!   `stream-json` flag yet. `agy --print` returns the final response
//!   as plain text on stdout. Houston's [`crate::agy_runner`] therefore
//!   emits a single `assistant_text` FeedItem rather than the partial-
//!   delta stream we get from Claude/Codex/Gemini. When upstream adds
//!   streaming, plug it into the same runner module.
//! - **No `--model` flag**: the CLI uses Antigravity's default Gemini 3
//!   Pro. Any caller-supplied `model` is currently ignored (and logged
//!   so we notice when upstream catches up).
//! - **No CLI-driven login / logout**: per the upstream README, the CLI
//!   "authenticates via the system keyring, falling back to Google
//!   Sign-In if no active session exists. Local: Automatically opens
//!   your default browser. Sign Out: Run /logout to clear saved
//!   credentials." Both `/logout` and the implicit login live inside
//!   the TUI. [`Self::login_args`] / [`Self::logout_args`] therefore
//!   return `None`, and `houston_engine_core::provider::launch_login`
//!   special-cases `"antigravity"` to spawn the TUI in a host terminal
//!   (mirroring how it special-cases `"gemini"` for the ACP-driven
//!   OAuth dance).
//! - **No file-based auth marker**: credentials live in the host OS
//!   keyring (Windows Credential Manager / macOS Keychain / Linux
//!   Secret Service). Houston has no portable way to peek at the
//!   keyring from inside an axum request handler, so [`Self::probe_auth`]
//!   returns `Unknown` and the engine shows a "Connect" button until
//!   the user runs a session that succeeds. When that session
//!   completes the provider flips to `Authenticated` via the normal
//!   completion path.
//!
//! Pinned upstream: agy **v1.0.0** (matches `cli-deps.json#antigravity`).

use super::resolve::{which_on_path, InstallSource};
use super::{ProbeFuture, ProviderAdapter};
use crate::agy_install_path;
use crate::provider_auth::ProviderAuthState;
use crate::provider_error_kind::ProviderError;
use std::path::{Path, PathBuf};

mod classify;

pub(super) struct AntigravityAdapter;

pub(super) static ANTIGRAVITY: AntigravityAdapter = AntigravityAdapter;

impl ProviderAdapter for AntigravityAdapter {
    fn id(&self) -> &'static str {
        "antigravity"
    }

    fn cli_name(&self) -> &'static str {
        "agy"
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["agy"]
    }

    fn resolve(&self) -> (InstallSource, Option<PathBuf>) {
        if agy_install_path::is_installed() {
            return (InstallSource::Managed, Some(agy_install_path::cli_path()));
        }
        if let Some(path) = which_on_path("agy") {
            return (InstallSource::Path, Some(path));
        }
        (InstallSource::Missing, None)
    }

    fn probe_auth<'a>(&'a self, _cli_path: &'a Path) -> ProbeFuture<'a> {
        // Auth state lives in the host OS keyring (see module-level
        // doc). Returning `Unknown` keeps the UI honest — the user
        // sees a "Connect" button until a real session confirms the
        // credentials by working. When Google ships a non-interactive
        // status subcommand we can replace this with a 2-second probe;
        // until then we don't want to spawn the CLI on every status
        // poll.
        Box::pin(async move { ProviderAuthState::Unknown })
    }

    fn login_args(&self) -> Option<&'static [&'static str]> {
        // `agy` has no top-level `login` subcommand (verified against
        // `agy --help` for v1.0.0). The interactive TUI auto-triggers
        // Google Sign-In in the browser on first use. The engine's
        // `launch_login` special-cases `"antigravity"` to spawn the
        // TUI in a host terminal.
        None
    }

    fn logout_args(&self) -> Option<&'static [&'static str]> {
        // Logout is the `/logout` slash command inside the TUI — there's
        // no top-level subcommand to run non-interactively.
        None
    }

    fn classify_stderr(&self, line: &str) -> Option<ProviderError> {
        classify::classify_stderr(line)
    }

    fn classify_result_error(
        &self,
        error_type: &str,
        error_message: &str,
    ) -> Option<ProviderError> {
        classify::classify_result_error(error_type, error_message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_metadata() {
        let a = AntigravityAdapter;
        assert_eq!(a.id(), "antigravity");
        assert_eq!(a.cli_name(), "agy");
        assert!(a.aliases().contains(&"agy"));
        assert!(a.login_args().is_none());
        assert!(a.logout_args().is_none());
    }

    #[tokio::test]
    async fn probe_auth_returns_unknown_until_keyring_introspection_lands() {
        // v1 deliberately returns Unknown — see module doc. This test
        // guards against accidentally promoting the placeholder to a
        // confident Authenticated/Unauthenticated without wiring up
        // real keyring access.
        let a = AntigravityAdapter;
        let state = a.probe_auth(Path::new("/does/not/exist")).await;
        assert_eq!(state, ProviderAuthState::Unknown);
    }
}
