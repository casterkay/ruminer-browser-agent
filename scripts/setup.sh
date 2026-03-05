#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

RUMINER_MCP_URL="${RUMINER_MCP_URL:-http://127.0.0.1:12306/mcp}"
RUMINER_BROWSER_LIST="${RUMINER_BROWSER_LIST:-}"

# Optional: used to configure OpenClaw evermemos plugin automatically.
EVERMEMOS_BASE_URL="${EVERMEMOS_BASE_URL:-${EVMEMOS_BASE_URL:-}}"
EVERMEMOS_API_KEY="${EVERMEMOS_API_KEY:-}"

# Optional: if unset, setup.sh will generate CHROME_EXTENSION_KEY in
# app/chrome-extension/.env.local and derive a stable extension ID from it.
CHROME_EXTENSION_KEY="${CHROME_EXTENSION_KEY:-}"
RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID:-${CHROME_EXTENSION_ID:-}}"

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
  RUMINER_BROWSER_LIST       Optional comma list for doctor (e.g. chrome,chromium,brave)
  EVERMEMOS_BASE_URL         EverMemOS base URL (optional)
  EVERMEMOS_API_KEY          EverMemOS API key (optional)
  CHROME_EXTENSION_KEY       Base64 public key for stable extension ID (optional; auto-generated)
  RUMINER_EXTENSION_ID       Extension ID for native messaging allowlist (optional; derived)
  SKIP_NATIVE_HOST           Set to 1 to skip building/registering native host
  SKIP_OPENCLAW              Set to 1 to skip OpenClaw plugin install/enable
  RUN_DOCTOR                 Set to 0 to skip native-host doctor checks (default: 1)

Notes:
  - Native host registration MUST whitelist your actual extension ID(s).
  - OpenClaw plugin config is auto-written when openclaw CLI is present:
    - mcp-client: mcpUrl (from RUMINER_MCP_URL)
    - evermemos: evermemosBaseUrl/apiKey (from EVERMEMOS_BASE_URL/EVERMEMOS_API_KEY)
  - Chrome extension build output:
    - app/chrome-extension/.output/chrome-mv3
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
  local major minor
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  minor="$(node -p "Number(process.versions.node.split('.')[1])")"
  # Native server declares >=22.5.0; enforce a close minimum here.
  if [[ "${major}" -lt 22 ]] || ([[ "${major}" -eq 22 ]] && [[ "${minor}" -lt 5 ]]); then
    log "Node.js >= 22.5.0 required (found $(node -v))"
    exit 1
  fi
}

ensure_extension_identity() {
  # Ensure we have a stable extension key (manifest.key) and a corresponding extension ID.
  # Writes app/chrome-extension/.env.local when needed.
  # Emits EXTENSION_ID on stdout.
  local env_file="${ROOT_DIR}/app/chrome-extension/.env.local"

  local extension_id
  extension_id="$(
    CHROME_EXTENSION_KEY="${CHROME_EXTENSION_KEY}" \
      RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" \
      ROOT_DIR="${ROOT_DIR}" \
      node <<'NODE'
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = (process.env.ROOT_DIR || '').trim() || process.cwd();
const envFile = path.join(root, 'app/chrome-extension/.env.local');

function parseEnvFile(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function extensionIdFromSpkiDer(spkiDer) {
  const hash = crypto.createHash('sha256').update(spkiDer).digest();
  const hex = hash.subarray(0, 16).toString('hex');
  return hex
    .split('')
    .map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16)))
    .join('');
}

function isValidExtensionId(id) {
  return typeof id === 'string' && /^[a-p]{32}$/.test(id);
}

const explicitId = (process.env.RUMINER_EXTENSION_ID || '').trim();
if (explicitId) {
  if (!isValidExtensionId(explicitId)) {
    console.error('Invalid RUMINER_EXTENSION_ID (expected 32 chars a-p)');
    process.exit(1);
  }
  process.stdout.write(explicitId);
  process.exit(0);
}

const fromFile = parseEnvFile(envFile);
let keyBase64 = (process.env.CHROME_EXTENSION_KEY || '').trim() || (fromFile.CHROME_EXTENSION_KEY || '').trim();

if (!keyBase64) {
  // Generate a stable dev key (public key only) for Chrome extension ID stability.
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  keyBase64 = spkiDer.toString('base64');

  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  let existing = '';
  try {
    existing = fs.readFileSync(envFile, 'utf8');
  } catch {
    existing = '';
  }
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(envFile, `${existing}${prefix}CHROME_EXTENSION_KEY=${keyBase64}\n`, 'utf8');
}

