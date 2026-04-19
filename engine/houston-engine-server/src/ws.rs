//! WebSocket endpoint — `/v1/ws`.
//!
//! Each connection holds:
//! - its own topic subscription set (updated via `ClientRequest::Sub/Unsub`),
//! - a bounded outbound mpsc (1024) acting as per-client backpressure buffer,
//! - a forwarder task that pulls from the server's broadcast channel, filters
//!   by topic, and feeds the mpsc with overflow handling:
//!     * low-severity `FeedItem` deltas (`AssistantTextStreaming`,
//!       `ThinkingStreaming`) are dropped silently when the queue is full,
//!     * `SessionStatus` events coalesce (latest status per topic replaces any
//!       still-pending one),
//!     * everything else bumps a dropped counter and we emit a `LagMarker`
//!       event so the client can refetch.
//!
//! Heartbeat: server pings every 20s.

use crate::state::ServerState;
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use houston_engine_protocol::{
    event_envelope, event_topic, is_low_severity_feed, lag_marker_envelope, ClientRequest,
    EngineEnvelope, EnvelopeKind,
};
use houston_ui_events::HoustonEvent;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::{mpsc, RwLock};

/// Per-connection outbound queue size. Bounded on purpose — the whole point
/// is that slow clients never balloon server memory.
const OUTBOUND_CAPACITY: usize = 1024;

/// Heartbeat interval.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(20);

pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<ServerState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<ServerState>) {
    let (mut sink, mut stream) = socket.split();
    let topics: Arc<RwLock<HashSet<String>>> = Arc::new(RwLock::new(HashSet::new()));
    let (out_tx, mut out_rx) = mpsc::channel::<String>(OUTBOUND_CAPACITY);

    // Forwarder: broadcast events → per-connection bounded queue.
    let fwd = {
        let events_rx = state.events.subscribe();
        let topics = topics.clone();
        let out_tx = out_tx.clone();
        tokio::spawn(forward_events(events_rx, topics, out_tx))
    };

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        tokio::select! {
            // Drain the outbound mpsc onto the socket.
            frame = out_rx.recv() => match frame {
                Some(f) => {
                    if sink.send(Message::Text(f)).await.is_err() {
                        break;
                    }
                }
                None => break, // forwarder hung up (broadcast closed)
            },

            // Heartbeat — ping the client.
            _ = heartbeat.tick() => {
                let ping = EngineEnvelope {
                    v: 1,
                    id: uuid::Uuid::new_v4().to_string(),
                    kind: EnvelopeKind::Ping,
                    ts: chrono::Utc::now().timestamp_millis(),
                    payload: serde_json::json!({}),
                };
                if let Ok(s) = serde_json::to_string(&ping) {
                    if sink.send(Message::Text(s)).await.is_err() {
                        break;
                    }
                }
            }

            // Incoming frames — parse sub/unsub ops.
            incoming = stream.next() => match incoming {
                Some(Ok(Message::Text(txt))) => {
                    handle_client_frame(&txt, &topics).await;
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(_)) => {} // binary/ping/pong handled by axum
                Some(Err(err)) => {
                    tracing::debug!("[ws] recv error: {err}");
                    break;
                }
            }
        }
    }

    fwd.abort();
}

/// Forwarder task: subscribes to the server-wide broadcast channel, filters by
/// this connection's topic subscriptions, applies overflow policy, and feeds
/// the connection's bounded outbound channel.
async fn forward_events(
    mut events: tokio::sync::broadcast::Receiver<HoustonEvent>,
    topics: Arc<RwLock<HashSet<String>>>,
    out_tx: mpsc::Sender<String>,
) {
    // Per-topic latest SessionStatus still waiting for mpsc room.
    // When we get a chance to push (next successful try_send), we flush them.
    let mut pending_status: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut dropped_total: u64 = 0;

    loop {
        let event = match events.recv().await {
            Ok(e) => e,
            Err(RecvError::Lagged(n)) => {
                dropped_total = dropped_total.saturating_add(n);
                if send_lag_marker(&out_tx, dropped_total).await.is_err() {
                    break;
                }
                continue;
            }
            Err(RecvError::Closed) => break,
        };

        let topic = event_topic(&event);
        let is_session_status = matches!(event, HoustonEvent::SessionStatus { .. });
        let is_low_sev = matches!(
            &event,
            HoustonEvent::FeedItem { item, .. } if is_low_severity_feed(item),
        );

        // Topic filter — skip if this connection isn't listening.
        {
            let topics = topics.read().await;
            if !topics.contains(&topic) {
                continue;
            }
        }

        let frame = match serde_json::to_string(&event_envelope(&event)) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!("[ws:fwd] serialize event failed: {err}");
                continue;
            }
        };

        match out_tx.try_send(frame) {
            Ok(()) => {
                // Flush any pending coalesced status frames we couldn't deliver
                // before. Best effort — if the queue fills again, reinsert.
                if !pending_status.is_empty() {
                    let drained: Vec<_> = pending_status.drain().collect();
                    for (t, f) in drained {
                        if let Err(mpsc::error::TrySendError::Full(f)) = out_tx.try_send(f) {
                            pending_status.insert(t, f);
                            break;
                        }
                    }
                }
            }
            Err(mpsc::error::TrySendError::Full(frame)) => {
                if is_low_sev {
                    // Streaming deltas — drop silently. Finals will follow.
                    dropped_total = dropped_total.saturating_add(1);
                    continue;
                }
                if is_session_status {
                    // Coalesce: keep only the newest pending status per topic.
                    pending_status.insert(topic, frame);
                    continue;
                }
                // Generic overflow — drop event, emit a LagMarker so the client
                // knows it missed data and can refetch via REST.
                dropped_total = dropped_total.saturating_add(1);
                if send_lag_marker(&out_tx, dropped_total).await.is_err() {
                    break;
                }
            }
            Err(mpsc::error::TrySendError::Closed(_)) => break,
        }
    }
}

/// Best-effort emit of a LagMarker. Uses `try_send` to avoid deadlocking the
/// forwarder behind a stuck writer — if the queue is full, a previous
/// LagMarker already tells the client to refetch.
async fn send_lag_marker(out_tx: &mpsc::Sender<String>, dropped: u64) -> Result<(), ()> {
    let env = lag_marker_envelope(dropped);
    let frame = serde_json::to_string(&env).map_err(|_| ())?;
    match out_tx.try_send(frame) {
        Ok(()) => Ok(()),
        Err(mpsc::error::TrySendError::Full(_)) => Ok(()), // already signaled
        Err(mpsc::error::TrySendError::Closed(_)) => Err(()),
    }
}

async fn handle_client_frame(txt: &str, topics: &RwLock<HashSet<String>>) {
    let env: EngineEnvelope = match serde_json::from_str(txt) {
        Ok(e) => e,
        Err(err) => {
            tracing::debug!("[ws] bad frame: {err}");
            return;
        }
    };
    if env.kind != EnvelopeKind::Req {
        return;
    }
    let req: ClientRequest = match serde_json::from_value(env.payload) {
        Ok(r) => r,
        Err(err) => {
            tracing::debug!("[ws] bad client req: {err}");
            return;
        }
    };
    match req {
        ClientRequest::Sub { topics: t } => {
            let mut set = topics.write().await;
            for topic in t {
                set.insert(topic);
            }
        }
        ClientRequest::Unsub { topics: t } => {
            let mut set = topics.write().await;
            for topic in t {
                set.remove(&topic);
            }
        }
    }
}
