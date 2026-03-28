use keel_db::Database;

/// Generic application state for Keel-based Tauri apps.
/// Register with `app.manage(AppState { db })` during Tauri setup.
pub struct AppState {
    pub db: Database,
}
