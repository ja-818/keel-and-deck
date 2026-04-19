//! Server configuration — loaded from env vars, overridable on the CLI.

use rand::{distributions::Alphanumeric, Rng};
use std::net::SocketAddr;
use std::path::PathBuf;

/// Resolved server configuration.
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Address to bind. Default `127.0.0.1:0` (random local port).
    pub bind: SocketAddr,
    /// Bearer token clients must send. Auto-generated if `HOUSTON_ENGINE_TOKEN` unset.
    pub token: String,
    /// Houston home directory (`~/.houston` by default). Holds `engine.json`.
    pub home_dir: PathBuf,
    /// Houston docs directory (`~/Documents/Houston` by default).
    pub docs_dir: PathBuf,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let bind: SocketAddr = std::env::var("HOUSTON_BIND")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(|| "127.0.0.1:0".parse().unwrap());

        if bind.ip().is_unspecified() && std::env::var("HOUSTON_BIND_ALL").ok().as_deref() != Some("1") {
            panic!("Refusing to bind 0.0.0.0 without HOUSTON_BIND_ALL=1");
        }

        let token = std::env::var("HOUSTON_ENGINE_TOKEN").unwrap_or_else(|_| gen_token());

        let home_dir = std::env::var("HOUSTON_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs_home()
                    .map(|h| h.join(".houston"))
                    .expect("no home directory")
            });

        let docs_dir = std::env::var("HOUSTON_DOCS")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs_home()
                    .map(|h| h.join("Documents").join("Houston"))
                    .expect("no home directory")
            });

        Self { bind, token, home_dir, docs_dir }
    }
}

fn gen_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(48)
        .map(char::from)
        .collect()
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
