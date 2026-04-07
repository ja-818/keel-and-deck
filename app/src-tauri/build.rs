fn main() {
    // Load .env file so env!() macros in slack.rs can read credentials at build time.
    if let Ok(env_path) = std::fs::canonicalize(".env") {
        for line in std::fs::read_to_string(&env_path).unwrap_or_default().lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                println!("cargo:rustc-env={}={}", key.trim(), value.trim());
            }
        }
        println!("cargo:rerun-if-changed={}", env_path.display());
    }

    tauri_build::build()
}
