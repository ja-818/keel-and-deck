#!/usr/bin/env bash
# ============================================================================
# Claude Code Installer — Handles Every Known Pitfall
# Usage: curl -fsSL <your-hosted-url>/install-claude-code.sh | bash
#   or:  bash scripts/install-claude-code.sh
# ============================================================================
set -euo pipefail

# --- Colors & helpers -------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()  { echo -e "${RED}[fail]${NC}  $*"; }
step()  { echo -e "\n${BOLD}━━━ $* ━━━${NC}"; }

# --- OS & architecture detection -------------------------------------------
step "Step 1/7: Detecting your system"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  MINGW*|MSYS*|CYGWIN*)
    fail "This script is for macOS/Linux. On Windows, run in PowerShell:"
    echo "  irm https://claude.ai/install.ps1 | iex"
    exit 1 ;;
  *)
    fail "Unsupported OS: $OS"
    exit 1 ;;
esac

info "Platform: $PLATFORM ($ARCH)"

# Check macOS version
if [[ "$PLATFORM" == "macOS" ]]; then
  MACOS_VERSION=$(sw_vers -productVersion)
  MACOS_MAJOR=$(echo "$MACOS_VERSION" | cut -d. -f1)
  if [[ "$MACOS_MAJOR" -lt 13 ]]; then
    fail "macOS 13.0 (Ventura) or later required. You have $MACOS_VERSION."
    fail "Please update macOS before installing Claude Code."
    exit 1
  fi
  ok "macOS $MACOS_VERSION — supported"
fi

# Check Linux specifics
if [[ "$PLATFORM" == "Linux" ]]; then
  # Check RAM (Claude Code needs 4GB+)
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
  if [[ "$TOTAL_RAM_GB" -lt 3 ]]; then
    warn "Low RAM detected (~${TOTAL_RAM_GB}GB). Claude Code needs 4GB+."
    warn "The install may get OOM-killed. Consider adding swap:"
    echo "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile"
    echo "  sudo mkswap /swapfile && sudo swapon /swapfile"
    echo ""
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  else
    ok "RAM: ~${TOTAL_RAM_GB}GB — sufficient"
  fi
fi

# --- Check for git ----------------------------------------------------------
step "Step 2/7: Checking prerequisites"

if command -v git &>/dev/null; then
  ok "git: $(git --version)"
else
  warn "git is not installed."
  if [[ "$PLATFORM" == "macOS" ]]; then
    info "Installing Xcode Command Line Tools (this may take a few minutes)..."
    xcode-select --install 2>/dev/null || true
    echo ""
    warn "A dialog may have appeared asking to install CLT."
    warn "Please click 'Install', wait for it to finish, then re-run this script."
    exit 1
  else
    fail "Please install git: sudo apt-get install git (Debian/Ubuntu)"
    fail "                     sudo dnf install git (Fedora/RHEL)"
    exit 1
  fi
fi

# --- Check for conflicting installations ------------------------------------
step "Step 3/7: Checking for conflicting installations"

CONFLICTS_FOUND=false

# Check npm-installed Claude Code
if npm list -g @anthropic-ai/claude-code 2>/dev/null | grep -q claude-code; then
  warn "Found npm-installed Claude Code. This can conflict with the native install."
  info "Removing npm installation..."
  npm uninstall -g @anthropic-ai/claude-code 2>/dev/null || true
  ok "Removed npm installation"
  CONFLICTS_FOUND=true
fi

# Check if claude binary already exists somewhere unexpected
EXISTING_CLAUDE=$(which claude 2>/dev/null || true)
if [[ -n "$EXISTING_CLAUDE" && "$EXISTING_CLAUDE" != "$HOME/.local/bin/claude" ]]; then
  warn "Found existing claude at: $EXISTING_CLAUDE"
  warn "This may conflict with the native install at ~/.local/bin/claude"
  CONFLICTS_FOUND=true
fi

if [[ "$CONFLICTS_FOUND" == "false" ]]; then
  ok "No conflicting installations found"
fi

# --- Clear shell hash cache -------------------------------------------------
hash -r 2>/dev/null || true

# --- Install Claude Code (native installer) ---------------------------------
step "Step 4/7: Installing Claude Code"

info "Downloading native installer..."

INSTALL_OUTPUT=$(curl -fsSL https://claude.ai/install.sh 2>&1) || {
  fail "Failed to download installer from claude.ai/install.sh"
  echo ""
  # Check if we got HTML instead of a script (region block)
  if echo "$INSTALL_OUTPUT" | head -1 | grep -qi "<!doctype\|<html"; then
    fail "The installer URL returned an HTML page instead of a script."
    fail "This usually means Claude Code is unavailable in your region,"
    fail "or there's a network issue (proxy, VPN, etc.)."
    echo ""
    info "Trying Homebrew fallback..."
    if command -v brew &>/dev/null; then
      brew install --cask claude-code
      ok "Installed via Homebrew"
    else
      fail "Homebrew not found either. Please install manually:"
      echo "  https://code.claude.com/docs/en/setup"
      exit 1
    fi
  else
    fail "Network error. Check your internet connection."
    if [[ -n "${HTTPS_PROXY:-}" || -n "${HTTP_PROXY:-}" ]]; then
      info "Proxy detected: ${HTTPS_PROXY:-$HTTP_PROXY}"
      info "Make sure your proxy allows access to: claude.ai, storage.googleapis.com"
    fi
    exit 1
  fi
}

