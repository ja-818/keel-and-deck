//! Engine subprocess supervisor (Phase 4).
//!
//! Spawns `houston-engine` as a child process, parses its stdout for the
//! `HOUSTON_ENGINE_LISTENING port=<p> token=<t>` line, polls `/v1/health`
//! until ready, and hands the `{baseUrl, token}` handshake back to the
//! caller so the Tauri setup can inject `window.__HOUSTON_ENGINE__` before
//! showing the webview.
//!
//! Lifecycle:
//! - Parent exit → child dies (Unix: `setpgid` + `kill(-pgrp)` on Drop;
//!   Windows: Job Objects — TODO: not yet implemented).
//! - Child crash → [`spawn_supervisor`] restarts with 1s..30s exponential
//!   backoff and emits a `houston-event` toast to the webview on each
//!   restart.
//!
//! Not Tauri-specific — the binary path, resource lookup, and webview
//! eval are all resolved by the caller. This module only owns the
//! subprocess dance.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Config discovered from the engine binary's first-line banner.
#[derive(Clone, Debug)]
pub struct EngineHandshake {
    pub port: u16,
    pub token: String,
}

impl EngineHandshake {
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

/// Managed engine subprocess. Drop to kill.
pub struct EngineSubprocess {
    child: Arc<Mutex<Option<Child>>>,
    pub handshake: EngineHandshake,
}

impl EngineSubprocess {
    /// Spawn `houston-engine` and wait up to `timeout` for the banner.
    pub fn spawn(binary: &PathBuf, timeout: Duration) -> Result<Self, String> {
        let mut cmd = Command::new(binary);
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .stdin(Stdio::null());

        #[cfg(unix)]
        unsafe {
            use std::os::unix::process::CommandExt;
            cmd.pre_exec(|| {
                // New process group — killing the parent won't orphan the child.
                libc_setpgid()
            });
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {}: {e}", binary.display()))?;

        let stdout = child.stdout.take().ok_or("no stdout from engine")?;
        let reader = BufReader::new(stdout);

        let deadline = Instant::now() + timeout;
        let mut handshake: Option<EngineHandshake> = None;
        for line in reader.lines() {
            if Instant::now() > deadline {
                let _ = child.kill();
                return Err(format!(
                    "engine did not emit banner within {timeout:?}"
                ));
            }
            let line = line.map_err(|e| format!("engine stdout: {e}"))?;
            tracing::debug!("[engine] {line}");
            if let Some(h) = parse_banner(&line) {
                handshake = Some(h);
                break;
            }
        }

        let handshake = handshake.ok_or("engine stdout closed without banner")?;
        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            handshake,
        })
    }

    /// Block the current thread waiting for the child to exit.
    /// Returns `None` if the child was already killed/reaped.
    pub fn wait(&self) -> Option<std::process::ExitStatus> {
        let mut guard = self.child.lock().ok()?;
        let child = guard.as_mut()?;
        child.wait().ok()
    }

    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                #[cfg(unix)]
                unsafe {
                    // Kill the whole process group so tokio workers + any
                    // grandchildren die with the parent.
                    let pid = child.id() as i32;
                    libc::killpg(pid, libc_sigterm());
                }
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

impl Drop for EngineSubprocess {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Resolve the `houston-engine` binary path.
///
/// Resolution order:
/// 1. `HOUSTON_ENGINE_BIN` env var (dev override).
/// 2. Tauri bundle sidecar: `<resources>/binaries/houston-engine` (optionally
///    with target-triple suffix, as produced by tauri `externalBin`).
/// 3. Cargo workspace target: `<workspace>/target/{release,debug}/houston-engine`.
pub fn resolve_engine_binary(resource_dir: Option<&PathBuf>) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("HOUSTON_ENGINE_BIN") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
    }

    if let Some(resources) = resource_dir {
        let candidates = [
            resources.join("binaries").join(bin_name_no_triple()),
            resources
                .join("binaries")
                .join(format!("{}-{}", bin_name_no_triple(), host_triple())),
        ];
        for c in candidates {
            if c.exists() {
                return Ok(c);
            }
        }
    }

    // Cargo workspace fallback — useful in `pnpm tauri dev`.
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..");
    for mode in ["release", "debug"] {
        let p = workspace_root.join("target").join(mode).join(bin_name());
        if p.exists() {
            return Ok(p);
        }
    }

    Err(format!(
        "houston-engine binary not found (resource_dir={:?})",
        resource_dir
    ))
}

fn bin_name_no_triple() -> &'static str {
    if cfg!(windows) {
        "houston-engine.exe"
    } else {
        "houston-engine"
    }
}

fn bin_name() -> &'static str {
    bin_name_no_triple()
}

