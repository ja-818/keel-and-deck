//! Runtime installer for Google's Antigravity CLI (`agy`).
//!
//! Antigravity ships under a proprietary license (no LICENSE in the
//! upstream repo at `google-antigravity/antigravity-cli`) so Houston
//! cannot bundle it inside the signed/notarized desktop bundle. We do
//! the same dance we already do for Claude Code: pin a version + per-
//! platform URL + SHA-256 in `cli-deps.json`, download on first launch,
//! verify the digest, and install atomically into the user's home dir.
//!
//! Two upstream-format differences from `houston-claude-installer`:
//!
//! 1. **macOS ships `.tar.gz`** containing a single member named
//!    `antigravity`. The installer extracts that one member (no
//!    surrounding directory) and renames it to `agy` at install time.
//!    Windows ships the `.exe` directly with no archive, same as
//!    claude-code's Windows distribution. The cli-deps entry exposes
//!    this via the optional `archive_member` field — `Some("antigravity")`
//!    on the macOS platforms, `None` on Windows.
//! 2. **CLI surface is still v1.0.0**, released 2026-05-19 as part of
//!    Antigravity 2.0. It has no structured streaming output flag and
//!    no `--model` switch yet (per `agy --help`); Houston's runner uses
//!    `agy --print` and surfaces the full response as a single
//!    `assistant_text` FeedItem until those flags ship upstream. The
//!    installer itself is unaffected by the runner limitations.
//!
//! ## Install flow
//!
//! 1. Resolve the bundled `cli-deps.json` manifest (or the dev-checkout
//!    fallback) via `houston_cli_bundle::load_bundled_manifest`.
//! 2. Look up the `antigravity` entry. Bail early if `bundled: true`
//!    (defensive — bundling antigravity would need a license change).
//! 3. Fetch the per-platform URL + SHA-256 and download to a temp file
//!    alongside the final install target so the rename at the end is
//!    atomic on the same filesystem.
//! 4. Stream the response, accumulating SHA-256 as bytes arrive. Emit
//!    `HoustonEvent::AntigravityCliInstalling { progress_pct }` roughly
//!    every 10%.
//! 5. On EOF, compare the digest to the pinned checksum. Mismatch =>
//!    delete the temp file, return error (treated as fatal by the
//!    lifecycle entry).
//! 6. If the entry declares `archive_member`, extract that single member
//!    from the temp `.tar.gz` to a sibling temp file; otherwise treat
//!    the download as the binary directly.
//! 7. Mark executable (Unix), atomically rename into place, persist the
//!    installed version in the engine DB so the next boot can decide
//!    whether to re-install.

use futures_util::StreamExt;
use houston_db::db::Database;
use houston_ui_events::{DynEventSink, HoustonEvent};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::PathBuf;
use tokio::io::AsyncWriteExt;

// Path-resolution functions live in `houston-terminal-manager` so the
// spawn-side code (`agy_path`, `agy_runner`) shares one source of truth
// with the install-side code below. Re-exported here for callers that
// import from this crate (e.g. `routes/antigravity.rs`).
pub use houston_terminal_manager::agy_install_path::{
    binary_name, cli_path, install_dir, is_installed,
};

/// Engine-DB preferences key holding the last successfully-installed
/// antigravity version. Lifecycle compares it against the manifest's
/// pinned version on every boot.
const PREF_INSTALLED_VERSION: &str = "antigravity_installed_version";

/// CLI key inside `cli-deps.json`. Constant so we don't string-literal
/// the same value across modules.
const CLI_KEY: &str = "antigravity";

