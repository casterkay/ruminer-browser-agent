# CLI MCP Configuration Guide (Codex CLI + Claude Code)

This guide explains how to configure **Codex CLI** and **Claude Code** to connect to Ruminer’s local MCP server
(Chrome automation tools exposed over Streamable HTTP).

## Overview

Ruminer exposes its MCP endpoint at:

- `http://127.0.0.1:12306/mcp` (default)

After configuration, your CLI MCP client should be able to call tools such as:

- `get_windows_and_tabs`
- `chrome_navigate`
- `chrome_get_web_content`
- `chrome_click_element`
- `chrome_read_page`

Tool names are defined in `packages/shared/src/tools.ts`.

## Codex CLI

Run:

```bash
codex mcp add ruminer-chrome --url http://127.0.0.1:12306/mcp
```

## Claude Code

Run:

```bash
claude mcp add --transport http ruminer-chrome http://127.0.0.1:12306/mcp
```

## OpenClaw (mcp-client plugin)

If you use OpenClaw and want it to route tool calls to Ruminer, install/enable the `mcp-client` plugin and
point it at Ruminer’s MCP URL.

From the repo root:

```bash
openclaw plugins install ./app/openclaw-extensions/mcp-client || true
openclaw plugins enable mcp-client || true

# Auto-write config (best-effort)
openclaw config set plugins.entries.mcp-client.config.mcpUrl "http://127.0.0.1:12306/mcp" || true

# Ensure plugins and their tools are enabled in config (best-effort).
openclaw config set plugins.allow '["mcp-client", "evermemos"]' --strict-json || true
openclaw config set plugins.entries.mcp-client.enabled true || true
openclaw config set tools.alsoAllow '["mcp-client"]' --strict-json || true

openclaw gateway restart || true
```

If you’re doing a local dev install, `bash scripts/setup.sh` runs an equivalent sequence (best-effort) when
`openclaw` is available.

## Verify connection

From your CLI client, try:

- `get_windows_and_tabs`

If it succeeds, the MCP transport is connected and the extension/native host bridge is working.

## Troubleshooting

### Connection refused / timeout

1. Confirm the extension is loaded (`chrome://extensions` → Developer mode → Load unpacked).
2. Confirm the Native Messaging host is registered (run `bash scripts/setup.sh` again).
3. Confirm Ruminer is using the expected port (default `12306`).
4. Run:
   - `mcp-chrome-bridge doctor`

### Tools don’t appear / tool list is empty

1. Restart the CLI tool after updating MCP config.
2. Confirm you’re pointing at the correct URL:
   - `http://127.0.0.1:12306/mcp`

### Port conflicts (12306 already in use)

If you change Ruminer’s MCP port, you must update your CLI MCP URL to match.

If you are using the `mcp-chrome-bridge` stdio helper and need to rewrite its local config, use:

```bash
mcp-chrome-bridge update-port <new-port>
```
