//! Detect and install the Composio CLI.
//!
//! Houston's composio integration is a thin wrapper around the `composio`
//! CLI (https://composio.dev/install). We don't bundle the binary with
//! Houston because (a) it's ~80 MB per architecture, (b) the CLI has its
//! own self-update path (`composio upgrade`), and (c) Composio's install
//! script already handles platform detection and SHA-256 verification.
//!
//! This module runs Composio's official install script the first time
//! the user needs the CLI. It's a one-time step per machine.

use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

/// Absolute path to the composio binary the installer drops.
pub fn cli_path() -> PathBuf {
    home_dir().join(".composio").join("composio")
}

/// Directory that contains the composio binary + its support files.
pub fn install_dir() -> PathBuf {
    home_dir().join(".composio")
}

/// True if the CLI is present AND executable at the expected location.
pub fn is_installed() -> bool {
    let path = cli_path();
    if !path.is_file() {
        return false;
    }
    // On Unix, make sure the execute bit is actually set — a partial
    // download or aborted install would leave the file but no +x.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&path) {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Run Composio's official install script. Blocks until the CLI is in
/// place and returns the install path on success.
///
/// The script downloads the latest release tarball from
/// `github.com/ComposioHQ/composio/releases`, SHA-256-verifies it against
/// the published `checksums.txt`, and extracts to `~/.composio/`.
/// Intentionally reuses Composio's installer instead of reimplementing
/// the download/verify/extract logic — the upstream script handles
/// platform detection (darwin-x64, darwin-aarch64, linux-*) and
/// Rosetta 2 edge cases we'd otherwise have to maintain ourselves.
pub async fn install() -> Result<PathBuf, String> {
    tracing::info!("[composio:install] running install script…");

    // `curl | bash` is the documented install command on composio.dev.
    // We shell out to `bash -c` so `set -euo pipefail` in the script
    // still takes effect. stdin is closed so the script can't prompt.
    let output = Command::new("bash")
        .arg("-c")
        .arg("curl -fsSL https://composio.dev/install | bash")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to spawn install script: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    tracing::debug!("[composio:install] stdout: {}", stdout);
    tracing::debug!("[composio:install] stderr: {}", stderr);

    if !output.status.success() {
        return Err(format!(
            "Composio install script failed (exit {}): {}",
            output.status,
            stderr.trim()
        ));
    }

    if !is_installed() {
        return Err(format!(
            "Install script completed but no binary at {}",
            cli_path().display()
        ));
    }

    tracing::info!("[composio:install] installed at {}", cli_path().display());
    Ok(cli_path())
}

fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
}
