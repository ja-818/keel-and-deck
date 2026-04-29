//! Phone access secret ↔ device-token exchange.
//!
//! The engine owns a durable high-entropy access secret. Desktop encodes
//! `<tunnelId>-<secret>` in the QR. When mobile POSTs that QR payload to the
//! relay, the relay forwards the secret over the tunnel; the engine's
//! [`PairingService`] is responsible for:
//!
//! 1. verifying the secret still matches current phone access
//! 2. minting a fresh bearer token
//! 3. hashing + inserting into `engine_tokens` via the DB
//! 4. returning the plaintext token in the [`PairResponseFrame`]
//!
//! `PairingService` is a trait so we can swap the implementation in
//! tests (no real DB, no real RNG).

use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct PairOutcome {
    pub engine_token: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PairError {
    #[error("unknown phone access code")]
    UnknownCode,
    #[error("internal: {0}")]
    Internal(String),
}

impl PairError {
    /// Stable wire code. Must stay in sync with
    /// `houston-relay/src/types.ts::PairErrorCode` and mobile's
    /// `friendlyError` mapping.
    pub fn code(&self) -> &'static str {
        match self {
            PairError::UnknownCode => "code_unknown",
            PairError::Internal(_) => "internal",
        }
    }
}

#[async_trait]
pub trait PairingService: Send + Sync + 'static {
    /// Redeem a phone access secret and return a request bearer.
    async fn redeem(&self, code: &str, device_label: &str) -> Result<PairOutcome, PairError>;
}

#[cfg(test)]
pub mod test_util {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    /// Test stub: `add_code` inserts a known code → token mapping.
    #[derive(Default)]
    pub struct StubPairingService {
        codes: Mutex<HashMap<String, String>>,
    }

    impl StubPairingService {
        pub fn add_code(&self, code: &str, mints: &str) {
            self.codes.lock().unwrap().insert(code.into(), mints.into());
        }
    }

    #[async_trait]
    impl PairingService for StubPairingService {
        async fn redeem(&self, code: &str, _device_label: &str) -> Result<PairOutcome, PairError> {
            let g = self.codes.lock().unwrap();
            match g.get(code) {
                None => Err(PairError::UnknownCode),
                Some(tok) => Ok(PairOutcome {
                    engine_token: tok.clone(),
                }),
            }
        }
    }

    #[tokio::test]
    async fn stub_round_trip() {
        let svc = StubPairingService::default();
        svc.add_code("abc", "tok-123");
        let r = svc.redeem("abc", "iPhone").await.unwrap();
        assert_eq!(r.engine_token, "tok-123");
        assert_eq!(
            svc.redeem("abc", "iPhone").await.unwrap().engine_token,
            "tok-123"
        );
        matches!(
            svc.redeem("nope", "iPhone").await.unwrap_err(),
            PairError::UnknownCode
        );
    }
}