# Run the installer
echo "$INSTALL_OUTPUT" | bash || {
  fail "Native installer failed."
  echo ""
  info "Trying Homebrew fallback..."
  if [[ "$PLATFORM" == "macOS" ]] && command -v brew &>/dev/null; then
    brew install --cask claude-code
    ok "Installed via Homebrew"
  else
    fail "All installation methods failed. See: https://code.claude.com/docs/en/troubleshooting"
    exit 1
  fi
}

# --- Fix PATH ---------------------------------------------------------------
step "Step 5/7: Configuring PATH"

CLAUDE_BIN="$HOME/.local/bin"
PATH_LINE="export PATH=\"\$HOME/.local/bin:\$PATH\""

# Detect the user's shell
USER_SHELL=$(basename "${SHELL:-/bin/bash}")
case "$USER_SHELL" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash)
    # On macOS, bash uses .bash_profile for login shells (which Terminal.app opens)
    if [[ "$PLATFORM" == "macOS" && -f "$HOME/.bash_profile" ]]; then
      SHELL_RC="$HOME/.bash_profile"
    else
      SHELL_RC="$HOME/.bashrc"
    fi
    ;;
  fish)
    SHELL_RC="$HOME/.config/fish/config.fish"
    PATH_LINE="fish_add_path $HOME/.local/bin"
    ;;
  *)
    SHELL_RC="$HOME/.profile"
    ;;
esac

# Check if PATH already includes ~/.local/bin
if echo "$PATH" | tr ':' '\n' | grep -qx "$CLAUDE_BIN"; then
  ok "$CLAUDE_BIN is already in PATH"
else
  info "Adding $CLAUDE_BIN to PATH in $SHELL_RC"

  # Create the RC file if it doesn't exist
  touch "$SHELL_RC"

  # Only add if not already present in the file
  if ! grep -qF ".local/bin" "$SHELL_RC" 2>/dev/null; then
    echo "" >> "$SHELL_RC"
    echo "# Claude Code" >> "$SHELL_RC"
    echo "$PATH_LINE" >> "$SHELL_RC"
    ok "Added PATH entry to $SHELL_RC"
  else
    ok "PATH entry already exists in $SHELL_RC"
  fi

  # Apply to current session
  export PATH="$HOME/.local/bin:$PATH"
fi

# Clear hash cache again after PATH changes
hash -r 2>/dev/null || true

# --- Verify installation ----------------------------------------------------
step "Step 6/7: Verifying installation"

if ! command -v claude &>/dev/null; then
  fail "'claude' command not found even after PATH fix."
  fail "This shouldn't happen. Debug info:"
  echo "  PATH: $PATH"
  echo "  ls ~/.local/bin/claude:"
  ls -la "$HOME/.local/bin/claude" 2>/dev/null || echo "  (file not found)"
  echo ""
  fail "Try opening a NEW terminal and running: claude --version"
  exit 1
fi

CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
ok "Claude Code installed: $CLAUDE_VERSION"

# Check architecture on Apple Silicon
if [[ "$PLATFORM" == "macOS" && "$ARCH" == "arm64" ]]; then
  BINARY_ARCH=$(file "$(which claude)" 2>/dev/null || echo "")
  if echo "$BINARY_ARCH" | grep -q "x86_64" && ! echo "$BINARY_ARCH" | grep -q "arm64"; then
    warn "Claude binary is x86_64 on Apple Silicon (known bug)."
    warn "It will work via Rosetta but may be slower."
    warn "See: https://github.com/anthropics/claude-code/issues/13617"
  else
    ok "Binary architecture: arm64 (native)"
  fi
fi

# --- Port 54545 pre-check ---------------------------------------------------
step "Step 7/7: Pre-flight checks"

# Check if port 54545 is available (needed for OAuth login)
if command -v lsof &>/dev/null; then
  PORT_USER=$(lsof -i :54545 -t 2>/dev/null || true)
  if [[ -n "$PORT_USER" ]]; then
    PROCESS_NAME=$(ps -p "$PORT_USER" -o comm= 2>/dev/null || echo "unknown")
    warn "Port 54545 is in use by: $PROCESS_NAME (PID $PORT_USER)"
    warn "Claude Code needs this port for OAuth login."
    if [[ "$PROCESS_NAME" == *"mobileactivationd"* ]]; then
      warn "This is a macOS system process. It usually releases the port on retry."
      warn "If login fails, try again in a few seconds."
    else
      warn "You may need to stop this process before logging in."
    fi
  else
    ok "Port 54545 is available (needed for OAuth)"
  fi
fi

# Check network connectivity to Anthropic
if curl -fsSL --max-time 5 -o /dev/null "https://api.anthropic.com" 2>/dev/null; then
  ok "Can reach api.anthropic.com"
else
  warn "Cannot reach api.anthropic.com — check your network/proxy settings."
  if [[ -n "${HTTPS_PROXY:-}" ]]; then
    info "Proxy: $HTTPS_PROXY"
  fi
  warn "Required domains: api.anthropic.com, claude.ai, storage.googleapis.com"
fi

# --- Done! ------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}━━━ Installation complete! ━━━${NC}"
echo ""
echo "  Next steps:"
echo "    1. Run: ${BOLD}claude${NC}"
echo "    2. Follow the OAuth login in your browser"
echo "    3. You need a Claude Pro, Max, Team, or Enterprise subscription"
echo ""
echo "  Useful commands:"
echo "    claude doctor     — diagnose issues"
echo "    claude --version  — check version"
echo "    claude config     — configure settings"
echo ""
if [[ "$SHELL_RC" != "" ]]; then
  echo -e "  ${YELLOW}If 'claude' isn't found in a new terminal, run:${NC}"
  echo "    source $SHELL_RC"
  echo ""
fi
