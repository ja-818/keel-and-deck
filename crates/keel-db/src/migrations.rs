use crate::db::Database;
use anyhow::Result;

impl Database {
    /// Run base migrations for the generic Keel tables.
    /// Application-specific migrations should be run separately by the consuming app.
    ///
    /// ## v2 migration status
    ///
    /// Permanent tables: chat_feed, preferences (in init_tables)
    /// v1 compat tables: projects, sessions, session_events (in init_tables),
    ///   issues, issue_dependencies, channels, event_log (here)
    /// Removed (repo files deleted, tables no longer created):
    ///   routines, routine_runs, issue_feed_items, webhooks
    pub(crate) async fn run_migrations(&self) -> Result<()> {
        // -- v1 compat: issues table (apps still use via repo_issues.rs) --
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS issues (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id),
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'queue',
                tags TEXT,
                position INTEGER NOT NULL DEFAULT 0,
                session_id TEXT,
                claude_session_id TEXT,
                output_files TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            )
            .await
            .ok();

        // -- v1 compat: issue_dependencies (used by repo_issue_deps.rs) --
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS issue_dependencies (
                issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
                depends_on_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
                PRIMARY KEY (issue_id, depends_on_id)
            );",
            )
            .await
            .ok();

        // -- v1 compat: projects column migrations --
        let _ = self
            .conn()
            .execute(
                "ALTER TABLE projects ADD COLUMN pm_instructions TEXT NOT NULL DEFAULT ''",
                (),
            )
            .await;

        let _ = self
            .conn()
            .execute(
                "ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT 'rocket'",
                (),
            )
            .await;

        // -- v1 compat: event_log (DesktopClaw/Taxflow query directly) --
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS event_log (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                source_channel TEXT NOT NULL,
                source_identifier TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                session_key TEXT,
                project_id TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                summary TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                processed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_event_log_project ON event_log(project_id);
            CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
            CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);",
            )
            .await
            .ok();

        // -- v1 compat: channels (DesktopClaw/Taxflow query directly) --
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                channel_type TEXT NOT NULL,
                name TEXT NOT NULL,
                config TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'disconnected',
                enabled INTEGER NOT NULL DEFAULT 1,
                last_active_at TEXT,
                message_count INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                project_id TEXT REFERENCES projects(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            )
            .await
            .ok();

        // -- Permanent: chat_feed --
        self.conn()
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS chat_feed (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                feed_key TEXT NOT NULL DEFAULT 'main',
                feed_type TEXT NOT NULL,
                data_json TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'desktop',
                timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_feed_project_key
                ON chat_feed(project_id, feed_key);",
            )
            .await
            .ok();

        // v2 migration: add claude_session_id to chat_feed for session-keyed lookups.
        let _ = self
            .conn()
            .execute(
                "ALTER TABLE chat_feed ADD COLUMN claude_session_id TEXT",
                (),
            )
            .await;

        self.conn()
            .execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_chat_feed_session
                    ON chat_feed(claude_session_id);",
            )
            .await
            .ok();

        Ok(())
    }
}
