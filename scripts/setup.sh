#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

RUMINER_MCP_URL="${RUMINER_MCP_URL:-http://127.0.0.1:12306/mcp}"
RUMINER_BROWSER_LIST="${RUMINER_BROWSER_LIST:-}"

SKIP_NATIVE_HOST="${SKIP_NATIVE_HOST:-0}"
SKIP_OPENCLAW="${SKIP_OPENCLAW:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"

log() {
  printf '%s\n' "$*"
}

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/setup.sh [--help] [--skip-native-host] [--skip-openclaw] [--no-doctor]

Environment:
  RUMINER_MCP_URL            MCP endpoint (default: http://127.0.0.1:12306/mcp)
  RUMINER_BROWSER_LIST       Optional comma list of browsers for registration doctor (e.g. chrome,chromium,brave)
  SKIP_NATIVE_HOST           Set to 1 to skip building/registering native host
  SKIP_OPENCLAW              Set to 1 to skip OpenClaw plugin install/enable
  RUN_DOCTOR                 Set to 0 to skip native-host doctor checks (default: 1)

Notes:
  - Native host registration MUST whitelist your actual extension ID(s).
  - OpenClaw plugin config (EverMemOS API key / MCP URL) is not auto-written by this script.
USAGE
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
  openclaw plugins install --link "${evermemos_path}" || true
  openclaw plugins enable evermemos || true

  openclaw plugins install --link "${mcp_client_path}" || true
  openclaw plugins enable mcp-client || true

  log "OpenClaw plugins installed/enabled (best-effort)."
  log ""
  log "OpenClaw plugin config reminders:"
  log "- evermemos: set EverMemOS baseUrl + apiKey"
  log "- mcp-client: set mcpUrl=${RUMINER_MCP_URL}"
}

register_native_host() {
  require_cmd pnpm

  log "Installing workspace dependencies..."
  CI=true pnpm -C "${ROOT_DIR}" install

  log "Building native host (app/native-server)..."
  pnpm -C "${ROOT_DIR}" --filter mcp-chrome-bridge build

  log "Registering Native Messaging host (user-level)..."
  node "${ROOT_DIR}/app/native-server/dist/scripts/register-dev.js"

  if [[ "${RUN_DOCTOR}" == "1" ]]; then
    if [[ -f "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" ]]; then
      log "Running native-host doctor (best-effort)..."
      if [[ -n "${RUMINER_BROWSER_LIST}" ]]; then
        node "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" --browser "${RUMINER_BROWSER_LIST}" || true
      else
        node "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" || true
      fi
    fi
  fi
}

main() {
  case "${1:-}" in
    --help|-h)
      usage
      return 0
      ;;
  esac

  for arg in "$@"; do
    case "${arg}" in
      --skip-native-host)
        SKIP_NATIVE_HOST="1"
        ;;
      --skip-openclaw)
        SKIP_OPENCLAW="1"
        ;;
      --no-doctor)
        RUN_DOCTOR="0"
        ;;
      --help|-h)
        ;;
      *)
        log "Unknown arg: ${arg}"
        usage
        exit 1
        ;;
    esac
  done

  check_node_version
  if [[ "${SKIP_NATIVE_HOST}" != "1" ]]; then
    register_native_host
  fi
  if [[ "${SKIP_OPENCLAW}" != "1" ]]; then
    install_openclaw_plugins
  fi

  log ""
  log "Next steps:"
  log "1) Load the extension in chrome://extensions (Developer mode → Load unpacked)."
  log "2) Open the Ruminer sidepanel to start the native host + MCP server."
  log "3) In OpenClaw, enable/configure evermemos + mcp-client."
  log "4) Sanity test:"
  log "   - From OpenClaw: call tool get_windows_and_tabs"
  log "   - From an MCP client: connect to ${RUMINER_MCP_URL} and call get_windows_and_tabs"
  log ""
  log "MCP endpoint:"
  log "  ${RUMINER_MCP_URL}"
}

main "$@"
