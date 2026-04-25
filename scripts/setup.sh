#!/usr/bin/env bash
set -euo pipefail

# Ruminer "all-in-one setup" installer.
#
# Designed to work both from the repo and from:
#   curl -fsSL https://raw.githubusercontent.com/casterkay/ruminer-browser-agent/refs/heads/main/scripts/setup.sh | \
#     bash -s -- --extension-id <your-extension-id>
#
# This script is intentionally "user-only": it does NOT build the extension. Chrome does not allow
# scripting "Load unpacked" anyway; you run this from the extension Welcome page to set up the
# native host + MCP clients + OpenClaw plugin.

RUMINER_MCP_URL="${RUMINER_MCP_URL:-http://127.0.0.1:12306/mcp}"
RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID:-${CHROME_EXTENSION_ID:-}}"

YES="${YES:-0}"
SKIP_NATIVE_HOST="${SKIP_NATIVE_HOST:-0}"
SKIP_OPENCLAW="${SKIP_OPENCLAW:-0}"
SKIP_CLAUDE="${SKIP_CLAUDE:-0}"
SKIP_CODEX="${SKIP_CODEX:-0}"
SKIP_HERMES="${SKIP_HERMES:-0}"
RUN_DOCTOR="${RUN_DOCTOR:-1}"
HERMES_API_KEY="${HERMES_API_KEY:-}"

OPENCLAW_PROFILE="${OPENCLAW_PROFILE:-}"
OPENCLAW_DEV="${OPENCLAW_DEV:-0}"

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  setup.sh [--help] [--yes] [--extension-id <id[,id...]>] [--mcp-url <url>]
           [--skip-native-host] [--skip-openclaw] [--skip-claude] [--skip-codex] [--skip-hermes]
           [--hermes-api-key <key>] [--no-doctor]
           [--openclaw-profile <name>] [--openclaw-dev]

Recommended (from the extension Welcome page):
  curl -fsSL https://raw.githubusercontent.com/casterkay/ruminer-browser-agent/refs/heads/main/scripts/setup.sh | \
    bash -s -- --extension-id <your-extension-id>

Args:
  --yes                      Non-interactive defaults; overwrite existing MCP entries without prompting
  --extension-id <ids>       Chrome extension id(s): 32 chars a-p; or chrome-extension://<id>/
  --mcp-url <url>            Ruminer MCP endpoint (default: http://127.0.0.1:12306/mcp)
  --skip-native-host          Skip installing/registering chrome-mcp-server native host
  --skip-openclaw             Skip OpenClaw plugin install/enable/config
  --skip-claude               Skip Claude Code MCP config
  --skip-codex                Skip Codex MCP config
  --skip-hermes               Skip Hermes Agent MCP/API-server config
  --hermes-api-key <key>      Hermes API server key to configure via `hermes config set`
  --no-doctor                 Skip native-host doctor checks
  --openclaw-profile <name>   Pass --profile <name> to all openclaw commands
  --openclaw-dev              Pass --dev to all openclaw commands

Environment:
  RUMINER_MCP_URL, RUMINER_EXTENSION_ID, YES,
  SKIP_NATIVE_HOST, SKIP_OPENCLAW, SKIP_CLAUDE, SKIP_CODEX, SKIP_HERMES, RUN_DOCTOR,
  HERMES_API_KEY, OPENCLAW_PROFILE, OPENCLAW_DEV
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "Missing required command: $1"
  fi
}

is_windows() {
  [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* || "${OSTYPE:-}" == win32* ]]
}

has_tty() {
  [[ -r /dev/tty ]] && [[ -w /dev/tty ]]
}

prompt_line() {
  local prompt="${1}"
  local default_value="${2:-}"
  local out

  if [[ "${YES}" == "1" ]]; then
    printf '%s' "${default_value}"
    return 0
  fi

  if ! has_tty; then
    die "No TTY available for prompts. Re-run with --yes and required flags."
  fi

  if [[ -n "${default_value}" ]]; then
    printf '%s [%s]: ' "${prompt}" "${default_value}" >/dev/tty
  else
    printf '%s: ' "${prompt}" >/dev/tty
  fi

  IFS= read -r out </dev/tty || true
  out="$(printf '%s' "${out}" | tr -d '\r')"
  if [[ -z "${out}" ]]; then
    printf '%s' "${default_value}"
    return 0
  fi
  printf '%s' "${out}"
}

