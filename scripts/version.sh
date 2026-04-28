#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: ./scripts/version.sh <version>}"

echo "Bumping all packages to v$VERSION..."

# NPM packages — only the ones that share the Houston version line.
# ui/agent, ui/agent-schemas, ui/engine-client, ui/sync-protocol are
# versioned independently and are intentionally excluded.
for pkg in core chat board layout skills events routines review; do
  jq --arg v "$VERSION" '.version = $v' "ui/$pkg/package.json" > tmp.json && mv tmp.json "ui/$pkg/package.json"
done

# Root + app
for f in package.json app/package.json; do
  jq --arg v "$VERSION" '.version = $v' "$f" > tmp.json && mv tmp.json "$f"
done

# Rust crates — replace ONLY the first `^version = ...` line (the
# `[package]` version), not dependency lines like:
#   [dependencies.thiserror]
#   version = "1"
# which sed would otherwise clobber and break cargo resolution.
# Use perl instead of `1,/regex/s//new/` because BSD sed (macOS)
# rejects the empty back-reference with "first RE may not be empty".
for toml in engine/*/Cargo.toml app/houston-tauri/Cargo.toml app/src-tauri/Cargo.toml; do
  perl -i -pe 'BEGIN{$d=0} if(!$d && /^version = "[^"]+"$/){s/^version = "[^"]+"$/version = "'"$VERSION"'"/; $d=1}' "$toml"
done

# Root Cargo.toml workspace dependencies
sed -i '' "s/version = \"[0-9]*\.[0-9]*\.[0-9]*\"/version = \"$VERSION\"/g" Cargo.toml

echo "All packages bumped to v$VERSION"
