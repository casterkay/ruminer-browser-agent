# mcp-chrome-bridge

`mcp-chrome-bridge` is the native (Node.js) side of Ruminer Browser Agent. It:

- Registers a **Chrome Native Messaging** host (`com.chromemcp.nativehost`)
- Runs a local **MCP (Model Context Protocol)** server (HTTP + SSE)
- Bridges MCP tool calls to the Ruminer Chrome extension (MV3 background service worker)

This package is primarily meant to be installed **globally** on a machine that also has the Ruminer
Chrome extension installed.

## Requirements

- Node.js `>=20`
- Google Chrome or Chromium
- Ruminer Chrome extension installed (with `nativeMessaging` permission)

## Install

```bash
npm i -g mcp-chrome-bridge
```

Global installation runs a `postinstall` script that attempts a **user-level** Native Messaging host
registration. If it fails, run the registration command manually (see below).

## Register the Native Messaging host

```bash
# Auto-detect and register for installed browsers
mcp-chrome-bridge register --detect

# Register for a specific browser
mcp-chrome-bridge register --browser chrome
mcp-chrome-bridge register --browser chromium

# System-level registration (requires admin / sudo)
mcp-chrome-bridge register --system
```

## Usage example (extension)

The Ruminer Chrome extension starts the native host and asks it to launch the local MCP server:

```ts
import { NativeMessageType } from 'chrome-mcp-shared';

const nativePort = chrome.runtime.connectNative('com.chromemcp.nativehost');

nativePort.onMessage.addListener((message) => {
  if (message.type === NativeMessageType.SERVER_STARTED) {
    console.log('Native MCP server started on port', message.payload?.port);
  }
  if (message.type === NativeMessageType.ERROR_FROM_NATIVE_HOST) {
    console.error('Native host error:', message.payload?.message);
  }
});

nativePort.postMessage({ type: NativeMessageType.START, payload: { port: 12306 } });
```

Verify the server is up:

```bash
curl -s http://127.0.0.1:12306/ping
```

## What runs where

- **Browser**: the Ruminer extension actually executes browser-side tools (tabs, scripting, etc.)
- **This package**: exposes the MCP endpoint and forwards tool calls to the extension via Native
  Messaging

The native host process is started automatically by Chrome when the extension connects to it; you
normally do not run `dist/index.js` by hand.

## MCP endpoint

Default HTTP endpoint:

- `http://127.0.0.1:12306/mcp`

Health check:

- `GET http://127.0.0.1:12306/ping`

## Stdio proxy (optional)

This package also ships a stdio MCP server that proxies to the HTTP server:

```bash
mcp-chrome-stdio
```

If your HTTP server port changes, update `dist/mcp/stdio-config.json` via:

```bash
mcp-chrome-bridge update-port 12306
```

## Supported agent engines

The built-in HTTP server also exposes Ruminer “agent” endpoints that can run chat sessions using
different engines:

- `openclaw` (via OpenClaw Gateway)
- `codex`
- `claude` (Anthropic)

List available engines:

```bash
curl -s http://127.0.0.1:12306/agent/engines
```

## Configuration notes

- Allowed extension IDs can be provided via `RUMINER_EXTENSION_ID` or `CHROME_EXTENSION_ID` (comma
  separated). The registration scripts also try to derive the extension ID from the built manifest
  key when available.

## Troubleshooting

```bash
# Diagnose common issues (registration, permissions, config)
mcp-chrome-bridge doctor

# Generate a report suitable for GitHub issues
mcp-chrome-bridge report
```

## License

MIT