prompt_confirm() {
  local prompt="${1}"
  local default_yes="${2:-1}"

  if [[ "${YES}" == "1" ]]; then
    return 0
  fi
  if ! has_tty; then
    return 1
  fi

  local hint
  if [[ "${default_yes}" == "1" ]]; then
    hint="Y/n"
  else
    hint="y/N"
  fi

  while true; do
    printf '%s [%s]: ' "${prompt}" "${hint}" >/dev/tty
    local ans
    IFS= read -r ans </dev/tty || true
    ans="$(printf '%s' "${ans}" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | xargs)"

    if [[ -z "${ans}" ]]; then
      [[ "${default_yes}" == "1" ]] && return 0 || return 1
    fi
    case "${ans}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) ;;
    esac
  done
}

prompt_secret() {
  local prompt="${1}"
  local default_value="${2:-}"
  local out

  if [[ "${YES}" == "1" ]]; then
    printf '%s' "${default_value}"
    return 0
  fi

  if ! has_tty; then
    printf '%s' "${default_value}"
    return 0
  fi

  if [[ -n "${default_value}" ]]; then
    printf '%s [%s]: ' "${prompt}" "${default_value}" >/dev/tty
  else
    printf '%s: ' "${prompt}" >/dev/tty
  fi

  IFS= read -r -s out </dev/tty || true
  printf '\n' >/dev/tty
  out="$(printf '%s' "${out}" | tr -d '\r')"
  if [[ -z "${out}" ]]; then
    printf '%s' "${default_value}"
    return 0
  fi
  printf '%s' "${out}"
}

check_node_version() {
  require_cmd node
  local major minor
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  minor="$(node -p "Number(process.versions.node.split('.')[1])")"
  if [[ "${major}" -lt 22 ]] || ([[ "${major}" -eq 22 ]] && [[ "${minor}" -lt 5 ]]); then
    die "Node.js >= 22.5.0 required (found $(node -v))."
  fi
}

