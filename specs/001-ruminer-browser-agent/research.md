# Phase 0 Research — Ruminer Browser Agent

This document resolves the “unknowns” needed to turn the blueprint/spec into concrete design
artifacts and implementation tasks.

## Key Findings (current repo state)

- The extension currently boots a **native messaging + local agent server** integration:
  - Background entrypoint calls `initNativeHostListener()` (`app/chrome-extension/entrypoints/background/index.ts`).
  - The native host path is implemented in `app/chrome-extension/entrypoints/background/native-host.ts`
    and exposes tool execution via `NativeMessageType.CALL_TOOL`.
  - Sidepanel “agent chat” currently talks to `http://127.0.0.1:<port>/agent/...` and streams via SSE
    (`EventSource`) in `app/chrome-extension/entrypoints/sidepanel/composables/useAgentServer.ts`.
- The extension already includes an **OpenClaw Gateway WebSocket operator client** for chat (`chat.*`):
  - `app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts`
  - `app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- The repo includes OpenClaw plugin modules:
  - `app/openclaw-extensions/evermemos/openclaw.plugin.json` + `index.ts`
  - Uses `registerGatewayMethod('evermemos.addMemory'|'evermemos.searchMemory'|...)`.
- `app/openclaw-extensions/mcp-client/index.ts` implements **OpenClaw → MCP client → Ruminer MCP server**
  forwarding and can register `TOOL_SCHEMAS` into OpenClaw.
- RR-V3 runtime already exists in the extension and is enabled via feature flag:
  - Bootstrapped from `app/chrome-extension/entrypoints/background/record-replay-v3/bootstrap.ts`.

## Decision 1 — Primary tool transport: Native MCP server (core)

- **Decision**: Keep the native server (`app/native-server`) + Native Messaging as the primary tool
  transport between the browser extension and the local MCP server. For OpenClaw-initiated tool
  calls, the end-to-end flow is: **OpenClaw → `mcp-client` plugin → Ruminer MCP server (native
  host) → Native Messaging → Extension (background/sidepanel)**.
- **Rationale**:
  - The native server is the stable integration point for multiple “backends” (Claude Code, Codex,
    OpenClaw via `mcp-client`).
  - The extension remains the browser-side executor (via Native Messaging), which is MV3-friendly.
- **Alternatives considered**:
  - Implement a Gateway WS _node_ client (`node.invoke`) for tool calls: deferred; not required when
    OpenClaw can call MCP tools via `mcp-client`.

## Decision 2 — Gateway protocol framing and handshake (chat UI)

- **Decision**: Implement the Gateway WS protocol as described in `docs/knowledge/openclaw-chat-ui.md`:
  - First frame is a request: `{ type: "req", id, method: "connect", params: { ... } }`
  - Expect `{ type: "res", id, ok: true, payload: { type: "hello-ok", ... } }`
  - Listen for push events (event frames) and sequence gaps.
- **Rationale**:
  - Keeps the extension aligned with the documented Gateway schemas (the Gateway validates frames).
  - Sidepanel chat only requires `chat.*` methods + events as an operator client.

## Decision 3 — Sidepanel chat session strategy

- **Decision (MVP)**: Use a single deterministic `sessionKey = "main"` for the sidepanel UI.
- **Rationale**:
  - Minimizes UX/complexity early; consistent with OpenClaw chat UI guidance (deterministic session).
  - Keeps room for a later session switcher without changing wire protocol.
- **Alternatives considered**:
  - Per-tab sessions or per-project sessions: rejected for MVP due to user confusion and state
    explosion; can be layered later.

## Decision 4 — Tool groups: prompt-layer enforcement in chat UI

- **Decision**: Implement tool groups fully inside the extension:
  - **Prompt layer**: prepend a system instruction to `chat.send` describing disabled groups/tools.
- **Rationale**:
  - Prompt-layer restriction is implemented today and improves model compliance.
  - If runtime rejection is required, it must be enforced where tools are executed (native-server and/or
    extension tool handlers).

## Decision 5 — OpenClaw tool exposure via `mcp-client`

- **Decision**: Use `app/openclaw-extensions/mcp-client` to register `TOOL_SCHEMAS` into OpenClaw and
  forward tool calls to Ruminer’s local MCP server.
- **Rationale**:
  - Keeps a single canonical tool execution surface (MCP) across Claude Code/Codex/OpenClaw.

## Decision 7 — EMOS integration split remains intentional

- **Decision**: Keep both EMOS paths:
  - OpenClaw `evermemos` plugin for **chat memory search** and **auto-ingest OpenClaw conversations**
  - Extension direct EMOS client for **autonomous ingestion workflows**
- **Rationale**:
  - Autonomous ingestion workflows (e.g. ChatGPT ingest) run within the extension, deterministically converting message elements in DOM into standard EMOS message JSON. OpenClaw is for authoring and repairing workflows, not in the ingestion path.
  - Matches modular degradation requirements: ingestion can work without OpenClaw running; chat can
    work without extension EMOS creds.

## Implementation Implications (what changes where)

- **Keep** native-host/native-server as core plumbing (Native Messaging + MCP).
- **Ensure** sidepanel chat uses Gateway WS operator flow (`chat.history`, `chat.send`, `chat.abort`).
- **Ensure** OpenClaw plugins are installed/enabled (`evermemos`, `mcp-client`).

## Open Questions (resolved enough for planning)

- **Exact list of “standard” browser proxy routes** expected by OpenClaw built-in browser tool:
  - For planning, treat them as: `/snapshot`, `/act`, `/navigate`, `/tabs/*`, etc., and implement
    a compatibility adapter once we pull in OpenClaw route list during implementation.
  - The extension-specific routes are fully controlled by this repo and defined in contracts.
