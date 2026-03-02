#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID:-chbienkbakdikbkehibcoolnafdjdkln}"
RUMINER_MCP_URL="${RUMINER_MCP_URL:-http://127.0.0.1:12306/mcp}"
MCPORTER_SERVER_NAME="${MCPORTER_SERVER_NAME:-ruminer}"

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

ensure_mcporter() {
  if command -v mcporter >/dev/null 2>&1; then
    return 0
  fi

  require_cmd npm
  log "Installing mcporter globally..."
  npm install -g mcporter
}

configure_mcporter() {
  require_cmd node
  local config_dir="${HOME}/.mcporter"
  local config_path="${config_dir}/mcporter.json"

  mkdir -p "${config_dir}"

  RUMINER_MCP_URL="${RUMINER_MCP_URL}" MCPORTER_SERVER_NAME="${MCPORTER_SERVER_NAME}" node <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');

const url = String(process.env.RUMINER_MCP_URL || 'http://127.0.0.1:12306/mcp').trim();
const name = String(process.env.MCPORTER_SERVER_NAME || 'ruminer').trim() || 'ruminer';
const configPath = path.join(os.homedir(), '.mcporter', 'mcporter.json');

fs.mkdirSync(path.dirname(configPath), { recursive: true });

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  config = {};
}

if (!config || typeof config !== 'object' || Array.isArray(config)) {
  config = {};
}

const existingServers =
  config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)
    ? config.mcpServers
    : {};

existingServers[name] = {
  ...(existingServers[name] || {}),
  description: 'Ruminer local MCP server (Chrome extension bridge)',
  baseUrl: url,
};

config.mcpServers = existingServers;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
process.stdout.write(`Updated ${configPath}\n`);
NODE
}

install_openclaw_plugins() {
  if ! command -v openclaw >/dev/null 2>&1; then
    log "openclaw CLI not found; skipping plugin install."
    return 0
  fi

  local evermemos_path="${ROOT_DIR}/app/openclaw-extensions/evermemos"
  local browser_ext_path="${ROOT_DIR}/app/openclaw-extensions/browser-ext"

  log "Installing/enabling OpenClaw plugins..."
  openclaw plugins install "${evermemos_path}" || true
  openclaw plugins enable evermemos || true

  openclaw plugins install "${browser_ext_path}" || true
  openclaw plugins enable browser-ext || true

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

verify_mcporter_connection() {
  if ! command -v mcporter >/dev/null 2>&1; then
    return 0
  fi

  log "Verifying mcporter can see the Ruminer MCP server (best-effort)..."
  if mcporter list "${MCPORTER_SERVER_NAME}" --json >/dev/null 2>&1; then
    log "mcporter list OK: ${MCPORTER_SERVER_NAME}"
    return 0
  fi

  log "mcporter list failed (this is expected until Chrome extension is loaded and native host is running)."
  log "Once the extension is running, try:"
  log "  mcporter list ${MCPORTER_SERVER_NAME}"
}

main() {
  check_node_version
  register_native_host
  ensure_mcporter
  configure_mcporter
  install_openclaw_plugins
  verify_mcporter_connection

  log ""
  log "Next steps:"
  log "1) Load the extension from ${ROOT_DIR}/app/chrome-extension (wxt build/dev output) in chrome://extensions."
  log "2) Open the Ruminer sidepanel to start the native host + MCP server."
  log "3) In OpenClaw, configure evermemos + enable browser-ext (mcporter bridge)."
  log "4) Test:"
  log "   mcporter call ${MCPORTER_SERVER_NAME}.get_windows_and_tabs --output json"
}

main "$@"
