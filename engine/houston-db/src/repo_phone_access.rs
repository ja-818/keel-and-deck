//! Persistent phone-access secret.
//!
//! This is the reusable secret encoded into the desktop QR. It is stored
//! locally because the product wants "scan the same QR again later" behavior.
//! Device request tokens are still separate rows in `engine_tokens` and are
//! revoked when this secret rotates.

use crate::db::Database;
use anyhow::{anyhow, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PhoneAccessRow {
    pub access_secret: String,
    pub created_at: String,
    pub rotated_at: String,
}

impl Database {
    pub async fn load_phone_access(&self) -> Result<Option<PhoneAccessRow>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT access_secret, created_at, rotated_at
                 FROM phone_access WHERE id = 1",
                libsql::params![],
            )
            .await?;

        let Some(row) = rows.next().await? else {
            return Ok(None);
        };

        Ok(Some(PhoneAccessRow {
            access_secret: row.get(0)?,
            created_at: row.get(1)?,
            rotated_at: row.get(2)?,
        }))
    }

    pub async fn replace_phone_access_secret(&self, access_secret: &str) -> Result<PhoneAccessRow> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "INSERT INTO phone_access (id, access_secret, created_at, rotated_at)
                 VALUES (1, ?1, ?2, ?2)
                 ON CONFLICT(id) DO UPDATE SET
                    access_secret = excluded.access_secret,
                    rotated_at = excluded.rotated_at",
                libsql::params![access_secret.to_string(), now],
            )
            .await?;

        self.load_phone_access()
            .await?
            .ok_or_else(|| anyhow!("phone_access row missing after replace"))
    }

    pub async fn rotate_phone_access_and_revoke_tokens(
        &self,
        access_secret: &str,
    ) -> Result<PhoneAccessRow> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn().execute_batch("BEGIN IMMEDIATE;").await?;

        let result: Result<()> = async {
            self.conn()
                .execute(
                    "UPDATE engine_tokens SET revoked_at = ?1
                     WHERE revoked_at IS NULL",
                    libsql::params![now.clone()],
                )
                .await?;
            self.conn()
                .execute(
                    "INSERT INTO phone_access (id, access_secret, created_at, rotated_at)
                     VALUES (1, ?1, ?2, ?2)
                     ON CONFLICT(id) DO UPDATE SET
                        access_secret = excluded.access_secret,
                        rotated_at = excluded.rotated_at",
                    libsql::params![access_secret.to_string(), now],
                )
                .await?;
            Ok(())
        }
        .await;

        match result {
            Ok(()) => {
                self.conn().execute_batch("COMMIT;").await?;
            }
            Err(e) => {
                if let Err(rollback_err) = self.conn().execute_batch("ROLLBACK;").await {
                    tracing::warn!(error = %rollback_err, "phone access rollback failed");
                }
                return Err(e);
            }
        }

        self.load_phone_access()
            .await?
            .ok_or_else(|| anyhow!("phone_access row missing after rotate"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn replace_creates_then_rotates_secret() {
        let db = Database::connect_in_memory().await.unwrap();
        assert!(db.load_phone_access().await.unwrap().is_none());

        let first = db.replace_phone_access_secret("secret-a").await.unwrap();
        assert_eq!(first.access_secret, "secret-a");
        assert_eq!(first.created_at, first.rotated_at);

        let second = db.replace_phone_access_secret("secret-b").await.unwrap();
        assert_eq!(second.access_secret, "secret-b");
        assert_eq!(second.created_at, first.created_at);
        assert_ne!(second.rotated_at, "");
    }

    #[tokio::test]
    async fn rotate_revokes_existing_tokens_atomically() {
        let db = Database::connect_in_memory().await.unwrap();
        db.insert_engine_token("hash-a", "phone-a").await.unwrap();
        db.insert_engine_token("hash-b", "phone-b").await.unwrap();

        let row = db
            .rotate_phone_access_and_revoke_tokens("secret-c")
            .await
            .unwrap();

        assert_eq!(row.access_secret, "secret-c");
        assert!(db.touch_engine_token("hash-a").await.unwrap().is_none());
        assert!(db.touch_engine_token("hash-b").await.unwrap().is_none());
    }
}
