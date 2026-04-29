//! Durable phone access secret + device-token minting.
//!
//! The QR code is stable until the user explicitly resets phone access. Each
//! successful scan mints a fresh device token; the QR secret itself is only
//! used for token exchange, not for normal engine requests.

use async_trait::async_trait;
use houston_db::{Database, PhoneAccessRow};
use houston_tunnel::{PairError, PairOutcome, PairingService};
use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::auth::hash_hex;

const ACCESS_SECRET_LEN: usize = 64;
const DEVICE_TOKEN_LEN: usize = 48;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneAccessCode {
    pub code: String,
    pub access_secret: String,
    pub rotated_at: String,
}

#[derive(Clone)]
pub struct MobileAccessStore {
    inner: Arc<Inner>,
}

struct Inner {
    db: Database,
    lock: Mutex<()>,
}

impl MobileAccessStore {
    pub fn new(db: Database) -> Self {
        Self {
            inner: Arc::new(Inner {
                db,
                lock: Mutex::new(()),
            }),
        }
    }

    pub async fn pairing_code(&self, tunnel_id: &str) -> Result<PhoneAccessCode, PairError> {
        let _guard = self.inner.lock.lock().await;
        let row = self.current_or_create().await?;
        Ok(code_from_row(tunnel_id, row))
    }

    pub async fn reset_access(&self, tunnel_id: &str) -> Result<PhoneAccessCode, PairError> {
        let _guard = self.inner.lock.lock().await;
        let row = self
            .inner
            .db
            .rotate_phone_access_and_revoke_tokens(&random_secret(ACCESS_SECRET_LEN))
            .await
            .map_err(|e| PairError::Internal(e.to_string()))?;
        Ok(code_from_row(tunnel_id, row))
    }

    async fn current_or_create(&self) -> Result<PhoneAccessRow, PairError> {
        if let Some(row) = self
            .inner
            .db
            .load_phone_access()
            .await
            .map_err(|e| PairError::Internal(e.to_string()))?
        {
            return Ok(row);
        }
        self.inner
            .db
            .replace_phone_access_secret(&random_secret(ACCESS_SECRET_LEN))
            .await
            .map_err(|e| PairError::Internal(e.to_string()))
    }
}

#[async_trait]
impl PairingService for MobileAccessStore {
    async fn redeem(&self, code: &str, device_label: &str) -> Result<PairOutcome, PairError> {
        let _guard = self.inner.lock.lock().await;
        let row = self.current_or_create().await?;
        if !constant_time_eq(code.as_bytes(), row.access_secret.as_bytes()) {
            return Err(PairError::UnknownCode);
        }

        let token = random_secret(DEVICE_TOKEN_LEN);
        let hash = hash_hex(&token);
        self.inner
            .db
            .insert_engine_token(&hash, device_label)
            .await
            .map_err(|e| PairError::Internal(e.to_string()))?;

        Ok(PairOutcome {
            engine_token: token,
        })
    }
}

fn code_from_row(tunnel_id: &str, row: PhoneAccessRow) -> PhoneAccessCode {
    PhoneAccessCode {
        code: format!("{}-{}", tunnel_id, row.access_secret),
        access_secret: row.access_secret,
        rotated_at: row.rotated_at,
    }
}

fn random_secret(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn pairing_code_is_stable_until_reset() {
        let db = Database::connect_in_memory().await.unwrap();
        let store = MobileAccessStore::new(db);

        let first = store.pairing_code("tun").await.unwrap();
        let second = store.pairing_code("tun").await.unwrap();
        assert_eq!(first.code, second.code);

        let reset = store.reset_access("tun").await.unwrap();
        assert_ne!(first.code, reset.code);
    }

    #[tokio::test]
    async fn redeem_mints_live_device_token() {
        let db = Database::connect_in_memory().await.unwrap();
        let store = MobileAccessStore::new(db.clone());
        let code = store.pairing_code("tun").await.unwrap();

        let out = store
            .redeem(&code.access_secret, "Julian's iPhone")
            .await
            .unwrap();
        let hash = hash_hex(&out.engine_token);
        assert_eq!(
            db.touch_engine_token(&hash).await.unwrap().as_deref(),
            Some("Julian's iPhone")
        );
    }

    #[tokio::test]
    async fn reset_revokes_previous_device_tokens() {
        let db = Database::connect_in_memory().await.unwrap();
        let store = MobileAccessStore::new(db.clone());
        let code = store.pairing_code("tun").await.unwrap();
        let out = store.redeem(&code.access_secret, "iPhone").await.unwrap();
        let hash = hash_hex(&out.engine_token);
        assert!(db.touch_engine_token(&hash).await.unwrap().is_some());

        store.reset_access("tun").await.unwrap();
        assert!(db.touch_engine_token(&hash).await.unwrap().is_none());
    }
}
