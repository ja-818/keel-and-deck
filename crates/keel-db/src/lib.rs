//! keel-db — SQLite database layer for AI agent desktop apps.
//!
//! Provides local SQLite database setup (via libsql), base table migrations,
//! and repository functions for projects, issues, and feed items.
//!
//! ## v2 migration status
//!
//! Many tables and repos are deprecated in favor of file-based workspace storage
//! (.keel/ directory). They remain for backward compatibility while apps migrate
//! to `keel_tauri::workspace_store`.
//!
//! **Kept (permanent):** chat_feed, preferences
//! **Kept (v1 compat):** projects, issues, issue_dependencies, issue_types, models

pub mod db;
mod migrations;

// -- Permanent modules --
pub mod repo_chat_feed;

// -- v1 compat: will be removed when apps migrate to workspace_store --
pub mod issue_types;
pub mod models;
pub mod repo_issue_deps;
pub mod repo_issues;
pub mod repo_issues_update;
pub mod repo_projects;

// Re-export key types for convenience.
pub use db::Database;
pub use issue_types::IssueStatus;
pub use models::{Issue, Project, Session, SessionEvent};
// v1 compat: Routine/RoutineRun kept in models.rs but no longer re-exported
// (no app imports them from keel-db; Houston defines its own)
pub use repo_chat_feed::ChatFeedRow;
