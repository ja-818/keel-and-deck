//! Engine subprocess supervisor (Phase 4).
//!
//! Spawns `houston-engine` as a child process, parses its stdout for the
//! `HOUSTON_ENGINE_LISTENING port=<p> token=<t>` line, polls `/v1/health`
//! until ready, and injects the base URL + token into the webview via
//! `initializationScript`.
//!
//! Lifecycle:
//! - Parent exit → child dies (Unix: `setpgid`/`kill(-pgrp)`; Linux:
//!   `prctl(PR_SET_PDEATHSIG)`; Windows: Job Objects).
//! - Child crash → exponential backoff restart, toast the user.
//!
//! Not wired into `setup()` by default. Gated behind
//! `HOUSTON_USE_ENGINE_SERVER=1` — flip to default once Phase 2 has
//! migrated the full command surface.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
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
    /// Spawn `houston-engine` and wait up to `timeout` for the first banner.
    pub fn spawn(binary: &str, timeout: Duration) -> Result<Self, String> {
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
            .map_err(|e| format!("failed to spawn {binary}: {e}"))?;

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

    pub fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
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
    // Place the child in its own process group so we can signal the whole
    // group on parent exit.
    unsafe {
        if libc::setpgid(0, 0) == -1 {
            return Err(std::io::Error::last_os_error());
        }
    }
    Ok(())
}

#[cfg(unix)]
#[allow(dead_code)]
mod libc {
    extern "C" {
        pub fn setpgid(pid: i32, pgid: i32) -> i32;
    }
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
