# Troubleshooting — Ruminer Browser Agent

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
npm install -g @poetrycoder/chrome-mcp-server
```

### Tools show up, but calls fail immediately

- Ensure the Native Messaging allowlist includes your actual extension ID.
  - The installer registers the host using `--extension-id <id>`.
  - If you reloaded/installed the extension into a different Chrome profile, the ID can change.

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
openclaw plugins enable mcp-client
openclaw config set plugins.entries.mcp-client.config.mcpUrl "http://127.0.0.1:12306/mcp"
```

Then restart the gateway if it’s already running:

```bash
openclaw gateway restart
```
