# `openclaw-mcp-client`

OpenClaw plugin that routes tool calls to a Streamable HTTP MCP server (e.g. Ruminer’s local MCP
endpoint at `http://127.0.0.1:12306/mcp`).

## Install (users)

```bash
openclaw plugins install --pin openclaw-mcp-client
openclaw plugins enable mcp-client
openclaw config set plugins.entries.mcp-client.config.mcpUrl "http://127.0.0.1:12306/mcp"
```

## Publish (maintainers)

From this directory:

```bash
npm publish --access public
```