/// Lifecycle entry — call once at engine startup as a background task.
///
/// Decision tree:
/// - No manifest available → log + emit `AntigravityCliReady` (best-
///   effort, user can install manually or skip antigravity).
/// - Already installed at the pinned version → emit `AntigravityCliReady`.
/// - Not installed, or installed at a different version →
///   download/verify/install, then emit `AntigravityCliReady`.
/// - Download/verify failure → emit `AntigravityCliFailed { message }`.
pub async fn ensure_and_upgrade(sink: DynEventSink, db: Database) {
    let Some(manifest) = resolve_manifest() else {
        tracing::warn!(
            "[antigravity-installer] no cli-deps.json available — skipping auto-install"
        );
        sink.emit(HoustonEvent::AntigravityCliReady);
        return;
    };

    let Some(entry) = manifest.entry(CLI_KEY) else {
        tracing::warn!(
            "[antigravity-installer] cli-deps.json missing '{}' entry — skipping auto-install",
            CLI_KEY
        );
        sink.emit(HoustonEvent::AntigravityCliReady);
        return;
    };

    if entry.bundled {
        tracing::info!(
            "[antigravity-installer] manifest reports antigravity as bundled; trusting bundle"
        );
        sink.emit(HoustonEvent::AntigravityCliReady);
        return;
    }

    let pinned_version = entry.version.clone();

    let last_version = db
        .get_preference(PREF_INSTALLED_VERSION)
        .await
        .ok()
        .flatten()
        .unwrap_or_default();

    if is_installed() && last_version == pinned_version {
        tracing::info!(
            "[antigravity-installer] already at pinned version {}, skipping",
            pinned_version
        );
        sink.emit(HoustonEvent::AntigravityCliReady);
        return;
    }

    tracing::info!(
        "[antigravity-installer] installing antigravity v{} ({} → {})",
        pinned_version,
        if last_version.is_empty() { "none" } else { &last_version },
        pinned_version
    );

    sink.emit(HoustonEvent::AntigravityCliInstalling { progress_pct: 0 });

    let sink_for_progress = sink.clone();
    let result = install(&entry, move |pct| {
        sink_for_progress.emit(HoustonEvent::AntigravityCliInstalling { progress_pct: pct });
    })
    .await;

    match result {
        Ok(path) => {
            tracing::info!("[antigravity-installer] installed at {}", path.display());
            if let Err(e) = db.set_preference(PREF_INSTALLED_VERSION, &pinned_version).await {
                tracing::warn!(
                    "[antigravity-installer] failed to persist version marker: {e}"
                );
            }
            sink.emit(HoustonEvent::AntigravityCliReady);
        }
        Err(e) => {
            tracing::error!("[antigravity-installer] install failed: {e}");
            sink.emit(HoustonEvent::AntigravityCliFailed { message: e });
        }
    }
}

/// Resolve the `cli-deps.json` manifest. Prefers the bundled copy
/// (production) and falls back to the dev-checkout root so engineers
/// running `cargo run -p houston-engine-server` against an unbundled
/// build still get auto-install.
fn resolve_manifest() -> Option<houston_cli_bundle::CliDepsManifest> {
    if let Some(m) = houston_cli_bundle::load_bundled_manifest() {
        return Some(m);
    }
    let cwd = std::env::current_dir().ok()?;
    let mut here = cwd.as_path();
    loop {
        let candidate = here.join("cli-deps.json");
        if candidate.is_file() {
            return houston_cli_bundle::CliDepsManifest::load(&candidate).ok();
        }
        match here.parent() {
            Some(p) => here = p,
            None => return None,
        }
    }
}

