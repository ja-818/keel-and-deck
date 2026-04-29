//! Outbound tunnel connection to the Houston relay.
//!
//! `TunnelClient::run` dials `{relay}/e/{tunnelId}/register` over WSS,
//! loops reading frames, and dispatches:
//!   - `HttpRequest` → loopback HTTP → `HttpResponse`
//!   - `WsOpen` → loopback WS + spawned pumps → `WsOpenAck` + forwarded messages
//!   - `WsMessage { dir: c2s }` → push into the matching leg
//!   - `WsClose` → drop the leg
//!   - `PairRequest` → [`PairingService::redeem`] → `PairResponse`
//!   - `Ping` → `Pong`
//!
//! Reconnects on drop with exponential backoff up to 60s.

use crate::pairing::PairingService;
use crate::proxy::EngineEndpoint;
use crate::runtime::TunnelRuntimeState;
use std::sync::Arc;
use std::time::Duration;

mod dispatch;
mod session;

/// Heartbeat cadence: desktop sends a `Ping` frame this often. The relay
/// DO mirrors with its own ~20s heartbeat, so the aggregate "a frame
/// passes in each direction" interval is ~10-15s — enough to keep any
/// reasonable CF / intermediary idle timeout far away.
const HEARTBEAT_EVERY: Duration = Duration::from_secs(30);

/// Watchdog: if no frame (pong, ping, or anything else) has been received
/// in this window, the tunnel is dead even if the OS hasn't noticed the
/// TCP FIN. Close + reconnect.
const WATCHDOG_SILENCE: Duration = Duration::from_secs(90);

/// Internal classification of `run_once` outcomes. `Unauthorized` means
/// the relay explicitly rejected our tunnel token on the register
/// handshake (4xx auth); the outer loop triggers identity
/// re-allocation. `Other` is every transient — network blip, TLS
/// hiccup, DNS fail — handled by the normal backoff.
pub(super) enum RunError {
    Unauthorized,
    Other(anyhow::Error),
}

/// Detect whether a `tokio_tungstenite` connect error was a 401/403
/// handshake response (as opposed to a transport error). The relay
/// returns 401 when it can't verify our tunnel_token against the
/// TUNNEL_SHARED_SECRET — recoverable only via re-allocation.
pub(super) fn is_auth_failure(e: &tokio_tungstenite::tungstenite::Error) -> bool {
    use tokio_tungstenite::tungstenite::Error;
    if let Error::Http(resp) = e {
        let status = resp.status().as_u16();
        return status == 401 || status == 403;
    }
    false
}

#[derive(Clone, Debug)]
pub struct TunnelConfig {
    /// Houston home directory — holds `tunnel.json` so the client can
    /// persist / invalidate / re-allocate identity without bouncing the
    /// engine.
    pub home_dir: std::path::PathBuf,
    /// Relay base URL, e.g. `https://tunnel.gethouston.ai`. The client
    /// derives the register URL (`wss://.../e/<tunnelId>/register`)
    /// itself using the current identity.
    pub tunnel_url: String,
    /// Initial identity (loaded or allocated by `identity::ensure`). On
    /// persistent auth failure the client calls `identity::invalidate`
    /// + `identity::ensure` to mint a fresh one.
    pub identity: crate::identity::TunnelIdentity,
    /// The loopback engine this proxy fronts.
    pub endpoint: EngineEndpoint,
    /// Shared connection state read by engine HTTP status routes.
    pub runtime: TunnelRuntimeState,
}

/// Cheap clone; spawn once per process.
pub struct TunnelClient {
    cfg: tokio::sync::Mutex<TunnelConfig>,
    pairing: Arc<dyn PairingService>,
}

impl TunnelClient {
    pub fn new(cfg: TunnelConfig, pairing: Arc<dyn PairingService>) -> Self {
        Self {
            cfg: tokio::sync::Mutex::new(cfg),
            pairing,
        }
    }

    /// Long-running task. Never returns (reconnect loop). Caller should
    /// `tokio::spawn` it.
    pub async fn run(self) {
        let mut backoff_ms = 500u64;
        let mut consecutive_failures: u32 = 0;
        loop {
            let run_result = self.run_once().await;
            match run_result {
                Ok(()) => {
                    tracing::info!(target: "houston_tunnel", "tunnel closed cleanly, reconnecting");
                    backoff_ms = 500;
                    consecutive_failures = 0;
                }
                Err(RunError::Unauthorized) => {
                    tracing::warn!(
                        target: "houston_tunnel",
                        "tunnel register rejected (401/403) — invalidating cached identity, re-allocating"
                    );
                    self.reallocate_identity().await;
                    backoff_ms = 500;
                    consecutive_failures = 0;
                }
                Err(RunError::Other(e)) => {
                    consecutive_failures += 1;
                    tracing::info!(
                        target: "houston_tunnel",
                        error = %e,
                        backoff_ms,
                        consecutive_failures,
                        "tunnel dropped, retrying"
                    );
                }
            }
            self.mark_disconnected().await;
            tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            backoff_ms = (backoff_ms * 2).min(60_000);
        }
    }

    /// Delete the cached `tunnel.json` and allocate a fresh identity
    /// from the relay. Used only when the relay explicitly rejects the
    /// cached tunnel token (401/403 on register). Normal network drops,
    /// laptop sleep, and app restarts must keep the same tunnel id so
    /// already-paired phones reconnect. Logs + swallows errors — the
    /// outer reconnect loop will keep trying with whatever identity we have.
    async fn reallocate_identity(&self) {
        let mut cfg = self.cfg.lock().await;
        crate::identity::invalidate(&cfg.home_dir);
        match crate::identity::ensure(&cfg.home_dir, &cfg.tunnel_url).await {
            Ok(fresh) => {
                tracing::info!(
                    target: "houston_tunnel",
                    tunnel_id = %fresh.tunnel_id,
                    host = %fresh.public_host,
                    "allocated fresh tunnel identity"
                );
                cfg.identity = fresh.clone();
                cfg.runtime.set_identity(fresh);
            }
            Err(e) => {
                tracing::error!(
                    target: "houston_tunnel",
                    error = %e,
                    "re-allocation failed — will keep retrying with current identity"
                );
            }
        }
    }

    /// Snapshot the current identity + register URL under the mutex,
    /// then release it so the long-running read loop doesn't hold it.
    pub(super) fn register_url_for(&self, cfg: &TunnelConfig) -> Option<String> {
        let base = cfg.tunnel_url.trim_end_matches('/');
        if let Some(rest) = base.strip_prefix("https://") {
            Some(format!(
                "wss://{rest}/e/{}/register",
                cfg.identity.tunnel_id
            ))
        } else if let Some(rest) = base.strip_prefix("http://") {
            Some(format!("ws://{rest}/e/{}/register", cfg.identity.tunnel_id))
        } else {
            tracing::warn!(
                target: "houston_tunnel",
                tunnel_url = %cfg.tunnel_url,
                "unexpected scheme — expected http:// or https://"
            );
            None
        }
    }

    async fn mark_disconnected(&self) {
        let runtime = self.cfg.lock().await.runtime.clone();
        runtime.mark_disconnected();
    }
}

pub(super) fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
