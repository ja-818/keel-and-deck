//! CRUD for `engine_tokens`. Device-scoped bearer tokens minted during
//! pairing.
//!
//! Plaintext tokens NEVER hit disk. Callers hash with SHA-256 and pass the
//! hex digest. `verify_token` does the same on the inbound request path —
//! constant-time comparison happens in the caller (auth middleware).

use crate::db::Database;
use anyhow::Result;

impl Database {
    /// Mint a new token. Caller pre-hashes with SHA-256 (hex). Duplicate
    /// hash is an error (pairing should always generate fresh entropy).
    pub async fn insert_engine_token(&self, token_hash: &str, device_label: &str) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "INSERT INTO engine_tokens (token_hash, device_label, created_at)
                 VALUES (?1, ?2, ?3)",
                libsql::params![token_hash.to_string(), device_label.to_string(), now,],
            )
            .await?;
        Ok(())
    }

    /// Check whether a hashed token is live (exists + not revoked).
    /// Updates `last_seen_at` on a hit. Returns the device label for logs.
    pub async fn touch_engine_token(&self, token_hash: &str) -> Result<Option<String>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT device_label FROM engine_tokens
                 WHERE token_hash = ?1 AND revoked_at IS NULL",
                libsql::params![token_hash.to_string()],
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };
        let device_label: String = row.get(0)?;

        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "UPDATE engine_tokens SET last_seen_at = ?1 WHERE token_hash = ?2",
                libsql::params![now, token_hash.to_string()],
            )
            .await?;
        Ok(Some(device_label))
    }

    /// Revoke every live phone token. Used by the product-level
    /// "Disconnect all phones" control.
    pub async fn revoke_all_engine_tokens(&self) -> Result<u64> {
        let now = chrono::Utc::now().to_rfc3339();
        let affected = self
            .conn()
            .execute(
                "UPDATE engine_tokens SET revoked_at = ?1
                 WHERE revoked_at IS NULL",
                libsql::params![now],
            )
            .await?;
        Ok(affected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn insert_and_touch_roundtrip() {
        let db = Database::connect_in_memory().await.unwrap();
        db.insert_engine_token("hash-a", "Julian's iPhone")
            .await
            .unwrap();

        let label = db.touch_engine_token("hash-a").await.unwrap();
        assert_eq!(label.as_deref(), Some("Julian's iPhone"));

        // Unknown hash → None.
        assert!(db.touch_engine_token("nope").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn revoke_all_marks_every_live_token() {
        let db = Database::connect_in_memory().await.unwrap();
        db.insert_engine_token("hash-e", "phone-1").await.unwrap();
        db.insert_engine_token("hash-f", "phone-2").await.unwrap();

        let affected = db.revoke_all_engine_tokens().await.unwrap();
        assert_eq!(affected, 2);
        assert!(db.touch_engine_token("hash-e").await.unwrap().is_none());
        assert!(db.touch_engine_token("hash-f").await.unwrap().is_none());
    }
}