/// Download + verify + (extract +) install. Public so callers (e.g. an
/// explicit "Reinstall Antigravity" UI button) can re-run the same path
/// without going through the full lifecycle.
pub async fn install(
    entry: &houston_cli_bundle::CliEntry,
    progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, String> {
    install_to(entry, &install_dir(), binary_name(), progress).await
}

/// Parameterized variant of [`install`]: download `entry` for the
/// current host platform, verify SHA-256, extract the configured
/// archive member (if any), write atomically into
/// `install_dir/binary_name`. Used by tests to redirect into a temp
/// directory; production callers should use [`install`].
pub async fn install_to(
    entry: &houston_cli_bundle::CliEntry,
    install_dir: &std::path::Path,
    binary_name: &str,
    mut progress: impl FnMut(u8) + Send + 'static,
) -> Result<PathBuf, String> {
    let platform = houston_cli_bundle::host_platform_key();
    let url = entry
        .url_for(platform)
        .ok_or_else(|| format!("no antigravity URL for platform '{platform}'"))?;
    let expected_checksum = entry
        .checksum_for(platform)
        .ok_or_else(|| format!("no antigravity checksum for platform '{platform}'"))?
        .to_string();

    tracing::info!("[antigravity-installer] GET {url}");

    tokio::fs::create_dir_all(install_dir)
        .await
        .map_err(|e| format!("failed to create install dir {}: {e}", install_dir.display()))?;

    let final_path = install_dir.join(binary_name);
    // We always download first to a `.download` temp, then either rename
    // it directly into place (no-archive case) or extract a member out
    // of it into a second `.partial` temp. Two distinct names so the
    // archive temp doesn't collide with a partial rename target.
    let download_path = install_dir.join(format!(".{binary_name}.download"));
    let extract_path = install_dir.join(format!(".{binary_name}.partial"));
    let _ = tokio::fs::remove_file(&download_path).await;
    let _ = tokio::fs::remove_file(&extract_path).await;

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))?;

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "download returned HTTP {}: {url}",
            resp.status()
        ));
    }

    let total = resp.content_length();
    let mut stream = resp.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_pct_emitted: u8 = 0;

    let mut tmp_file = tokio::fs::File::create(&download_path)
        .await
        .map_err(|e| format!("failed to open temp file {}: {e}", download_path.display()))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download stream error: {e}"))?;
        hasher.update(&chunk);
        tmp_file
            .write_all(&chunk)
            .await
            .map_err(|e| format!("failed to write chunk: {e}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        if let Some(total) = total {
            if total > 0 {
                let pct = ((downloaded.min(total) * 100) / total) as u8;
                if pct >= last_pct_emitted.saturating_add(10).min(100) {
                    last_pct_emitted = pct;
                    progress(pct);
                }
            }
        }
    }

    tmp_file
        .flush()
        .await
        .map_err(|e| format!("flush failed: {e}"))?;
    drop(tmp_file);

    progress(100);

    let actual_checksum = hex::encode(hasher.finalize());
    if !checksum_matches(&actual_checksum, &expected_checksum) {
        let _ = tokio::fs::remove_file(&download_path).await;
        return Err(format!(
            "antigravity checksum mismatch: expected {expected_checksum}, got {actual_checksum} \
             — download may be tampered or the pinned manifest is stale"
        ));
    }

    // Either extract the configured archive member (macOS .tar.gz) or
    // promote the downloaded file directly to the install target
    // (Windows .exe). Both paths leave the binary at `extract_path`
    // ready for the final atomic rename.
    match entry.archive_member.as_deref() {
        Some(member) => {
            let download_clone = download_path.clone();
            let extract_clone = extract_path.clone();
            let member_owned = member.to_string();
            // tar / flate2 are blocking — push extraction to a blocking
            // worker so we don't tie up the runtime for the ~140 MB
            // gunzip step.
            tokio::task::spawn_blocking(move || {
                extract_tar_gz_member(&download_clone, &member_owned, &extract_clone)
            })
            .await
            .map_err(|e| format!("extract task panicked: {e}"))??;
            // Done with the archive temp file.
            let _ = tokio::fs::remove_file(&download_path).await;
        }
        None => {
            tokio::fs::rename(&download_path, &extract_path)
                .await
                .map_err(|e| {
                    format!(
                        "failed to stage downloaded binary at {}: {e}",
                        extract_path.display()
                    )
                })?;
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&extract_path, perms)
            .map_err(|e| format!("failed to chmod +x: {e}"))?;
    }

    #[cfg(windows)]
    {
        if final_path.exists() {
            let _ = std::fs::remove_file(&final_path);
        }
    }
    std::fs::rename(&extract_path, &final_path).map_err(|e| {
        format!(
            "failed to install to {}: {e} — check the directory is writable",
            final_path.display()
        )
    })?;

    Ok(final_path)
}

