# `openclaw-mcp-plugin`

OpenClaw plugin that routes tool calls to a Streamable HTTP MCP server (configured via URL).

Requires OpenClaw's new Plugin SDK runtime (this package externalizes `openclaw/*` imports and expects the host to provide them) and Node.js `>=22`.

Tools are discovered from the MCP server via `listTools()` and registered dynamically in OpenClaw.

## Configuration

Set via `plugins.entries.openclaw-mcp-plugin.config`:

- `mcpUrl` (string): MCP server endpoint. Default: `http://127.0.0.1:12306/mcp`
- `transport` (`auto` | `streamable-http` | `sse`): Transport preference. Default: `auto`
- `clientName` (string): Optional MCP client name shown to the server

## Installation

```bash
openclaw plugins install --pin openclaw-mcp-plugin
openclaw plugins enable openclaw-mcp-plugin
openclaw config set 'plugins.entries["openclaw-mcp-plugin"].config.mcpUrl' "http://127.0.0.1:12306/mcp"
```
