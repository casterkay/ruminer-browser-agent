# `openclaw-mcp-client`

OpenClaw plugin that routes tool calls to a Streamable HTTP MCP server (e.g. Ruminer’s local MCP
endpoint at `http://127.0.0.1:12306/mcp`).

## Configuration

Set via `plugins.entries.mcp-client.config`:

- `mcpUrl` (string): MCP server endpoint. Default: `http://127.0.0.1:12306/mcp`
- `transport` (`auto` | `streamable-http` | `sse`): Transport preference. Default: `auto`
- `clientName` (string): Optional MCP client name shown to the server

## Install (users)

```bash
openclaw plugins install --pin openclaw-mcp-client
openclaw plugins enable mcp-client
openclaw config set plugins.entries.mcp-client.config.mcpUrl "http://127.0.0.1:12306/mcp"
```

## Publish (maintainers)

From repo root (recommended):

```bash
pnpm --filter openclaw-mcp-client build
pnpm --filter openclaw-mcp-client publish
```
