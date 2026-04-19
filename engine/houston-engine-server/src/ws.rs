//! WebSocket endpoint — `/v1/ws`.
//!
//! Every connection subscribes to the server's broadcast channel and
//! forwards `HoustonEvent`s wrapped in an `EngineEnvelope`. Client-side
//! `sub`/`unsub` ops currently no-op (all events flow until we add
//! per-topic filtering).

use crate::state::ServerState;
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use houston_engine_protocol::{event_envelope, EngineEnvelope, EnvelopeKind};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;

pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<ServerState>) {
    let (mut tx, mut rx) = socket.split();
    let mut events = state.events.subscribe();

    let mut heartbeat = tokio::time::interval(Duration::from_secs(20));
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut dropped: u64 = 0;

    loop {
        tokio::select! {
            // Outgoing — forward events from broadcast channel.
            recv = events.recv() => match recv {
                Ok(event) => {
                    let env = event_envelope(&event);
                    let frame = match serde_json::to_string(&env) {
                        Ok(s) => s,
                        Err(err) => {
                            tracing::warn!("[ws] serialize event failed: {err}");
                            continue;
                        }
                    };
                    if tx.send(Message::Text(frame)).await.is_err() {
                        break;
                    }
                }
                Err(RecvError::Lagged(n)) => {
                    dropped += n;
                    let lag = EngineEnvelope {
                        v: 1,
                        id: uuid::Uuid::new_v4().to_string(),
                        kind: EnvelopeKind::Event,
                        ts: chrono::Utc::now().timestamp_millis(),
                        payload: serde_json::json!({ "type": "Lag", "dropped": dropped }),
                    };
                    if let Ok(s) = serde_json::to_string(&lag) {
                        let _ = tx.send(Message::Text(s)).await;
                    }
                }
                Err(RecvError::Closed) => break,
            },

            // Heartbeat.
            _ = heartbeat.tick() => {
                let ping = EngineEnvelope {
                    v: 1,
                    id: uuid::Uuid::new_v4().to_string(),
                    kind: EnvelopeKind::Ping,
                    ts: chrono::Utc::now().timestamp_millis(),
                    payload: serde_json::json!({}),
                };
                if let Ok(s) = serde_json::to_string(&ping) {
                    if tx.send(Message::Text(s)).await.is_err() {
                        break;
                    }
                }
            }

            // Incoming — parse envelope, ignore unknown ops.
            incoming = rx.next() => match incoming {
                Some(Ok(Message::Text(txt))) => {
                    match serde_json::from_str::<EngineEnvelope>(&txt) {
                        Ok(env) => handle_client_envelope(env).await,
                        Err(err) => tracing::debug!("[ws] bad frame: {err}"),
                    }
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {} // ignore binary/ping/pong handled by axum
                Some(Err(err)) => {
                    tracing::debug!("[ws] recv error: {err}");
                    break;
                }
            }
        }
    }
}

async fn handle_client_envelope(env: EngineEnvelope) {
    // Phase 1: accept sub/unsub but ignore (no per-topic filtering yet).
    if env.kind == EnvelopeKind::Req {
        tracing::trace!("[ws] client req: {}", env.payload);
    }
}