let spki;
try {
  spki = Buffer.from(keyBase64, 'base64');
  if (!spki.length) throw new Error('empty');
} catch {
  console.error('Invalid CHROME_EXTENSION_KEY (must be base64)');
  process.exit(1);
}

process.stdout.write(extensionIdFromSpkiDer(spki));
NODE
  )"

  if [[ -z "${extension_id}" ]]; then
    log "Failed to derive extension ID."
    exit 1
  fi

  RUMINER_EXTENSION_ID="${extension_id}"
  export RUMINER_EXTENSION_ID
  export CHROME_EXTENSION_ID="${RUMINER_EXTENSION_ID}"

  log "Using extension ID: ${RUMINER_EXTENSION_ID}"
  log "Chrome extension key stored at: ${env_file}"
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

  # Auto-write config (best-effort)
  openclaw config set plugins.entries.mcp-client.config.mcpUrl "${RUMINER_MCP_URL}" || true

  # Ensure plugins are allowed and enabled in config (best-effort).
  # Prefer explicit allowlist setting; note this will overwrite plugins.allow if present.
  openclaw config set plugins.allow '["mcp-client", "evermemos"]' --strict-json || true
  openclaw config set plugins.entries.mcp-client.enabled true || true
  openclaw config set plugins.entries.evermemos.enabled true || true

  if [[ -n "${EVERMEMOS_BASE_URL}" ]]; then
    openclaw config set plugins.entries.evermemos.config.evermemosBaseUrl "${EVERMEMOS_BASE_URL}" || true
  fi
  if [[ -n "${EVERMEMOS_API_KEY}" ]]; then
    openclaw config set plugins.entries.evermemos.config.apiKey "${EVERMEMOS_API_KEY}" || true
  fi

  log "OpenClaw plugins installed/enabled + configured (best-effort)."
  if [[ -z "${EVERMEMOS_BASE_URL}" || -z "${EVERMEMOS_API_KEY}" ]]; then
    log ""
    log "EverMemOS not fully configured (set EVERMEMOS_BASE_URL and EVERMEMOS_API_KEY to auto-configure)."
  fi
}

build_extension() {
  require_cmd pnpm
  log "Building Chrome extension (app/chrome-extension)..."
  pnpm -C "${ROOT_DIR}/app/chrome-extension" build
}

register_native_host() {
  require_cmd pnpm

  log "Installing workspace dependencies..."
  CI=true pnpm -C "${ROOT_DIR}" install

  log "Building native host (app/native-server)..."
  pnpm -C "${ROOT_DIR}" --filter mcp-chrome-bridge build

  log "Registering Native Messaging host (user-level)..."
  RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" node "${ROOT_DIR}/app/native-server/dist/scripts/register-dev.js"

  if [[ "${RUN_DOCTOR}" == "1" ]]; then
    if [[ -f "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" ]]; then
      log "Running native-host doctor (best-effort)..."
      if [[ -n "${RUMINER_BROWSER_LIST}" ]]; then
        RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" node "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" --browser "${RUMINER_BROWSER_LIST}" || true
      else
        RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" node "${ROOT_DIR}/app/native-server/dist/scripts/doctor.js" || true
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

  # Generate/derive a stable extension identity early so native-host registration can whitelist it.
  ensure_extension_identity

  # Build extension output so you can immediately "Load unpacked" the dist.
  build_extension

  if [[ "${SKIP_NATIVE_HOST}" != "1" ]]; then
    register_native_host
  fi
  if [[ "${SKIP_OPENCLAW}" != "1" ]]; then
    install_openclaw_plugins
  fi

  log ""
  log "Next steps:"
  log "1) Load the extension in chrome://extensions (Developer mode → Load unpacked):"
  log "   ${ROOT_DIR}/app/chrome-extension/.output/chrome-mv3"
  log "2) Open the Ruminer sidepanel to start the native host + MCP server."
  log "3) Sanity test:"
  log "   - From OpenClaw: call tool get_windows_and_tabs"
  log "   - From an MCP client: connect to ${RUMINER_MCP_URL} and call get_windows_and_tabs"
  log ""
  log "Dev extension ID (allowlisted for native messaging):"
  log "  ${RUMINER_EXTENSION_ID}"
  log ""
  log "MCP endpoint:"
  log "  ${RUMINER_MCP_URL}"
}

main "$@"