normalize_extension_id() {
  local raw
  raw="$(printf '%s' "${1:-}" | xargs)"
  [[ -z "${raw}" ]] && return 0

  if [[ "${raw}" =~ ^chrome-extension://([a-p]{32})/?$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "${raw}" =~ ^[a-p]{32}$ ]]; then
    printf '%s' "${raw}"
    return 0
  fi

  return 1
}

normalize_extension_id_list() {
  local raw="${1:-}"
  local out=""
  local part normalized

  IFS=',' read -r -a parts <<<"${raw}"
  for part in "${parts[@]}"; do
    part="$(printf '%s' "${part}" | xargs)"
    [[ -z "${part}" ]] && continue
    if ! normalized="$(normalize_extension_id "${part}")"; then
      return 1
    fi
    if [[ -z "${out}" ]]; then
      out="${normalized}"
    else
      out="${out},${normalized}"
    fi
  done

  printf '%s' "${out}"
}

ensure_extension_id() {
  local normalized
  normalized="$(normalize_extension_id_list "${RUMINER_EXTENSION_ID:-}")" || true

  if [[ -z "${normalized}" ]]; then
    if [[ "${YES}" == "1" ]]; then
      die "Missing --extension-id. Re-run with: --extension-id <your-extension-id>"
    fi

    local input
    input="$(prompt_line "Paste your Chrome extension ID (from the Ruminer Welcome page)" "")"
    normalized="$(normalize_extension_id_list "${input}")" || die "Invalid extension id. Expected 32 chars a-p."
  fi

  RUMINER_EXTENSION_ID="${normalized}"
  export RUMINER_EXTENSION_ID
  export CHROME_EXTENSION_ID="${RUMINER_EXTENSION_ID}"

  log "Using extension ID(s): ${RUMINER_EXTENSION_ID}"
}

install_or_update_global_npm() {
  # args: npmPackageSpec binName [displayName]
  local pkg_spec="${1}"
  local bin_name="${2}"
  local display="${3:-${2}}"

  require_cmd npm

  if command -v "${bin_name}" >/dev/null 2>&1; then
    log "${display} already installed: $(${bin_name} --version 2>/dev/null || true)"
    if prompt_confirm "Update ${display} to latest?" 0; then
      log "Updating ${display}..."
      if ! npm install -g "${pkg_spec}"; then
        warn "If this failed due to permissions, consider using a Node version manager (nvm/fnm) or configuring npm's global prefix."
        warn "As a last resort, re-run with sudo (not recommended): sudo npm install -g ${pkg_spec}"
        die "Failed to update ${display}."
      fi
    fi
    return 0
  fi

  if [[ "${YES}" != "1" ]]; then
    log "${display} is required for native host registration."
    prompt_confirm "Install ${display} globally now?" 1 || die "Cannot continue without ${display}."
  fi

  log "Installing ${display}..."
  if ! npm install -g "${pkg_spec}"; then
    warn "If this failed due to permissions, consider using a Node version manager (nvm/fnm) or configuring npm's global prefix."
    warn "As a last resort, re-run with sudo (not recommended): sudo npm install -g ${pkg_spec}"
    die "Failed to install ${display}."
  fi
}

register_native_host() {
  if [[ "${SKIP_NATIVE_HOST}" == "1" ]]; then
    log "Skipping native host install/registration."
    return 0
  fi

  install_or_update_global_npm "chrome-mcp-server" "chrome-mcp-server" "chrome-mcp-server"
  require_cmd chrome-mcp-server

  log "Registering Native Messaging host (user-level)..."
  RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" chrome-mcp-server fix-permissions || true
  RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" chrome-mcp-server register --detect || \
    die "Native host registration failed."

  if [[ "${RUN_DOCTOR}" == "1" ]]; then
    log "Running native-host doctor (best-effort)..."
    RUMINER_EXTENSION_ID="${RUMINER_EXTENSION_ID}" chrome-mcp-server doctor --fix --browser all || true
  fi
}

claude_mcp_add_or_replace() {
  local name="ruminer-chrome"
  local scope="user"

  if [[ "${SKIP_CLAUDE}" == "1" ]]; then
    log "Skipping Claude Code MCP config."
    return 0
  fi
  if ! command -v claude >/dev/null 2>&1; then
    log "Claude Code CLI not found; skipping MCP config for Claude Code."
    return 0
  fi

  if claude mcp get "${name}" >/dev/null 2>&1; then
    if [[ "${YES}" == "1" ]] || prompt_confirm "Claude MCP server '${name}' exists. Replace it?" 1; then
      claude mcp remove --scope "${scope}" "${name}" >/dev/null 2>&1 || \
        claude mcp remove "${name}" >/dev/null 2>&1 || true
    else
      log "Keeping existing Claude MCP server '${name}'."
      return 0
    fi
  fi

  log "Adding Claude Code MCP server '${name}' (${scope} scope)..."
  claude mcp add --transport http --scope "${scope}" "${name}" "${RUMINER_MCP_URL}" || \
    die "Failed to add Claude MCP server. Try: claude mcp add --transport http --scope ${scope} ${name} ${RUMINER_MCP_URL}"
}

codex_mcp_add_or_replace() {
  local name="ruminer-chrome"

  if [[ "${SKIP_CODEX}" == "1" ]]; then
    log "Skipping Codex MCP config."
    return 0
  fi
  if ! command -v codex >/dev/null 2>&1; then
    log "Codex CLI not found; skipping MCP config for Codex."
    return 0
  fi

  if codex mcp get "${name}" >/dev/null 2>&1; then
    if [[ "${YES}" == "1" ]] || prompt_confirm "Codex MCP server '${name}' exists. Replace it?" 1; then
      codex mcp remove "${name}" >/dev/null 2>&1 || true
    else
      log "Keeping existing Codex MCP server '${name}'."
      return 0
    fi
  fi

  log "Adding Codex MCP server '${name}'..."
  codex mcp add "${name}" --url "${RUMINER_MCP_URL}" || \
    die "Failed to add Codex MCP server. Try: codex mcp add ${name} --url ${RUMINER_MCP_URL}"
}

configure_hermes_agent() {
  local name="ruminer-chrome"

  if [[ "${SKIP_HERMES}" == "1" ]]; then
    log "Skipping Hermes Agent config."
    return 0
  fi
  if ! command -v hermes >/dev/null 2>&1; then
    log "Hermes CLI not found; skipping Hermes Agent config."
    return 0
  fi

  log "Configuring Hermes Agent API server + MCP bridge..."
  if ! hermes config set API_SERVER_ENABLED true >/dev/null 2>&1; then
    warn "Failed to enable Hermes API server via CLI (best-effort)."
  fi

  local api_key="${HERMES_API_KEY}"
  if [[ -z "${api_key}" && "${YES}" != "1" ]]; then
    api_key="$(prompt_secret "Hermes API server key (leave blank to keep the current Hermes config)" "")"
  fi
  if [[ -n "${api_key}" ]]; then
    if ! hermes config set API_SERVER_KEY "${api_key}" >/dev/null 2>&1; then
      warn "Failed to configure Hermes API server key via CLI (best-effort)."
    fi
  else
    log "Hermes API server key not provided; keeping existing Hermes API key config."
  fi

  if hermes mcp get "${name}" >/dev/null 2>&1; then
    if [[ "${YES}" == "1" ]] || prompt_confirm "Hermes MCP server '${name}' exists. Replace it?" 1; then
      hermes mcp remove "${name}" >/dev/null 2>&1 || true
    else
      log "Keeping existing Hermes MCP server '${name}'."
      return 0
    fi
  fi

  if ! hermes mcp add "${name}" --url "${RUMINER_MCP_URL}" >/dev/null 2>&1; then
    warn "Failed to add Hermes MCP server '${name}'. Try: hermes mcp add ${name} --url ${RUMINER_MCP_URL}"
    return 0
  fi

  if ! hermes mcp test "${name}" >/dev/null 2>&1; then
    warn "Hermes MCP server '${name}' was added but test failed (best-effort)."
  fi

  log "Hermes Agent configured (best-effort). Start it separately with: hermes api-server"
}

openclaw_cmd() {
  local args=()
  if [[ "${OPENCLAW_DEV}" == "1" ]]; then
    args+=("--dev")
  fi
  if [[ -n "${OPENCLAW_PROFILE}" ]]; then
    args+=("--profile" "${OPENCLAW_PROFILE}")
  fi
  openclaw "${args[@]}" "$@"
}

json_merge_add_string_to_array() {
  # args: existingJson addValue
  node - "${1}" "${2}" <<'NODE'
const existingRaw = process.argv[2] ?? 'null';
const add = String(process.argv[3] ?? '').trim();
let existing;
try {
  existing = JSON.parse(existingRaw);
} catch {
  existing = null;
}
const arr = Array.isArray(existing) ? existing : [];
const next = [...new Set(arr.map((v) => String(v)).filter(Boolean).concat(add).filter(Boolean))];
process.stdout.write(JSON.stringify(next));
NODE
}

install_openclaw_plugin() {
  if [[ "${SKIP_OPENCLAW}" == "1" ]]; then
    log "Skipping OpenClaw plugin install/enable/config."
    return 0
  fi
  if ! command -v openclaw >/dev/null 2>&1; then
    log "openclaw CLI not found; skipping plugin install."
    return 0
  fi

  log "Installing OpenClaw plugin: openclaw-mcp-plugin..."
  if ! openclaw_cmd plugins install --pin openclaw-mcp-plugin; then
    warn "OpenClaw plugin install failed (best-effort)."
  fi
  if ! openclaw_cmd plugins enable openclaw-mcp-plugin; then
    warn "OpenClaw plugin enable failed (best-effort)."
  fi

  if ! openclaw_cmd config set "plugins.entries[\"openclaw-mcp-plugin\"].config.mcpUrl" "${RUMINER_MCP_URL}"; then
    warn "OpenClaw plugin config write failed (best-effort)."
  fi

  # Best-effort merge allowlists without clobbering user config.
  local allowRaw alsoAllowRaw
  allowRaw="$(openclaw_cmd config get plugins.allow --json 2>/dev/null || printf 'null')"
  alsoAllowRaw="$(openclaw_cmd config get tools.alsoAllow --json 2>/dev/null || printf 'null')"

  local allowNext alsoAllowNext
  allowNext="$(json_merge_add_string_to_array "${allowRaw}" "openclaw-mcp-plugin")"
  alsoAllowNext="$(json_merge_add_string_to_array "${alsoAllowRaw}" "openclaw-mcp-plugin")"

  if ! openclaw_cmd config set --strict-json plugins.allow "${allowNext}"; then
    warn "OpenClaw plugins.allow update failed (best-effort)."
  fi
  if ! openclaw_cmd config set --strict-json tools.alsoAllow "${alsoAllowNext}"; then
    warn "OpenClaw tools.alsoAllow update failed (best-effort)."
  fi
  if ! openclaw_cmd config set "plugins.entries[\"openclaw-mcp-plugin\"].enabled" true; then
    warn "OpenClaw plugin enable flag update failed (best-effort)."
  fi

  log "OpenClaw plugin installed/enabled + configured (best-effort)."
}

main() {
  if is_windows; then
    die "Windows is not supported by this bash installer. Please install via npm and run: chrome-mcp-server register"
  fi

  local arg
  while [[ $# -gt 0 ]]; do
    arg="${1}"
    case "${arg}" in
      --help|-h)
        usage
        exit 0
        ;;
      --yes)
        YES="1"
        shift
        ;;
      --extension-id)
        if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
          die "Missing value for --extension-id (run --help)"
        fi
        RUMINER_EXTENSION_ID="${2}"
        shift 2
        ;;
      --mcp-url)
        if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
          die "Missing value for --mcp-url (run --help)"
        fi
        RUMINER_MCP_URL="${2}"
        shift 2
        ;;
      --skip-native-host)
        SKIP_NATIVE_HOST="1"
        shift
        ;;
      --skip-openclaw)
        SKIP_OPENCLAW="1"
        shift
        ;;
      --skip-claude)
        SKIP_CLAUDE="1"
        shift
        ;;
      --skip-codex)
        SKIP_CODEX="1"
        shift
        ;;
      --skip-hermes)
        SKIP_HERMES="1"
        shift
        ;;
      --hermes-api-key)
        if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
          die "Missing value for --hermes-api-key (run --help)"
        fi
        HERMES_API_KEY="${2}"
        shift 2
        ;;
      --no-doctor)
        RUN_DOCTOR="0"
        shift
        ;;
      --openclaw-profile)
        if [[ -z "${2:-}" || "${2:-}" == --* ]]; then
          die "Missing value for --openclaw-profile (run --help)"
        fi
        OPENCLAW_PROFILE="${2}"
        shift 2
        ;;
      --openclaw-dev)
        OPENCLAW_DEV="1"
        shift
        ;;
      *)
        die "Unknown arg: ${arg} (run --help)"
        ;;
    esac
  done

  log ""
  log "Ruminer setup (native host + MCP clients + OpenClaw plugin + Hermes Agent)"
  log "MCP URL: ${RUMINER_MCP_URL}"
  log ""

  check_node_version
  ensure_extension_id

  register_native_host
  claude_mcp_add_or_replace
  codex_mcp_add_or_replace
  configure_hermes_agent
  install_openclaw_plugin

  log ""
  log "Setup complete!"
  log "Next: open Claude Code or Codex and try calling a Ruminer tool (e.g. get_windows_and_tabs)."
  log "If you use Hermes Agent, start it separately with: hermes api-server"
}

main "$@"
