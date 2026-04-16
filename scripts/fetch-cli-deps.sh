#!/usr/bin/env bash
set -euo pipefail

# Fetch CLI dependencies defined in cli-deps.json.
# Downloads binaries for the target platform and places them in
# app/src-tauri/resources/bin/ for Tauri to bundle into the .app.
#
# Output structure:
#   resources/bin/codex              ← single binary
#   resources/bin/composio/          ← directory (binary + helpers)
#     composio
#     services/
#     *.mjs
#
# Usage:
#   ./scripts/fetch-cli-deps.sh              # auto-detect arch
#   ./scripts/fetch-cli-deps.sh arm64        # force arm64
#   ./scripts/fetch-cli-deps.sh x64          # force x64

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_FILE="$REPO_ROOT/cli-deps.json"
OUT_DIR="$REPO_ROOT/app/src-tauri/resources/bin"

if [ ! -f "$DEPS_FILE" ]; then
  echo "ERROR: cli-deps.json not found at $DEPS_FILE" >&2
  exit 1
fi

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64)  echo "x64" ;;
    *) echo "ERROR: unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac
}

ARCH="${1:-$(detect_arch)}"
PLATFORM="darwin-$ARCH"

mkdir -p "$OUT_DIR"

CLIS=$(jq -r 'keys[] | select(startswith("$") | not)' "$DEPS_FILE")

for cli in $CLIS; do
  bundled=$(jq -r ".[\"$cli\"].bundled" "$DEPS_FILE")
  version=$(jq -r ".[\"$cli\"].version" "$DEPS_FILE")
  binary_name=$(jq -r ".[\"$cli\"].binary_name" "$DEPS_FILE")

  if [ "$bundled" != "true" ]; then
    echo "SKIP $cli v$version (downloaded at runtime)"
    continue
  fi

  url_template=$(jq -r ".[\"$cli\"].urls[\"$PLATFORM\"] // empty" "$DEPS_FILE")
  expected_checksum=$(jq -r ".[\"$cli\"].checksums[\"$PLATFORM\"] // empty" "$DEPS_FILE")

  if [ -z "$url_template" ]; then
    echo "WARN: no URL for $cli $PLATFORM, skipping" >&2
    continue
  fi

  url="${url_template//\{version\}/$version}"

  echo "FETCH $cli v$version ($PLATFORM)"
  echo "  URL: $url"

  # Download
  tmp_file=$(mktemp)
  if ! curl -fsSL -o "$tmp_file" "$url"; then
    echo "ERROR: download failed for $cli" >&2
    rm -f "$tmp_file"
    exit 1
  fi

  # Verify checksum of the download BEFORE extraction
  actual_checksum=$(shasum -a 256 "$tmp_file" | cut -d' ' -f1)
  if [ -n "$expected_checksum" ]; then
    if [ "$actual_checksum" != "$expected_checksum" ]; then
      echo "ERROR: checksum mismatch for $cli $PLATFORM" >&2
      echo "  expected: $expected_checksum" >&2
      echo "  actual:   $actual_checksum" >&2
      rm -f "$tmp_file"
      exit 1
    fi
    echo "  Download checksum: OK"
  else
    echo "  Download checksum (pin this): $actual_checksum"
  fi

  # Extract
  extract_dir=$(mktemp -d)
  case "$url" in
    *.tar.gz|*.tgz) tar xzf "$tmp_file" -C "$extract_dir" ;;
    *.zip)          unzip -q "$tmp_file" -d "$extract_dir" ;;
    *)              cp "$tmp_file" "$extract_dir/$binary_name" ;;
  esac
  rm -f "$tmp_file"

  # Find the main binary — might be named exactly or with platform suffix
  main_binary=$(find "$extract_dir" -type f \( -name "$binary_name" -o -name "$binary_name-*" \) | head -1)

  if [ -z "$main_binary" ]; then
    echo "ERROR: binary not found in archive for $cli" >&2
    find "$extract_dir" -type f | head -20 >&2
    rm -rf "$extract_dir"
    exit 1
  fi

  # Check if the binary has sibling support files (like composio's .mjs + services/)
  binary_dir=$(dirname "$main_binary")
  sibling_count=$(find "$binary_dir" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')

  if [ "$sibling_count" -gt 1 ]; then
    # Multi-file CLI — copy the whole directory
    dest_dir="$OUT_DIR/$binary_name"
    rm -rf "$dest_dir"
    cp -R "$binary_dir" "$dest_dir"
    actual_name=$(basename "$main_binary")
    if [ "$actual_name" != "$binary_name" ]; then
      mv "$dest_dir/$actual_name" "$dest_dir/$binary_name"
    fi
    chmod +x "$dest_dir/$binary_name"
    echo "  Installed: $dest_dir/ ($(du -sh "$dest_dir" | cut -f1))"
  else
    # Single binary — place directly in bin/
    dest="$OUT_DIR/$binary_name"
    cp "$main_binary" "$dest"
    chmod +x "$dest"
    echo "  Installed: $dest ($(du -sh "$dest" | cut -f1))"
  fi

  rm -rf "$extract_dir"
done

echo ""
echo "Done. Bundled CLIs:"
du -sh "$OUT_DIR"/* 2>/dev/null || echo "  (none)"
