# Quickstart — Ruminer Browser Agent (dev + smoke)

## Prereqs

- Node.js + pnpm
- Chrome (MV3 + sidepanel enabled)
- OpenClaw Gateway running locally (default `ws://127.0.0.1:18789`)
- EverMemOS reachable (for ingestion workflows)

## Repo setup

```bash
pnpm install
pnpm run dev
```

The extension is built with WXT. Use the WXT dev output to load the extension into Chrome as an
unpacked extension.

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
- `browser-ext`: provides the `browser-ext` tool (action → `browser.request` route mapping)

How these are installed depends on your OpenClaw environment:

- **If your OpenClaw supports local plugin installs via CLI** (common pattern):

```bash
openclaw plugins install "/absolute/path/to/ruminer-browser/app/openclaw-extensions/evermemos"
openclaw plugins enable evermemos

openclaw plugins install "/absolute/path/to/ruminer-browser/app/openclaw-extensions/browser-ext"
openclaw plugins enable browser-ext
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

### Tool group enforcement

- Disable `Interact`
- Ask the agent to click/type on the page
  - Prompt-layer: the model should avoid calling blocked tools
  - Runtime-layer: `browser.proxy` calls mapped to Interact must fail with “disabled by tool group”

### Workflows tab (ChatGPT pack)

- Configure EverMemOS in Options
- Open Workflows tab → run “ChatGPT ingestion”
- Verify:
  - Progress updates are visible
  - Re-run creates **no duplicates** (ledger + EMOS `message_id=item_key`)
