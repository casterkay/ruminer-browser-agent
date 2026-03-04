# Quickstart — Ruminer Browser Agent (dev + smoke)

## Prereqs

- Node.js + pnpm
- Chrome (MV3 + sidepanel enabled)
- OpenClaw Gateway running locally (default `ws://127.0.0.1:18789`)
- Ruminer native server running locally (MCP endpoint default `http://127.0.0.1:12306/mcp`)
- EverMemOS reachable (for ingestion workflows)

## Repo setup

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` runs both the extension and the native server in watch mode. The native server dev
script also registers the Native Messaging host for development.

The extension is built with WXT. Use the WXT dev output to load it into Chrome as an unpacked
extension.

## Configure the extension

In the extension Options page:

- **OpenClaw Gateway**
  - WS URL: `ws://127.0.0.1:18789`
  - Auth token: your Gateway token
  - Click “Test connection”
- **EverMemOS (extension direct)**
  - Base URL + API key (+ tenant/space if applicable)
  - Click “Test connection”
- **Tool groups**
  - Defaults: Observe + Navigate ON, Interact + Execute OFF, Workflow ON

## Install/enable OpenClaw plugins (needed for memory search + extension routes)

The repo includes OpenClaw plugin modules under `app/openclaw-extensions/`.

- `evermemos`: provides `evermemos.addMemory`, `evermemos.searchMemory` (Gateway methods)
- `mcp-client`: registers MCP tools from Ruminer’s local MCP server and routes tool calls to it
  (OpenClaw → `mcp-client` → Ruminer native server `http://127.0.0.1:12306/mcp`)

How these are installed depends on your OpenClaw environment:

- **If your OpenClaw supports local plugin installs via CLI** (common pattern):

```bash
openclaw plugins install "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/evermemos"
openclaw plugins enable evermemos

openclaw plugins install "/absolute/path/to/ruminer-browser-agent/app/openclaw-extensions/mcp-client"
openclaw plugins enable mcp-client
```

- **If your OpenClaw uses a plugin allowlist / plugin roots**, add the plugin directories to the
  configured plugin roots/allowlist and restart the Gateway.

## Smoke tests (MVP)

### Sidepanel Chat tab

- Open sidepanel → Chat
- Type a query (≥ 3 chars)
  - If OpenClaw `evermemos` is configured, you should see memory suggestions (debounced)
- Press Enter
  - Message should send via `chat.send`
  - Tool call results should stream inline

### Tool restriction enforcement

- Disable a tool in Ruminer → Tools (e.g. disable `chrome_click_element`, or disable its group)
- Ask the agent to click/type on the page
  - Prompt-layer: the model should avoid calling disabled tools
  - Runtime-layer: the tool call must fail with `isError=true` and a message like:
    `Disabled tool: chrome_click_element. Enable it in Ruminer → Tools.`

### Workflows tab (ChatGPT pack)

- Configure EverMemOS in Options
- Open Workflows tab → run “ChatGPT — Scanner”
- Verify:
  - Progress updates are visible
  - Re-run creates **no duplicates** (ledger + EMOS `message_id=item_key`)
