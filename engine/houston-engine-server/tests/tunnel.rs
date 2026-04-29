//! Integration tests for `/v1/tunnel` + device-token auth.

use houston_engine_server::{build_router, ServerConfig, ServerState};
use houston_tunnel::TunnelIdentity;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

async fn spawn() -> (SocketAddr, String, Arc<ServerState>) {
    let token = "tun-test".to_string();
    let home = tempfile::TempDir::new().unwrap();
    let docs = tempfile::TempDir::new().unwrap();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    // `new_in_memory` sets `tunnel_identity: None`, which models the
    // "first boot, relay unreachable" state — pairing should 503, device
    // tokens still authenticate, status reports disconnected.
    let state = Arc::new(ServerState::new_in_memory(cfg).await.unwrap());
    let app = build_router(state.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    std::mem::forget(home);
    std::mem::forget(docs);
    (addr, token, state)
}

async fn spawn_with_tunnel() -> (SocketAddr, String, Arc<ServerState>) {
    let token = "tun-test".to_string();
    let home = tempfile::TempDir::new().unwrap();
    let docs = tempfile::TempDir::new().unwrap();
    let cfg = ServerConfig {
        bind: "127.0.0.1:0".parse().unwrap(),
        token: token.clone(),
        home_dir: home.path().to_path_buf(),
        docs_dir: docs.path().to_path_buf(),
        app_system_prompt: String::new(),
        app_onboarding_prompt: String::new(),
        tunnel_url: "http://test.invalid".into(),
    };
    let listener = TcpListener::bind(cfg.bind).await.unwrap();
    let addr = listener.local_addr().unwrap();
    let identity = TunnelIdentity {
        tunnel_id: "tun-stable".into(),
        tunnel_token: "relay-token".into(),
        public_host: "tunnel.test".into(),
    };
    let state = Arc::new(ServerState::new(cfg, Some(identity)).await.unwrap());
    let app = build_router(state.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    std::mem::forget(home);
    std::mem::forget(docs);
    (addr, token, state)
}

#[tokio::test]
async fn status_reports_disconnected_without_config() {
    let (addr, tok, _st) = spawn().await;
    let c = reqwest::Client::new();
    let res = c
        .get(format!("http://{addr}/v1/tunnel/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["connected"], serde_json::json!(false));
    assert!(body["tunnelId"].is_null());
}

#[tokio::test]
async fn mint_pairing_503s_when_identity_not_allocated() {
    let (addr, tok, _st) = spawn().await;
    let c = reqwest::Client::new();
    let res = c
        .post(format!("http://{addr}/v1/tunnel/pairing"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 503);
}

#[tokio::test]
async fn mint_pairing_503s_until_tunnel_is_connected() {
    let (addr, tok, _st) = spawn_with_tunnel().await;
    let c = reqwest::Client::new();
    let res = c
        .post(format!("http://{addr}/v1/tunnel/pairing"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 503);
}

#[tokio::test]
async fn status_reports_current_tunnel_identity() {
    let (addr, tok, st) = spawn_with_tunnel().await;
    let c = reqwest::Client::new();

    let res = c
        .get(format!("http://{addr}/v1/tunnel/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    assert!(res.status().is_success());
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["connected"], serde_json::json!(false));
    assert_eq!(body["tunnelId"], serde_json::json!("tun-stable"));

    st.tunnel_runtime.as_ref().unwrap().mark_connected();
    let res = c
        .get(format!("http://{addr}/v1/tunnel/status"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["connected"], serde_json::json!(true));
}

#[tokio::test]
async fn pairing_code_is_stable_until_reset() {
    let (addr, tok, st) = spawn_with_tunnel().await;
    st.tunnel_runtime.as_ref().unwrap().mark_connected();
    let c = reqwest::Client::new();

    let first: serde_json::Value = c
        .post(format!("http://{addr}/v1/tunnel/pairing"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let second: serde_json::Value = c
        .post(format!("http://{addr}/v1/tunnel/pairing"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_eq!(first["code"], second["code"]);
    assert_eq!(first["accessSecret"], second["accessSecret"]);
    assert!(first["code"].as_str().unwrap().starts_with("tun-stable-"));
}

#[tokio::test]
async fn device_token_authenticates_requests() {
    // Simulate pairing happening out-of-band: insert a hashed token.
    let (addr, _bootstrap, st) = spawn().await;
    let device_token = "mobile-device-token-xxxxxxxxxxxxxxxx";
    let hash = houston_engine_server::auth::hash_hex(device_token);
    st.engine
        .db
        .insert_engine_token(&hash, "Julian's iPhone")
        .await
        .unwrap();

    let c = reqwest::Client::new();
    // Bootstrap token still works.
    let res = c
        .get(format!("http://{addr}/v1/health"))
        .bearer_auth(device_token)
        .send()
        .await
        .unwrap();
    assert!(
        res.status().is_success(),
        "device token rejected: {}",
        res.status()
    );

    // Reset-all revocation is covered by reset_access_rotates_code_and_revokes_all_devices.
}

#[tokio::test]
async fn reset_access_rotates_code_and_revokes_all_devices() {
    let (addr, tok, st) = spawn_with_tunnel().await;
    st.tunnel_runtime.as_ref().unwrap().mark_connected();
    let device_token = "will-be-revoked-token-xxxxxxxxxxxxxxxx";
    let hash = houston_engine_server::auth::hash_hex(device_token);
    st.engine
        .db
        .insert_engine_token(&hash, "Old phone")
        .await
        .unwrap();

    let c = reqwest::Client::new();
    let before: serde_json::Value = c
        .post(format!("http://{addr}/v1/tunnel/pairing"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let after: serde_json::Value = c
        .post(format!("http://{addr}/v1/tunnel/reset-access"))
        .bearer_auth(&tok)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    assert_ne!(before["code"], after["code"]);

    let res = c
        .get(format!("http://{addr}/v1/health"))
        .bearer_auth(device_token)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status().as_u16(), 401);
}
