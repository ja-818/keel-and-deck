//! Fetch all available Composio apps by scraping the public composio.dev/toolkits page.
//!
//! The page embeds the full toolkit catalog as Next.js SSR data in the HTML. We locate
//! the `initialToolkits` JSON, unescape the JS string encoding, and parse it with serde_json.
//! Public page — no auth required. Returns empty vec on any failure.

use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

const TOOLKITS_URL: &str = "https://composio.dev/toolkits";
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposioAppEntry {
    pub toolkit: String,
    pub name: String,
    pub description: String,
    pub logo_url: String,
}

static CATALOG: OnceCell<Vec<ComposioAppEntry>> = OnceCell::const_new();

/// Returns the cached catalog, fetching it on first call.
async fn get_catalog() -> &'static Vec<ComposioAppEntry> {
    CATALOG
        .get_or_init(|| async {
            match fetch_from_public_page().await {
                Ok(apps) if !apps.is_empty() => {
                    tracing::info!("[composio] Fetched {} apps from public page", apps.len());
                    apps
                }
                Ok(_) => {
                    tracing::warn!("[composio] Public page returned empty app list");
                    Vec::new()
                }
                Err(e) => {
                    tracing::warn!("[composio] Failed to fetch apps: {e}");
                    Vec::new()
                }
            }
        })
        .await
}

/// Returns a clone of the cached catalog (for the frontend Tauri command).
pub async fn list_all_apps() -> Vec<ComposioAppEntry> {
    get_catalog().await.clone()
}

/// Returns all toolkit slugs from the catalog.
pub async fn all_slugs() -> Vec<String> {
    get_catalog().await.iter().map(|a| a.toolkit.clone()).collect()
}

async fn fetch_from_public_page() -> Result<Vec<ComposioAppEntry>, String> {
    let client = reqwest::Client::new();
    let html = client
        .get(TOOLKITS_URL)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Read body failed: {e}"))?;

    let needle = "initialToolkits\\\":";
    let marker_idx = html
        .find(needle)
        .ok_or("initialToolkits marker not found")?;
    let search_from = marker_idx + needle.len();
    let bracket_off = html[search_from..]
        .find('[')
        .ok_or("Opening bracket not found")?;
    let bracket_idx = search_from + bracket_off;

    // Unescape from the opening bracket forward. The data is inside a JS string literal
    // so `\"` → `"`, `\\` → `\`, `\uXXXX` → unicode, etc.
    let unescaped = unescape_js_string(&html[bracket_idx..]);

    // Parse only the first JSON value (the toolkits array). Trailing data is ignored.
    let mut iter = serde_json::Deserializer::from_str(&unescaped).into_iter::<serde_json::Value>();
    let value = iter
        .next()
        .ok_or("No JSON value found")?
        .map_err(|e| format!("JSON parse failed: {e}"))?;

    parse_toolkits(&value)
}

fn parse_toolkits(value: &serde_json::Value) -> Result<Vec<ComposioAppEntry>, String> {
    let items = value.as_array().ok_or("Expected JSON array")?;
    let mut apps = Vec::with_capacity(items.len());
    for item in items {
        let toolkit = item
            .get("slug")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        if toolkit.is_empty() {
            continue;
        }
        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&toolkit)
            .to_string();
        let description = item
            .get("short_description")
            .or_else(|| item.get("description"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let logo_url = item
            .get("logo_url")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("https://logos.composio.dev/api/{toolkit}"));

        apps.push(ComposioAppEntry {
            toolkit,
            name,
            description,
            logo_url,
        });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}

/// Unescape a JS string literal: `\"` → `"`, `\\` → `\`, `\uXXXX` → char, etc.
fn unescape_js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some('/') => out.push('/'),
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some('b') => out.push('\u{0008}'),
            Some('f') => out.push('\u{000c}'),
            Some('u') => {
                let hex: String = (0..4).filter_map(|_| chars.next()).collect();
                if let Ok(code) = u32::from_str_radix(&hex, 16) {
                    if let Some(ch) = char::from_u32(code) {
                        out.push(ch);
                    }
                }
            }
            Some(c) => {
                out.push('\\');
                out.push(c);
            }
            None => out.push('\\'),
        }
    }
    out
}
