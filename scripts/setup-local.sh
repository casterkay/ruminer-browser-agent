#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID:-chbienkbakdikbkehibcoolnafdjdkln}"
RUMINER_MCP_URL="${RUMINER_MCP_URL:-http://127.0.0.1:12306/mcp}"

log() {
  printf '%s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

check_node_version() {
  require_cmd node
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "${major}" -lt 20 ]]; then
    log "Node.js >= 20 required (found $(node -v))"
    exit 1
  fi
}

install_openclaw_plugins() {
  if ! command -v openclaw >/dev/null 2>&1; then
    log "openclaw CLI not found; skipping plugin install."
    return 0
  fi

  local evermemos_path="${ROOT_DIR}/app/openclaw-extensions/evermemos"
  local mcp_client_path="${ROOT_DIR}/app/openclaw-extensions/mcp-client"

  log "Installing/enabling OpenClaw plugins..."
  openclaw plugins install "${evermemos_path}" || true
  openclaw plugins enable evermemos || true

  openclaw plugins install "${mcp_client_path}" || true
  openclaw plugins enable mcp-client || true

  log "OpenClaw plugins installed/enabled (best-effort)."
}

register_native_host() {
  require_cmd pnpm

  log "Installing workspace dependencies..."
  CI=true pnpm -C "${ROOT_DIR}" install

  log "Building native host (app/native-server)..."
  pnpm -C "${ROOT_DIR}" --filter mcp-chrome-bridge build

  log "Registering Native Messaging host (user-level)..."
  RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" node \
    "${ROOT_DIR}/app/native-server/dist/scripts/register-dev.js"
}

main() {
  check_node_version
  register_native_host
  install_openclaw_plugins

  log ""
  log "Next steps:"
  log "1) Load the extension from ${ROOT_DIR}/app/chrome-extension (wxt build/dev output) in chrome://extensions."
  log "2) Open the Ruminer sidepanel to start the native host + MCP server."
  log "3) In OpenClaw, configure evermemos + enable mcp-client."
  log "4) Test:"
  log "   openclaw tool call get_windows_and_tabs"
  log ""
  log "MCP endpoint:"
  log "  ${RUMINER_MCP_URL}"
}

main "$@"
