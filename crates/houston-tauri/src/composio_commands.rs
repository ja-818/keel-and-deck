//! Tauri commands for Composio integration.

use crate::composio::ComposioResult;
use crate::composio_auth::OAuthStarted;

#[tauri::command(rename_all = "snake_case")]
pub async fn list_composio_connections() -> ComposioResult {
    crate::composio::list_active_connections().await
}

/// Begin the OAuth flow: opens browser, returns auth URL, spawns background listener.
#[tauri::command(rename_all = "snake_case")]
pub async fn start_composio_oauth(app: tauri::AppHandle) -> Result<OAuthStarted, String> {
    crate::composio_auth::begin_oauth_flow(app).await
}

/// Re-open the browser for the current pending OAuth flow.
#[tauri::command(rename_all = "snake_case")]
pub fn reopen_composio_oauth() -> Result<(), String> {
    crate::composio_auth::reopen_oauth_browser()
}

/// List all available Composio apps (REST API with static catalog fallback).
#[tauri::command(rename_all = "snake_case")]
pub async fn list_composio_apps() -> Vec<crate::composio_apps::ComposioAppEntry> {
    crate::composio_apps::list_all_apps().await
}

/// Initiate a connection to a Composio app. Returns the redirect URL for authentication.
#[tauri::command(rename_all = "snake_case")]
pub async fn connect_composio_app(toolkit: String) -> Result<String, String> {
    crate::composio::initiate_app_connection(&toolkit).await
}

/// Complete OAuth by pasting a callback URL manually.
#[tauri::command(rename_all = "snake_case")]
pub async fn submit_composio_callback(callback_url: String) -> Result<(), String> {
    crate::composio_auth::complete_oauth_from_url(&callback_url).await
}
