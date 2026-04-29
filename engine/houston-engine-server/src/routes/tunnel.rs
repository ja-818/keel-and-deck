//! `/v1/tunnel` — pairing + status + device-token management.
//!
//! - `GET  /v1/tunnel/status`                        current connection
//! - `POST /v1/tunnel/pairing`                       return stable QR code
//! - `POST /v1/tunnel/reset-access`                  rotate QR + revoke phones

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use houston_engine_core::CoreError;
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub connected: bool,
    pub tunnel_id: Option<String>,
    pub public_host: Option<String>,
    pub last_activity_ms: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCode {
    /// Full code mobile should POST to `/pair/` on the relay:
    /// `<tunnelId>-<accessSecret>`. Never expose the raw access secret alone.
    pub code: String,
    pub access_secret: String,
    pub rotated_at: String,
}

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/tunnel/status", get(status))
        .route("/tunnel/pairing", post(mint_pairing))
        .route("/tunnel/reset-access", post(reset_access))
}

async fn status(State(st): State<Arc<ServerState>>) -> Json<TunnelStatus> {
    let Some(runtime) = &st.tunnel_runtime else {
        return Json(TunnelStatus {
            connected: false,
            tunnel_id: None,
            public_host: None,
            last_activity_ms: None,
        });
    };
    let snapshot = runtime.snapshot();
    Json(TunnelStatus {
        connected: snapshot.connected,
        tunnel_id: Some(snapshot.identity.tunnel_id),
        public_host: Some(snapshot.identity.public_host),
        last_activity_ms: snapshot.last_activity_ms,
    })
}

async fn mint_pairing(State(st): State<Arc<ServerState>>) -> Result<Json<PairingCode>, ApiError> {
    let Some(runtime) = &st.tunnel_runtime else {
        return Err(ApiError(CoreError::Unavailable(
            "Tunnel allocation hasn't completed yet. The engine's first boot needs network to reach the Houston relay, then pairing becomes available on the next restart.".into(),
        )));
    };
    let snapshot = runtime.snapshot();
    if !snapshot.connected {
        return Err(ApiError(CoreError::Unavailable(
            "Phone access is still connecting. Keep Houston open and try again in a moment.".into(),
        )));
    }
    let code = st
        .mobile_access
        .pairing_code(&snapshot.identity.tunnel_id)
        .await
        .map_err(pairing_error)?;
    Ok(Json(PairingCode {
        code: code.code,
        access_secret: code.access_secret,
        rotated_at: code.rotated_at,
    }))
}

async fn reset_access(State(st): State<Arc<ServerState>>) -> Result<Json<PairingCode>, ApiError> {
    let Some(runtime) = &st.tunnel_runtime else {
        return Err(ApiError(CoreError::Unavailable(
            "Tunnel allocation hasn't completed yet. Restart Houston with an internet connection before resetting phone access.".into(),
        )));
    };
    let snapshot = runtime.snapshot();
    let code = st
        .mobile_access
        .reset_access(&snapshot.identity.tunnel_id)
        .await
        .map_err(pairing_error)?;
    Ok(Json(PairingCode {
        code: code.code,
        access_secret: code.access_secret,
        rotated_at: code.rotated_at,
    }))
}

fn pairing_error(err: houston_tunnel::PairError) -> ApiError {
    ApiError(CoreError::Internal(err.to_string()))
}
