use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct InstalledConfig {
    pub config: serde_json::Value,
    pub path: String,
}

fn configs_dir() -> PathBuf {
    let home = dirs::home_dir().expect("No home directory found");
    home.join(".houston").join("agents")
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_installed_configs() -> Result<Vec<InstalledConfig>, String> {
    let dir = configs_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create agents directory: {e}"))?;

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut configs = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let config_path = path.join("houston.json");
        if !config_path.exists() {
            continue;
        }
        match fs::read_to_string(&config_path) {
            Ok(contents) => match serde_json::from_str::<serde_json::Value>(&contents) {
                Ok(config) => {
                    configs.push(InstalledConfig {
                        config,
                        path: path.to_string_lossy().to_string(),
                    });
                }
                Err(e) => {
                    eprintln!(
                        "[store] failed to parse {}: {e}",
                        config_path.display()
                    );
                }
            },
            Err(e) => {
                eprintln!(
                    "[store] failed to read {}: {e}",
                    config_path.display()
                );
            }
        }
    }

    Ok(configs)
}
