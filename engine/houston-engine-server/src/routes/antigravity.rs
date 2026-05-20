//! `/v1/antigravity/*` REST routes — runtime installer for the
//! Antigravity CLI (`agy`).
//!
//! Mirrors `/v1/claude/*`. Antigravity ships under a proprietary
//! license so Houston can't bundle it; the binary is downloaded on
//! first launch via `houston_antigravity_installer`. These routes
//! expose status + manual reinstall trigger for the diagnostics panel
//! and the explicit "Reinstall" button in the provider card.
//!
//! Endpoints:
//!
//! - `GET  /v1/antigravity/cli-installed` — quick boolean for the UI.
//! - `GET  /v1/antigravity/status`        — richer status (path, pinned
//!   vs installed version, manifest availability) for the diagnostics
//!   panel.
//! - `POST /v1/antigravity/install`       — re-run the install flow on
//!   demand. Returns 202-style — the install runs in the background
//!   and progress events stream over the WS firehose.

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

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/antigravity/cli-installed", get(cli_installed))
        .route("/antigravity/status", get(status))
        .route("/antigravity/install", post(install))
}

#[derive(Serialize)]
struct CliInstalled {
    installed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AntigravityStatus {
    /// True iff an `agy` binary exists at the install target with the
    /// executable bit set.
    installed: bool,
    /// Absolute install target, even if the binary isn't there yet.
    install_path: String,
    /// Version pinned by the bundled `cli-deps.json`. `None` when the
    /// manifest isn't available (degraded dev environment).
    pinned_version: Option<String>,
    /// Version we last successfully installed. `None` on first boot.
    installed_version: Option<String>,
}

fn lift(e: String) -> ApiError {
    ApiError(CoreError::Internal(e))
}

async fn cli_installed(State(_st): State<Arc<ServerState>>) -> Json<CliInstalled> {
    Json(CliInstalled {
        installed: houston_antigravity_installer::is_installed(),
    })
}

async fn status(State(st): State<Arc<ServerState>>) -> Json<AntigravityStatus> {
    let installed = houston_antigravity_installer::is_installed();
    let install_path = houston_antigravity_installer::cli_path()
        .to_string_lossy()
        .to_string();

    let pinned_version = houston_cli_bundle::load_bundled_manifest()
        .and_then(|m| m.entry("antigravity").map(|e| e.version));

    let installed_version = st
        .engine
        .db
        .get_preference("antigravity_installed_version")
        .await
        .ok()
        .flatten();

    Json(AntigravityStatus {
        installed,
        install_path,
        pinned_version,
        installed_version,
    })
}

/// Trigger a fresh install in the background. The request returns
/// immediately; install progress + completion are emitted as
/// `HoustonEvent::AntigravityCliInstalling` / `AntigravityCliReady` /
/// `AntigravityCliFailed` over the WebSocket firehose.
async fn install(State(st): State<Arc<ServerState>>) -> Result<(), ApiError> {
    let manifest = houston_cli_bundle::load_bundled_manifest().ok_or_else(|| {
        lift("cli-deps.json manifest not available — install pinned manifest first".into())
    })?;
    let entry = manifest.entry("antigravity").ok_or_else(|| {
        lift("cli-deps.json missing 'antigravity' entry".into())
    })?;
    let pinned_version = entry.version.clone();

    let sink = st.engine.events.clone();
    let db = st.engine.db.clone();
    tokio::spawn(async move {
        sink.emit(houston_ui_events::HoustonEvent::AntigravityCliInstalling { progress_pct: 0 });
        let sink_for_progress = sink.clone();
        let result = houston_antigravity_installer::install(&entry, move |pct| {
            sink_for_progress
                .emit(houston_ui_events::HoustonEvent::AntigravityCliInstalling { progress_pct: pct });
        })
        .await;
        match result {
            Ok(_) => {
                if let Err(e) = db
                    .set_preference("antigravity_installed_version", &pinned_version)
                    .await
                {
                    tracing::warn!("[antigravity:install] failed to persist version marker: {e}");
                }
                sink.emit(houston_ui_events::HoustonEvent::AntigravityCliReady);
            }
            Err(e) => {
                sink.emit(houston_ui_events::HoustonEvent::AntigravityCliFailed { message: e });
            }
        }
    });

    Ok(())
}
