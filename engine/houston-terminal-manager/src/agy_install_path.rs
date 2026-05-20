//! Where Houston's runtime-installed `agy` (Antigravity CLI) binary
//! lives on disk.
//!
//! Mirrors `claude_install_path.rs` so both spawn-side code (`provider`,
//! `agy_runner`) and install-side code (`houston-antigravity-installer`)
//! resolve to one absolute path. Living in `houston-terminal-manager`
//! keeps the dependency arrow `installer → terminal-manager` unidirectional;
//! the alternative (path resolver inside the installer crate) would force
//! every spawn-side caller to depend on the installer just to find the
//! binary.
//!
//! Install layout:
//! - Unix: `~/.local/bin/agy` (matches what `https://antigravity.google/cli/install.sh`
//!   writes when run manually, so a user who already ran the upstream
//!   installer gets a transparent upgrade path).
//! - Windows: `%LOCALAPPDATA%\Programs\agy\agy.exe`. We do NOT colocate
//!   with `claude.exe` because they're independent CLIs with independent
//!   version markers, and bundling them under one dir would tempt
//!   future code to share install state.

use std::path::PathBuf;

pub fn cli_path() -> PathBuf {
    install_dir().join(binary_name())
}

pub fn install_dir() -> PathBuf {
    #[cfg(unix)]
    {
        dirs::home_dir()
            .unwrap_or_default()
            .join(".local")
            .join("bin")
    }
    #[cfg(windows)]
    {
        dirs::data_local_dir()
            .unwrap_or_default()
            .join("Programs")
            .join("agy")
    }
}

pub fn binary_name() -> &'static str {
    if cfg!(windows) {
        "agy.exe"
    } else {
        "agy"
    }
}

/// True if the binary exists and is executable. Does not validate the
/// version — that's the installer lifecycle's job.
pub fn is_installed() -> bool {
    let p = cli_path();
    if !p.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(&p) {
            return meta.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_path_is_under_install_dir() {
        let cli = cli_path();
        let dir = install_dir();
        assert!(
            cli.starts_with(&dir),
            "{} not under {}",
            cli.display(),
            dir.display()
        );
    }

    #[test]
    fn binary_name_matches_platform() {
        let n = binary_name();
        if cfg!(windows) {
            assert_eq!(n, "agy.exe");
        } else {
            assert_eq!(n, "agy");
        }
    }

    #[test]
    fn install_dir_is_per_user() {
        let dir = install_dir();
        // Either under HOME on unix or under LOCALAPPDATA on Windows;
        // never a system-wide path like `/usr/bin`. Regression guard.
        let display = dir.display().to_string();
        #[cfg(unix)]
        assert!(
            display.contains(".local") || display.is_empty(),
            "unexpected unix install dir: {display}"
        );
        #[cfg(windows)]
        assert!(
            display.to_lowercase().contains("local") || display.is_empty(),
            "unexpected windows install dir: {display}"
        );
    }
}
