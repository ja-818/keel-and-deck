#!/usr/bin/env bash
set -euo pipefail

# Bump a CLI dependency version in cli-deps.json.
#
# Usage:
#   ./scripts/bump-cli.sh codex 0.122.0
#   ./scripts/bump-cli.sh composio 0.2.25
#   ./scripts/bump-cli.sh claude-code 2.2.0

CLI="${1:?Usage: ./scripts/bump-cli.sh <cli-name> <version>}"
VERSION="${2:?Usage: ./scripts/bump-cli.sh <cli-name> <version>}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_FILE="$REPO_ROOT/cli-deps.json"

# Validate CLI exists in deps file
if ! jq -e ".[\"$CLI\"]" "$DEPS_FILE" > /dev/null 2>&1; then
  echo "ERROR: '$CLI' not found in cli-deps.json" >&2
  echo "Available: $(jq -r 'keys[] | select(startswith("$") | not)' "$DEPS_FILE" | tr '\n' ' ')" >&2
  exit 1
fi

OLD_VERSION=$(jq -r ".[\"$CLI\"].version" "$DEPS_FILE")

# Update version
jq ".[\"$CLI\"].version = \"$VERSION\"" "$DEPS_FILE" > tmp.json && mv tmp.json "$DEPS_FILE"

# Clear old checksums (need to re-fetch to get new ones)
jq ".[\"$CLI\"].checksums = {}" "$DEPS_FILE" > tmp.json && mv tmp.json "$DEPS_FILE"

echo "Bumped $CLI: $OLD_VERSION -> $VERSION"
echo "Checksums cleared — run ./scripts/fetch-cli-deps.sh to download and compute new checksums"
echo ""
echo "Don't forget to:"
echo "  1. Run: ./scripts/fetch-cli-deps.sh"
echo "  2. Update checksums in cli-deps.json with the values printed by fetch"
echo "  3. Test the build before releasing"
