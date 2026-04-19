//! Houston Engine wire protocol.
//!
//! Single source of truth for REST DTOs, the WebSocket envelope, error
//! codes, and the protocol version. Every client (desktop, mobile, CLI,
//! third-party) speaks this protocol to talk to `houston-engine`.

use houston_ui_events::HoustonEvent;
use serde::{Deserialize, Serialize};

/// Protocol major version. Incremented on breaking changes.
pub const PROTOCOL_VERSION: u8 = 1;

/// Engine version string (matches the server crate's package version).
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Header name for engine version on every response.
pub const HEADER_ENGINE_VERSION: &str = "X-Houston-Engine-Version";

/// Envelope for every WebSocket frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineEnvelope {
    /// Protocol version (currently 1).
    pub v: u8,
    /// Correlation id (client-chosen or server-chosen). UUID.
    pub id: String,
    /// Kind of frame.
    pub kind: EnvelopeKind,
    /// Unix epoch milliseconds when the frame was produced.
    pub ts: i64,
    /// Inner payload. Shape depends on `kind`.
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EnvelopeKind {
    /// Server-push event (payload = `HoustonEvent` or `LagMarker`).
    Event,
    /// Client → server request (payload = `ClientRequest`).
    Req,
    /// Server → client response (payload = operation-specific).
    Res,
    /// Keep-alive. Payload empty object.
    Ping,
    /// Keep-alive reply. Payload empty object.
    Pong,
}

/// Client → server WebSocket request operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ClientRequest {
    /// Subscribe to a list of topics.
    Sub { topics: Vec<String> },
    /// Unsubscribe from a list of topics.
    Unsub { topics: Vec<String> },
}

/// Emitted on the WS when the server drops events due to backpressure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LagMarker {
    pub dropped: u64,
}

/// REST error body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Unauthorized,
    Forbidden,
    NotFound,
    BadRequest,
    Conflict,
    Internal,
    Unavailable,
    VersionMismatch,
}

/// Response for `GET /v1/health`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
    pub protocol: u8,
}

/// Response for `GET /v1/version`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionResponse {
    pub engine: &'static str,
    pub protocol: u8,
    pub build: Option<String>,
}

/// Helper: build an event envelope from a HoustonEvent.
pub fn event_envelope(event: &HoustonEvent) -> EngineEnvelope {
    EngineEnvelope {
        v: PROTOCOL_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        kind: EnvelopeKind::Event,
        ts: chrono::Utc::now().timestamp_millis(),
        payload: serde_json::to_value(event).unwrap_or(serde_json::Value::Null),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_round_trip() {
        let e = EngineEnvelope {
            v: 1,
            id: "abc".into(),
            kind: EnvelopeKind::Ping,
            ts: 123,
            payload: serde_json::json!({}),
        };
        let s = serde_json::to_string(&e).unwrap();
        let d: EngineEnvelope = serde_json::from_str(&s).unwrap();
        assert_eq!(d.kind, EnvelopeKind::Ping);
    }

    #[test]
    fn error_code_serializes_screaming_snake() {
        let s = serde_json::to_string(&ErrorCode::NotFound).unwrap();
        assert_eq!(s, "\"NOT_FOUND\"");
    }

    #[test]
    fn client_request_sub() {
        let r: ClientRequest = serde_json::from_str(r#"{"op":"sub","topics":["a","b"]}"#).unwrap();
        matches!(r, ClientRequest::Sub { .. });
    }
}
