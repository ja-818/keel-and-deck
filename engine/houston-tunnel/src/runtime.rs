//! Shared runtime state for the outbound relay tunnel.
//!
//! Engine HTTP routes read this while the tunnel task writes it. Keep it in
//! the tunnel crate so standalone engine consumers get the same status model.

use crate::identity::TunnelIdentity;
use std::sync::{Arc, RwLock, RwLockWriteGuard};

#[derive(Debug, Clone)]
pub struct TunnelRuntimeSnapshot {
    pub identity: TunnelIdentity,
    pub connected: bool,
    pub last_activity_ms: Option<i64>,
    pub connected_at_ms: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct TunnelRuntimeState {
    inner: Arc<RwLock<TunnelRuntimeSnapshot>>,
}

impl TunnelRuntimeState {
    pub fn new(identity: TunnelIdentity) -> Self {
        Self {
            inner: Arc::new(RwLock::new(TunnelRuntimeSnapshot {
                identity,
                connected: false,
                last_activity_ms: None,
                connected_at_ms: None,
            })),
        }
    }

    pub fn snapshot(&self) -> TunnelRuntimeSnapshot {
        self.inner
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn set_identity(&self, identity: TunnelIdentity) {
        let mut guard = self.write();
        guard.identity = identity;
        guard.connected = false;
        guard.last_activity_ms = None;
        guard.connected_at_ms = None;
    }

    pub fn mark_connected(&self) {
        let now = now_ms();
        let mut guard = self.write();
        guard.connected = true;
        guard.connected_at_ms = Some(now);
        guard.last_activity_ms = Some(now);
    }

    pub fn mark_activity(&self) {
        let mut guard = self.write();
        guard.last_activity_ms = Some(now_ms());
    }

    pub fn mark_disconnected(&self) {
        let mut guard = self.write();
        guard.connected = false;
    }

    fn write(&self) -> RwLockWriteGuard<'_, TunnelRuntimeSnapshot> {
        self.inner
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(id: &str) -> TunnelIdentity {
        TunnelIdentity {
            tunnel_id: id.into(),
            tunnel_token: "token".into(),
            public_host: "tunnel.test".into(),
        }
    }

    #[test]
    fn tracks_identity_and_connection_state() {
        let state = TunnelRuntimeState::new(identity("one"));
        let first = state.snapshot();
        assert_eq!(first.identity.tunnel_id, "one");
        assert!(!first.connected);

        state.mark_connected();
        assert!(state.snapshot().connected);

        state.set_identity(identity("two"));
        let second = state.snapshot();
        assert_eq!(second.identity.tunnel_id, "two");
        assert!(!second.connected);
        assert!(second.last_activity_ms.is_none());
    }
}
