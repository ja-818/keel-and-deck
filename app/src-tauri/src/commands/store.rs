use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const STORE_API: &str = "https://store.gethouston.ai/api";

#[derive(Serialize, Deserialize, Clone)]
pub struct StoreListing {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub author: String,
    pub tags: Vec<String>,
    pub icon_url: String,
    pub repo: String,
    pub installs: i64,
    pub registered_at: String,
}

#[derive(Deserialize)]
struct CatalogResponse {
    agents: Vec<StoreListing>,
}

fn agents_dir() -> PathBuf {
    let home = dirs::home_dir().expect("No home directory found");
    home.join(".houston").join("agents")
}

#[tauri::command(rename_all = "snake_case")]
pub async fn fetch_store_catalog() -> Result<Vec<StoreListing>, String> {
    let url = format!("{STORE_API}/catalog");
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to fetch store catalog: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Store API returned {}", resp.status()));
    }

    let body = resp
        .json::<CatalogResponse>()
        .await
        .map_err(|e| format!("Failed to parse store catalog: {e}"))?;
    Ok(body.agents)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn search_store(query: String) -> Result<Vec<StoreListing>, String> {
    let url = format!("{STORE_API}/search?q={}", urlencoded(&query));
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| format!("Failed to search store: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Store API returned {}", resp.status()));
    }

    let body = resp
        .json::<CatalogResponse>()
        .await
        .map_err(|e| format!("Failed to parse search results: {e}"))?;
    Ok(body.agents)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn install_store_agent(
    repo: String,
    agent_id: String,
) -> Result<(), String> {
    let dir = agents_dir().join(&agent_id);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create agent directory: {e}"))?;

    // Fetch houston.json from GitHub
    let config_url = format!(
        "https://raw.githubusercontent.com/{repo}/main/houston.json"
    );
    let config_resp = reqwest::get(&config_url)
        .await
        .map_err(|e| format!("Failed to fetch houston.json: {e}"))?;

    if !config_resp.status().is_success() {
        return Err(format!(
            "Failed to fetch houston.json ({})",
            config_resp.status()
        ));
    }

    let config_bytes = config_resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read houston.json: {e}"))?;
    fs::write(dir.join("houston.json"), &config_bytes)
        .map_err(|e| format!("Failed to save houston.json: {e}"))?;

    // Fetch icon.png (optional, don't fail if missing)
    let icon_url = format!(
        "https://raw.githubusercontent.com/{repo}/main/icon.png"
    );
    if let Ok(icon_resp) = reqwest::get(&icon_url).await {
        if icon_resp.status().is_success() {
            if let Ok(icon_bytes) = icon_resp.bytes().await {
                let _ = fs::write(dir.join("icon.png"), &icon_bytes);
            }
        }
    }

    // Fire-and-forget: notify registry of install
    let install_url = format!(
        "{STORE_API}/agents/{}/install",
        urlencoded(&agent_id)
    );
    let client = reqwest::Client::new();
    let _ = client.post(&install_url).send().await;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn uninstall_store_agent(agent_id: String) -> Result<(), String> {
    let dir = agents_dir().join(&agent_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)
            .map_err(|e| format!("Failed to remove agent: {e}"))?;
    }
    Ok(())
}

/// Simple percent-encoding for query parameters.
fn urlencoded(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9'
            | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push('+'),
            _ => {
                out.push('%');
                out.push(char::from(HEX[(b >> 4) as usize]));
                out.push(char::from(HEX[(b & 0x0f) as usize]));
            }
        }
    }
    out
}

const HEX: [u8; 16] = *b"0123456789ABCDEF";
