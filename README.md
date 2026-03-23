# Ruminer Browser Agent

**The AI agent you love with central long-term memory integrating from all your AI chat platforms.**

- Continuously import conversations into EverMemOS across AI chat platforms: ChatGPT, Gemini, Claude, and DeepSeek.
- Your user credentials on these platforms stay secure in your own browser, never uploaded to cloud.
- Freely choose your AI agent backend: OpenClaw, Claude Code, or Codex.
- Make your agent understand you deeply and faithfully via RAG from your centralized EverMemOS memory store.
- Seamlessly integrated into your Chrome browser with beautiful UI and powerful automation.

[Visit Our Landing Page!](https://chrome.ruminer.app)

[Watch Our Demo Video!](https://www.youtube.com/watch?v=nvDG8ZCp-O8)

https://github.com/user-attachments/assets/fb49d045-3d43-49b6-b51a-3ee8ff9ed508

![Chat View](assets/screenshots/chat-session.png)

![Memory View](assets/screenshots/memory-view.png)

![Workflow View](assets/screenshots/workflow-view.png)

## System Architecture

```mermaid
flowchart TB
    subgraph MCP_Clients[MCP Clients]
        Codex[Codex CLI]
        ClaudeCode[Claude Code]
        OpenClawPlugin[OpenClaw]
    end

    subgraph OpenClaw[OpenClaw Gateway]
        Gateway[ws://127.0.0.1:18789]
    end

    subgraph Ruminer[Ruminer Stack]
        NativeServer[Messaging Server]
        McpServer[MCP Server<br/>http://127.0.0.1:12306/mcp]
        Extension[Chrome Extension<br/>Service Worker]
        Sidepanel[Side Panel UI]
        Workflows[Ingestion Workflows]
    end

    subgraph Chrome[Chrome Browser Session]
        APIs[Chrome APIs<br/>tabs, read page, scrolling, click]
    end

    subgraph Memory[EverMemOS]
        EMOS[Memories API]
    end

    subgraph AIPlatforms[AI Chat Platforms]
        ChatPlatforms[ChatGPT, Gemini, Claude, DeepSeek]
    end

    MCP_Clients <-->|"Streamable HTTP"| McpServer
    APIs <-->|"Browser Tools"| McpServer
    EMOS -->|"RAG Tools"| McpServer

    NativeServer <-->|"Native Messaging"| Extension
    Extension <--> APIs

    Sidepanel <-->|"Chat"| NativeServer
    NativeServer <-->|"WebSocket"| Gateway

    Workflows -->|"Memory Upsert"| EMOS
    EMOS -->|"Memory Search"| Sidepanel

    AIPlatforms -->|"Conversation Data"| Workflows
```

The Ruminer UI has three major pillars in one Chrome extension:

1. **Chat tab**: communicate with your CLI agents via native server, providing MCP tools for browser operations and EverMemOS RAG.
   - You can toggle tool groups (Memory / Observe / Navigate / Interact / Execute / Workflow) in the message input box to control which ones the agent can use.
2. **Memory tab**: browse/search/manage your EverMemOS memory store.
   - Memories can be grouped by AI chat platforms they are ingested from.
3. **Workflows tab**: create, edit, and schedule automation workflows to import messages into EverMemOS or accomplish other tasks in browser.
   - Coming soon: agent-driven workflow development by autonomously interacting with the browser and editing the workflow graph!

### Glossary

- **OpenClaw Gateway**: local control plane for chat + tool runtime (Ruminer sidepanel chat talks to it).
- **MCP**: Model Context Protocol; here it’s the standard interface your clients use to call browser tools.
- **EverMemOS**: long‑term agent memory system where Ruminer can search and ingest messages.

## Getting Started (local dev)

### Prerequisites

- Node.js `>= 22.5.0`
- `pnpm` (see `package.json`)
- Chrome/Chromium (MV3 + sidepanel enabled)
- Optional but recommended:
  - `openclaw` CLI (for sidepanel chat + plugin routing)
  - EverMemOS base URL + API key (for memory + ingestion)

### 1) Quick setup

From the repo root, run:

```bash
pnpm install
pnpm -C app/chrome-extension build
```

Then open the extension Welcome page (it opens automatically on install) and run the one‑shot installer
to set up Native Messaging + MCP clients:

```bash
curl -fsSL https://raw.githubusercontent.com/casterkay/ruminer-browser-agent/refs/heads/main/scripts/setup.sh | \
  bash -s -- --extension-id <your-extension-id>
```

This installer (best-effort):

- Installs `chrome-mcp-server` and registers the Native Messaging host (allowlisted to your extension ID)
- Adds Ruminer MCP endpoint to Claude Code and Codex (`ruminer-chrome`)
- Installs + enables the OpenClaw plugin (`openclaw-mcp-client`) and points it to Ruminer MCP URL

### 2) Load the extension

Chrome does not allow “Load unpacked” via script.

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select:
   - `app/chrome-extension/.output/chrome-mv3`

### 3) Configure the extension

In the `Settings` tab in Ruminer side panel:

- **OpenClaw Gateway**
  - WS URL: `ws://127.0.0.1:18789`
  - Token: your Gateway token
- **EverMemOS**
  - Base URL
  - API key

## Verify It Works

1. **MCP tool check**:
   - Ask the agent to call a tool (e.g. "List the current tab titles in my browser") in CLI.
2. **Side panel chat**:
   - Open Ruminer side panel → Chat → send a message → see tool calls render inline
3. **Memory suggestions** (requires EverMemOS configured):
   - Type ≥ 3 characters in message input box → see debounced suggestions appear quickly
4. **Workflows** (requires EverMemOS configured):
   - Open Workflows tab → run a built‑in workflow → re-run should not duplicate (ledger + stable IDs)

## Developer Notes

This is a pnpm workspace with key packages:

- `app/chrome-extension`: MV3 extension (Vue 3 + WXT + Tailwind)
- `app/native-server`: Fastify server + Native Messaging host + MCP transport
- `packages/shared`: shared types + tool schemas

## License

AGPL-3.0 (see `LICENSE`).