/// Host target triple — best-effort. Matches the suffix tauri `externalBin`
/// uses when copying sidecars into the bundle.
fn host_triple() -> &'static str {
    // These match the triples tauri-cli emits. Extend as needed.
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    {
        "unknown-unknown-unknown"
    }
}

/// Trait the supervisor calls back on to notify the UI. Lets us keep the
/// supervisor loop free of Tauri types so the module stays testable.
pub trait SupervisorCallbacks: Send + Sync + 'static {
    /// Called whenever the engine subprocess has been (re)started with a
    /// fresh `{baseUrl, token}` handshake.
    fn on_restart(&self, handshake: &EngineHandshake);
}

/// Spawn a background thread that keeps `houston-engine` alive. On crash,
/// restarts with 1s..30s exponential backoff and invokes `cb.on_restart`.
///
/// Returns the initial [`EngineSubprocess`] so the caller can grab the
/// first handshake synchronously (needed for
/// `initializationScript` before the webview is shown).
pub fn spawn_supervisor<C: SupervisorCallbacks>(
    binary: PathBuf,
    banner_timeout: Duration,
    cb: Arc<C>,
) -> Result<Arc<Mutex<Option<EngineSubprocess>>>, String> {
    let initial = EngineSubprocess::spawn(&binary, banner_timeout)?;
    let slot: Arc<Mutex<Option<EngineSubprocess>>> = Arc::new(Mutex::new(Some(initial)));
    let slot_clone = slot.clone();

    thread::spawn(move || {
        let mut backoff = Duration::from_secs(1);
        loop {
            // Wait for current child to exit.
            let exit = {
                let guard = slot_clone.lock().ok();
                guard.and_then(|g| g.as_ref().map(|s| s.wait())).flatten()
            };

            tracing::warn!("[engine] subprocess exited: {:?}", exit);

            // Drop the exited handle.
            if let Ok(mut guard) = slot_clone.lock() {
                *guard = None;
            }

            thread::sleep(backoff);

            match EngineSubprocess::spawn(&binary, banner_timeout) {
                Ok(new) => {
                    cb.on_restart(&new.handshake);
                    if let Ok(mut guard) = slot_clone.lock() {
                        *guard = Some(new);
                    }
                    backoff = Duration::from_secs(1);
                }
                Err(e) => {
                    tracing::error!("[engine] restart failed: {e}");
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
            }
        }
    });

    Ok(slot)
}

fn parse_banner(line: &str) -> Option<EngineHandshake> {
    // Format: HOUSTON_ENGINE_LISTENING port=<p> token=<t>
    let rest = line.strip_prefix("HOUSTON_ENGINE_LISTENING ")?;
    let mut port: Option<u16> = None;
    let mut token: Option<String> = None;
    for field in rest.split_whitespace() {
        if let Some(p) = field.strip_prefix("port=") {
            port = p.parse().ok();
        } else if let Some(t) = field.strip_prefix("token=") {
            token = Some(t.to_string());
        }
    }
    Some(EngineHandshake {
        port: port?,
        token: token?,
    })
}

#[cfg(unix)]
fn libc_setpgid() -> std::io::Result<()> {
    unsafe {
        if libc::setpgid(0, 0) == -1 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}

#[cfg(unix)]
fn libc_sigterm() -> i32 {
    15
}

#[cfg(unix)]
#[allow(dead_code)]
mod libc {
    extern "C" {
        pub fn setpgid(pid: i32, pgid: i32) -> i32;
        pub fn killpg(pgrp: i32, sig: i32) -> i32;
    }
}

/// Poll `/v1/health` until a 2xx response, or timeout. Uses bearer auth.
pub fn wait_until_healthy(
    handshake: &EngineHandshake,
    timeout: Duration,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let url = format!("{}/v1/health", handshake.base_url());
    let deadline = Instant::now() + timeout;
    let mut last_err = None;
    while Instant::now() < deadline {
        match client
            .get(&url)
            .bearer_auth(&handshake.token)
            .timeout(Duration::from_secs(2))
            .send()
        {
            Ok(r) if r.status().is_success() => return Ok(()),
            Ok(r) => last_err = Some(format!("status {}", r.status())),
            Err(e) => last_err = Some(e.to_string()),
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err(format!(
        "engine health check timed out ({})",
        last_err.unwrap_or_default()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_banner() {
        let h = parse_banner("HOUSTON_ENGINE_LISTENING port=12345 token=abc").unwrap();
        assert_eq!(h.port, 12345);
        assert_eq!(h.token, "abc");
    }

    #[test]
    fn rejects_unknown_line() {
        assert!(parse_banner("hello world").is_none());
    }
}
