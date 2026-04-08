//! CRUD operations for `.houston/integrations.json`.
//!
//! Tracks which Composio integrations (toolkits) an agent has used,
//! along with first/last usage timestamps and a use count.
//!
//! The agent may write this file in three formats, all of which we accept:
//!   - Array:   `[{ toolkit, first_used_at, ... }]`                  (canonical)
//!   - Map:     `{ "gmail": { first_used_at, ... } }`                (simple self-report)
//!   - Wrapper: `{ "integrations": [{ toolkit, status, ... }] }`     (rich self-report)
//! We always normalize to the array format on disk.

use super::helpers::{houston_dir, write_json};
use super::types::TrackedIntegration;
use chrono::Utc;
use std::collections::HashMap;
use std::path::Path;

const FILE: &str = "integrations.json";

/// An entry in the map format the agent writes.
#[derive(serde::Deserialize)]
struct MapEntry {
    first_used_at: String,
    last_used_at: String,
    #[serde(default = "default_one")]
    use_count: u32,
}

/// An entry in the wrapper format ({"integrations": [...]}). Unknown fields like
/// `status` and `account` are ignored. PENDING entries have null timestamps.
#[derive(serde::Deserialize)]
struct WrapperEntry {
    toolkit: String,
    #[serde(default)]
    first_used_at: Option<String>,
    #[serde(default)]
    last_used_at: Option<String>,
    #[serde(default)]
    use_count: u32,
}

#[derive(serde::Deserialize)]
struct WrapperFormat {
    integrations: Vec<WrapperEntry>,
}

fn default_one() -> u32 {
    1
}

impl WrapperEntry {
    fn into_tracked(self) -> Option<TrackedIntegration> {
        // Skip entries without real timestamps (PENDING connections have null).
        let first_used_at = self.first_used_at?;
        let last_used_at = self.last_used_at?;
        Some(TrackedIntegration {
            toolkit: self.toolkit,
            first_used_at,
            last_used_at,
            use_count: if self.use_count == 0 { 1 } else { self.use_count },
        })
    }
}

/// List all tracked integrations for this agent.
/// Accepts array, wrapper, and map formats on disk.
pub fn list(root: &Path) -> Result<Vec<TrackedIntegration>, String> {
    let path = houston_dir(root).join(FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {FILE}: {e}"))?;

    // Try array format first (our canonical format)
    if let Ok(items) = serde_json::from_str::<Vec<TrackedIntegration>>(&contents) {
        return Ok(items);
    }

    // Try wrapper format: { "integrations": [{ toolkit, status, first_used_at, ... }] }
    if let Ok(wrapper) = serde_json::from_str::<WrapperFormat>(&contents) {
        let items: Vec<TrackedIntegration> = wrapper
            .integrations
            .into_iter()
            .filter_map(WrapperEntry::into_tracked)
            .collect();
        // Migrate to canonical array format on disk
        let _ = write_json(root, FILE, &items);
        return Ok(items);
    }

    // Fall back to map format: { "toolkit_name": { first_used_at, ... } }
    if let Ok(map) = serde_json::from_str::<HashMap<String, MapEntry>>(&contents) {
        let items: Vec<TrackedIntegration> = map
            .into_iter()
            .map(|(toolkit, entry)| TrackedIntegration {
                toolkit,
                first_used_at: entry.first_used_at,
                last_used_at: entry.last_used_at,
                use_count: entry.use_count,
            })
            .collect();
        // Migrate to array format on disk
        let _ = write_json(root, FILE, &items);
        return Ok(items);
    }

    Err(format!("Failed to parse {FILE}: unrecognized format"))
}

/// Record that an agent used a toolkit. Creates the entry if new,
/// bumps `use_count` and `last_used_at` if existing.
pub fn track(root: &Path, toolkit: &str) -> Result<TrackedIntegration, String> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();

    if let Some(existing) = items.iter_mut().find(|i| i.toolkit == toolkit) {
        existing.use_count += 1;
        existing.last_used_at = now.clone();
        let result = existing.clone();
        write_json(root, FILE, &items)?;
        Ok(result)
    } else {
        let entry = TrackedIntegration {
            toolkit: toolkit.to_string(),
            first_used_at: now.clone(),
            last_used_at: now,
            use_count: 1,
        };
        items.push(entry.clone());
        write_json(root, FILE, &items)?;
        Ok(entry)
    }
}

/// Remove a tracked integration by toolkit name.
pub fn remove(root: &Path, toolkit: &str) -> Result<(), String> {
    let mut items = list(root)?;
    let before = items.len();
    items.retain(|i| i.toolkit != toolkit);
    if items.len() == before {
        return Err(format!("Tracked integration not found: {toolkit}"));
    }
    write_json(root, FILE, &items)
}
