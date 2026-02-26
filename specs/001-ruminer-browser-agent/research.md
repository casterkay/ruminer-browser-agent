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
- There is **no OpenClaw Gateway WebSocket client** in the extension yet (no `chat.*`, no `node.invoke`).
- The repo already includes an OpenClaw plugin module for EverMemOS:
  - `app/openclaw-extensions/evermemos/openclaw.plugin.json` + `index.ts`
  - Uses `registerGatewayMethod('evermemos.addMemory'|'evermemos.searchMemory'|...)`.
- `app/openclaw-extensions/browser-ext/` exists but is currently **empty** (needs implementation).
- RR-V3 runtime already exists in the extension and is enabled via feature flag:
  - Bootstrapped from `app/chrome-extension/entrypoints/background/record-replay-v3/bootstrap.ts`.

## Decision 1 — Primary transport: OpenClaw Gateway WebSocket (node)

- **Decision**: Replace the native-host/MCP/SSE agent-server path with a Gateway WS connection from
  the extension background service worker, using `role: "node"` and `caps: ["browser"]`.
- **Rationale**:
  - Matches the blueprint/spec architecture and reduces moving parts (no native host install).
  - OpenClaw’s Gateway is already the system control plane (chat + tools + nodes).
  - MV3 reliability improves by consolidating state/transport into one connection with explicit
    reconnection logic.
- **Alternatives considered**:
  - Keep the native server (Fastify + SSE) and bridge Gateway → MCP: rejected because blueprint
    explicitly removes this layer and it duplicates routing/auth concepts.

## Decision 2 — Gateway protocol framing and handshake

- **Decision**: Implement the Gateway WS protocol as described in `docs/knowledge/openclaw-chat-ui.md`:
  - First frame is a request: `{ type: "req", id, method: "connect", params: { ... } }`
  - Expect `{ type: "res", id, ok: true, payload: { type: "hello-ok", ... } }`
  - Listen for push events (event frames) and sequence gaps.
- **Rationale**:
  - Keeps the extension aligned with the documented Gateway schemas (the Gateway validates frames).
  - Enables both node capability handling (`node.invoke`) and chat UI (`chat.*`) over one socket.

## Decision 3 — Sidepanel chat session strategy

- **Decision (MVP)**: Use a single deterministic `sessionKey = "main"` for the sidepanel UI.
- **Rationale**:
  - Minimizes UX/complexity early; consistent with OpenClaw chat UI guidance (deterministic session).
  - Keeps room for a later session switcher without changing wire protocol.
- **Alternatives considered**:
  - Per-tab sessions or per-project sessions: rejected for MVP due to user confusion and state
    explosion; can be layered later.

## Decision 4 — `browser.proxy` superset dispatcher contract

- **Decision**: Implement a route dispatcher in background SW that accepts “proxy” requests shaped as:
  - `{ method: string, path: string, query?: Record<string, string>, body?: unknown }`

  …and routes to:
  - **Standard browser routes** expected by OpenClaw’s built-in `browser` tool (snapshot/act/navigate/tabs).
  - **Extension-specific routes** (bookmarks/history/network/flows/ledger/element selection).

- **Rationale**:
  - Matches blueprint’s “one protocol: `browser.proxy`” and allows plugins/tools to reuse a single
    routing surface.

## Decision 5 — Tool groups: dual-layer enforcement owned by extension

- **Decision**: Implement tool groups fully inside the extension:
  - **Prompt layer**: prepend a system instruction to `chat.send` describing disabled groups/tools.
  - **Runtime layer**: reject `browser.proxy` routes that fall into disabled groups with a clear error.
- **Rationale**:
  - Blueprint/spec require the `browser-ext` plugin to be unaware of tool groups.
  - Runtime rejection is the only hard safety boundary; prompt layer improves model compliance.

## Decision 6 — OpenClaw plugin packaging for `browser-ext`

- **Decision**: Implement `browser-ext` as an OpenClaw plugin module mirroring `evermemos`:
  - `app/openclaw-extensions/browser-ext/openclaw.plugin.json`
  - `app/openclaw-extensions/browser-ext/index.ts`
- **Rationale**:
  - Consistent with existing plugin module structure already used in-repo.
  - Keeps the plugin logic minimal: action → `browser.request` route mapping only.

## Decision 7 — EMOS integration split remains intentional

- **Decision**: Keep both EMOS paths:
  - OpenClaw `evermemos` plugin for **chat memory search** and **auto-ingest OpenClaw conversations**
  - Extension direct EMOS client for **autonomous ingestion workflows**
- **Rationale**:
  - Matches modular degradation requirements: ingestion can work without OpenClaw running; chat can
    work without extension EMOS creds.

## Implementation Implications (what changes where)

- **Remove/disable** native-host/MCP assumptions in UI and background:
  - Replace `useAgentServer` (SSE + port) and `useAgentChat` (HTTP POST /act) with a Gateway WS-based
    transport.
  - Remove welcome/popup surfaces that instruct users to install a native host.
- **Add**:
  - Gateway WS client module in background, reconnection + pairing UX hooks.
  - `node.invoke` handler that dispatches `browser.proxy` calls.
  - Sidepanel chat transport around `chat.history`, `chat.send`, `chat.abort`, streaming via `chat`
    and `agent` events.
  - `browser-ext` OpenClaw plugin module and route mapping definitions.
  - Add welcome/popup surfaces that instruct users to install the openclaw plugins.

## Open Questions (resolved enough for planning)

- **Exact list of “standard” browser proxy routes** expected by OpenClaw built-in browser tool:
  - For planning, treat them as: `/snapshot`, `/act`, `/navigate`, `/tabs/*`, etc., and implement
    a compatibility adapter once we pull in OpenClaw route list during implementation.
  - The extension-specific routes are fully controlled by this repo and defined in contracts.
