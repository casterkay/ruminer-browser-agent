# Troubleshooting — Ruminer Browser Agent

## Before you troubleshoot

If you ran the one-shot installer (`scripts/setup.sh`) without `--skip-claude`, `--skip-codex`, or
`--skip-openclaw`, it already attempts to:

- Register the Native Messaging host via `chrome-mcp-server`
- Add the MCP endpoint to Claude Code + Codex as `ruminer-chrome`
- Install/enable/configure the OpenClaw plugin `openclaw-mcp-plugin`

If something still looks wrong, use the sections below to verify and manually fix configuration.

## Native host / MCP connection issues

### “Connection refused” / tool calls time out

1. Confirm the Ruminer extension is installed and enabled in Chrome.
2. Open the extension Welcome page and re-run the one-liner installer (it includes your extension ID).
3. Verify the Native Messaging host:

```bash
chrome-mcp-server doctor
```

If doctor reports errors, try:

```bash
chrome-mcp-server doctor --fix
```

If the `chrome-mcp-server` command is missing, install it:

```bash
npm install -g chrome-mcp-server
```

### Verify MCP endpoint + tools

Ruminer’s MCP endpoint is:

- `http://127.0.0.1:12306/mcp`

From your MCP client, try calling:

- `get_windows_and_tabs`

### Tools show up, but calls fail immediately

- Ensure the Native Messaging allowlist includes your actual extension ID.
  - The installer registers the host using `--extension-id <id>`.
  - If you reloaded/installed the extension into a different Chrome profile, the ID can change.

## MCP client configuration (manual)

### Claude Code doesn’t list `ruminer-chrome`

```bash
claude mcp list
claude mcp get ruminer-chrome
```

Re-add it (user scope):

```bash
claude mcp remove --scope user ruminer-chrome
claude mcp add --transport http --scope user ruminer-chrome http://127.0.0.1:12306/mcp
```

### Codex doesn’t list `ruminer-chrome`

```bash
codex mcp list
codex mcp get ruminer-chrome
```

Re-add it:

```bash
codex mcp remove ruminer-chrome
codex mcp add ruminer-chrome --url http://127.0.0.1:12306/mcp
```

## OpenClaw plugin issues

### OpenClaw can’t route tool calls to Ruminer

Install and enable the plugin:

```bash
openclaw plugins install --pin openclaw-mcp-plugin
openclaw plugins enable openclaw-mcp-plugin
openclaw config set 'plugins.entries["openclaw-mcp-plugin"].config.mcpUrl' "http://127.0.0.1:12306/mcp"
```

Then restart the gateway if it’s already running:

```bash
openclaw gateway restart
```