/// Extract exactly one named entry from a gzipped tar archive at
/// `archive_path` to `dest_path`. Errors loudly if the member is
/// missing — the caller's pinned `archive_member` value is part of
/// the trust chain (we don't want to silently install a different
/// file just because the upstream archive layout changed).
fn extract_tar_gz_member(
    archive_path: &std::path::Path,
    member: &str,
    dest_path: &std::path::Path,
) -> Result<(), String> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| format!("failed to open archive {}: {e}", archive_path.display()))?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(gz);

    let entries = tar
        .entries()
        .map_err(|e| format!("failed to read tar entries: {e}"))?;

    for entry in entries {
        let mut entry = entry.map_err(|e| format!("failed to read tar entry: {e}"))?;
        let path_in_archive = entry
            .path()
            .map_err(|e| format!("invalid path inside tar: {e}"))?
            .into_owned();
        // Match by file name so we don't have to know whether the
        // upstream archive layout adds a leading `./` or a directory
        // prefix at some future date.
        let matches = path_in_archive
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n == member)
            .unwrap_or(false);
        if !matches {
            continue;
        }

        let mut out = std::fs::File::create(dest_path)
            .map_err(|e| format!("failed to open dest {}: {e}", dest_path.display()))?;
        let mut buf = [0u8; 64 * 1024];
        loop {
            let n = entry
                .read(&mut buf)
                .map_err(|e| format!("read from tar entry failed: {e}"))?;
            if n == 0 {
                break;
            }
            use std::io::Write;
            out.write_all(&buf[..n])
                .map_err(|e| format!("write to dest failed: {e}"))?;
        }
        return Ok(());
    }

    Err(format!(
        "archive {} did not contain expected member '{member}'",
        archive_path.display()
    ))
}

