//! Antigravity login flow.
//!
//! Antigravity v1.0.0 has no `agy login` subcommand — login is triggered
//! implicitly the first time the user opens the interactive TUI. The
//! upstream README documents this:
//!
//! > The CLI authenticates via the system keyring, falling back to
//! > Google Sign-In if no active session exists. Local: Automatically
//! > opens your default browser.
//!
//! Running `agy` as a child subprocess (the [`launch_login`] pattern
//! Houston uses for claude / codex) does NOT trigger the browser flow
//! because `agy` requires a TTY to render its TUI. Empirically (probed
//! against v1.0.0 on Windows): `agy --print "ping"` from a non-TTY
//! subprocess hangs silently with no auth prompt and no auth URL.
//!
//! The workaround in this module: open a fresh host-terminal window
//! and run `agy` inside it. The user completes the browser sign-in,
//! the keyring is populated, and subsequent Houston sessions
//! (`agy --print`) authenticate from the keyring.
//!
//! Per-platform:
//! - **macOS**: `osascript -e 'tell app "Terminal" to do script "<path>"'`
//!   asks Terminal.app to spawn a fresh window with the binary.
//! - **Windows**: `cmd /c start "Antigravity Login" "<path>"` opens a
//!   new console window. Windows Terminal users get a tab in their
//!   existing wt instance if `wt.exe` is the registered handler.
//! - **Linux**: no portable terminal-opener. We surface a clear error
//!   asking the user to run `agy` themselves from any terminal. Once
//!   `xdg-terminal-exec` lands in mainstream distros (FreeDesktop
//!   working draft as of 2026-05) we can swap that in.

use crate::error::{CoreError, CoreResult};
use std::path::Path;

pub async fn launch_login(cli_path: &Path) -> CoreResult<()> {
    let cli_string = cli_path.to_string_lossy().into_owned();

    #[cfg(target_os = "macos")]
    {
        // AppleScript needs the binary path embedded in a double-quoted
        // string. The path is fully-resolved (`provider::resolve()`
        // returns the absolute install path) so we don't have to worry
        // about PATH lookups inside the spawned Terminal window.
        let script = format!(
            "tell application \"Terminal\"\n\
                 activate\n\
                 do script \"{}\"\n\
             end tell",
            // Backslash-escape any embedded double quotes — install
            // paths under `~/.local/bin/` never contain them, but be
            // defensive in case the user has a custom HOME.
            cli_string.replace('"', "\\\"")
        );
        let status = tokio::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .await
            .map_err(|e| CoreError::Internal(format!("failed to spawn osascript: {e}")))?;
        if !status.success() {
            return Err(CoreError::Internal(format!(
                "osascript exited with {status}"
            )));
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // `cmd /c start ""` opens a fresh console window. The empty
        // first string is the (required) window title arg — passing
        // the binary path without that title is interpreted as the
        // title and the actual command never runs.
        let status = tokio::process::Command::new("cmd")
            .args(["/c", "start", "Antigravity Login", "/wait"])
            .arg(&cli_string)
            .status()
            .await
            .map_err(|e| CoreError::Internal(format!("failed to spawn cmd start: {e}")))?;
        if !status.success() {
            return Err(CoreError::Internal(format!(
                "cmd /c start exited with {status}"
            )));
        }
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = cli_string;
        Err(CoreError::BadRequest(
            "Antigravity login on Linux is manual today: open a terminal and \
             run `agy` once. Houston will pick up the credentials from your \
             system keyring on the next session."
                .into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    // Behavioural tests live in the per-platform integration tier — we
    // can't unit-test the subprocess spawn without actually opening a
    // terminal on the host. Keep this module's API surface stable so
    // those tests can poke at the public function once they exist.
    #[allow(dead_code)]
    fn module_compiles() {}
}