fn checksum_matches(actual: &str, expected: &str) -> bool {
    actual.eq_ignore_ascii_case(expected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::Arc;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn checksum_match_ignores_case() {
        assert!(checksum_matches("DEADBEEF", "deadbeef"));
        assert!(checksum_matches("abc123", "abc123"));
        assert!(!checksum_matches("abc", "abd"));
    }

    #[test]
    fn cli_path_is_under_install_dir() {
        let cli = cli_path();
        let dir = install_dir();
        assert!(cli.starts_with(&dir), "{} not under {}", cli.display(), dir.display());
    }

    fn entry_for(
        server_uri: &str,
        payload: &[u8],
        archive_member: Option<&str>,
    ) -> houston_cli_bundle::CliEntry {
        let actual = hex::encode(sha2::Sha256::digest(payload));
        let mut entry_body = serde_json::json!({
            "version": "9.9.9",
            "bundled": false,
            "binary_name": "agy",
            "license": "PROPRIETARY",
            "urls": {
                houston_cli_bundle::host_platform_key(): format!("{server_uri}/agy")
            },
            "checksums": {
                houston_cli_bundle::host_platform_key(): actual
            }
        });
        if let Some(m) = archive_member {
            entry_body["archive_member"] = serde_json::Value::String(m.into());
        }
        let manifest = serde_json::json!({ "antigravity": entry_body });
        let raw = serde_json::to_string(&manifest).unwrap();
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), raw).unwrap();
        let m = houston_cli_bundle::CliDepsManifest::load(tmp.path()).unwrap();
        m.entry("antigravity").unwrap()
    }

    fn build_tar_gz_with_member(member_name: &str, body: &[u8]) -> Vec<u8> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;
        let gz = GzEncoder::new(Vec::new(), Compression::default());
        let mut tar_builder = tar::Builder::new(gz);
        let mut header = tar::Header::new_gnu();
        header.set_path(member_name).unwrap();
        header.set_size(body.len() as u64);
        header.set_mode(0o755);
        header.set_cksum();
        tar_builder.append(&header, body).unwrap();
        let gz = tar_builder.into_inner().unwrap();
        gz.finish().unwrap()
    }

    #[tokio::test]
    async fn install_extracts_archive_member_and_renames_to_binary() {
        let server = MockServer::start().await;
        let inner_body = b"fake antigravity binary contents".repeat(2_000);
        let archive = build_tar_gz_with_member("antigravity", &inner_body);

        Mock::given(method("GET"))
            .and(path("/agy"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/gzip")
                    .set_body_bytes(archive.clone()),
            )
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), &archive, Some("antigravity"));
        let dest = tempfile::tempdir().unwrap();
        let progress = Arc::new(AtomicU8::new(0));
        let progress_clone = progress.clone();
        let result = install_to(&entry, dest.path(), "agy", move |pct| {
            progress_clone.store(pct, Ordering::Relaxed);
        })
        .await;

        let installed = result.expect("install should succeed");
        assert_eq!(installed, dest.path().join("agy"));
        assert_eq!(std::fs::read(&installed).unwrap(), inner_body);
        assert_eq!(progress.load(Ordering::Relaxed), 100);
        // Every temp file must be cleaned up.
        assert!(!dest.path().join(".agy.download").exists());
        assert!(!dest.path().join(".agy.partial").exists());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&installed).unwrap().permissions().mode();
            assert!(mode & 0o111 != 0, "binary not executable (mode={mode:o})");
        }
    }

    #[tokio::test]
    async fn install_handles_direct_binary_without_archive() {
        let server = MockServer::start().await;
        let payload = b"#!/bin/sh\necho 'fake agy'\n".repeat(40_000);

        Mock::given(method("GET"))
            .and(path("/agy"))
            .respond_with(
                ResponseTemplate::new(200)
                    .insert_header("content-type", "application/octet-stream")
                    .set_body_bytes(payload.clone()),
            )
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), &payload, None);
        let dest = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest.path(), "agy", |_| {}).await;

        let installed = result.expect("install should succeed");
        assert_eq!(std::fs::read(&installed).unwrap(), payload);
        assert!(!dest.path().join(".agy.download").exists());
        assert!(!dest.path().join(".agy.partial").exists());
    }

    #[tokio::test]
    async fn install_rejects_checksum_mismatch_and_cleans_temp() {
        let server = MockServer::start().await;
        let payload = b"corrupt payload";

        Mock::given(method("GET"))
            .and(path("/agy"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(payload.to_vec()))
            .mount(&server)
            .await;

        let manifest = serde_json::json!({
            "antigravity": {
                "version": "9.9.9",
                "bundled": false,
                "binary_name": "agy",
                "urls": {
                    houston_cli_bundle::host_platform_key(): format!("{}/agy", server.uri())
                },
                "checksums": {
                    houston_cli_bundle::host_platform_key():
                        "0000000000000000000000000000000000000000000000000000000000000000"
                }
            }
        });
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), serde_json::to_string(&manifest).unwrap()).unwrap();
        let entry = houston_cli_bundle::CliDepsManifest::load(tmp.path())
            .unwrap()
            .entry("antigravity")
            .unwrap();

        let dest = tempfile::tempdir().unwrap();
        let result = install_to(&entry, dest.path(), "agy", |_| {}).await;

        let err = result.expect_err("checksum mismatch must error");
        assert!(err.contains("checksum mismatch"), "unexpected error: {err}");
        assert!(!dest.path().join("agy").exists());
        assert!(!dest.path().join(".agy.download").exists());
        assert!(!dest.path().join(".agy.partial").exists());
    }

    #[tokio::test]
    async fn extract_errors_when_archive_member_missing() {
        let archive = build_tar_gz_with_member("something-else", b"unused");
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agy"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(archive.clone()))
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), &archive, Some("antigravity"));
        let dest = tempfile::tempdir().unwrap();
        let err = install_to(&entry, dest.path(), "agy", |_| {})
            .await
            .expect_err("missing member must error");
        assert!(
            err.contains("did not contain expected member"),
            "unexpected error: {err}"
        );
        assert!(!dest.path().join("agy").exists());
    }

    #[tokio::test]
    async fn install_surfaces_http_errors() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agy"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let entry = entry_for(&server.uri(), b"unused", None);
        let dest = tempfile::tempdir().unwrap();
        let err = install_to(&entry, dest.path(), "agy", |_| {})
            .await
            .expect_err("server 500 must error");
        assert!(err.contains("HTTP") || err.contains("500"));
    }
}
