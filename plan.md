# Unified OpenClaw Integration Plan (No EngineAdapter)

## Goal

Make **OpenClaw** a first-class engine integrated the same way as Claude/Codex: requests go through the native-server **AgentChatService** (`/agent/chat/:sessionId/act`), and the UI consumes a single **SSE RealtimeEvent** stream (no direct OpenClaw-Gateway chat path in the sidepanel).

Constraints / invariants:

- **No EngineAdapter** abstraction.
- OpenClaw must implement the existing native-server engine contract: `AgentEngine.initializeAndRun(options, ctx)`.
- Streaming must use the shared `RealtimeEvent` union (from `chrome-mcp-shared`).
- Engine output must include a `sessionId` in every non-heartbeat event (required by `AgentStreamManager.publish()` routing).

Non-goals:

- Changing UI layout/UX beyond wiring settings & removing dead code.
- Adding new features unrelated to unification.

## Current Problems (What’s Broken)

1. **Shared engine union drift**: `AgentCliPreference` in `packages/shared/src/agent-types.ts` does **not** include `openclaw`, while native-server `EngineName` does. This causes casts and breaks type-safety.
2. **OpenClaw engine emits non-standard events**: `app/native-server/src/agent/engines/openclaw.ts` currently emits `{ type: 'text_delta' | 'tool_delta' }`, which is not part of `RealtimeEvent`.
3. **Missing Gateway connect/auth handshake**: OpenClaw engine hardcodes `ws://127.0.0.1:18789` and calls `chat.send` without the `connect.challenge` + signed `connect` handshake.
4. **Duplicate/legacy extension path**: sidepanel contains a direct Gateway chat implementation (`useOpenClawGateway`, `useOpenClawChat`, `useChatBackendPreference`) that is effectively unused by the main chat UI.
5. **Settings ownership mismatch**: gateway WS URL/token + device identity are currently stored in extension `chrome.storage.local`; desired architecture is native-server-owned configuration.

## Architecture Target

Single pipeline:

- Sidepanel sends instructions to native-server via `/agent/chat/:sessionId/act`.
- Native-server `AgentChatService` selects engine (`openclaw`, `claude`, `codex`, …).
- Engine emits **standard** `RealtimeEvent` events.
- Native-server streams events over SSE; extension consumes them via `useAgentServer`/`useAgentChat`.

OpenClaw specifics:

- Native-server holds OpenClaw Gateway connection settings and (Node) device identity.
- Engine performs Gateway **WebSocket open → optional connect.challenge → signed connect → chat.send**.

## Implementation Steps

### Phase 0 — Prepare a tracking checklist

- Create a small TODO list issue / checklist for:
  - Shared types
  - Native-server settings persistence
  - Gateway handshake
  - OpenClaw engine rewrite
  - Extension settings wiring
  - Extension cleanup
  - Docs updates

### Phase 1 — Fix shared types (single source of truth)

**Files**

- `packages/shared/src/agent-types.ts`

**Changes**

- Add `'openclaw'` to `export type AgentCliPreference = ...`.

**Why**

- This is the shared engine identity used by UI, native-server requests, sessions, and projects.

**Verification**

- `pnpm typecheck` (workspace)

### Phase 2 — Remove duplicated engine-name union in native-server

**Files**

- `app/native-server/src/agent/engines/types.ts`

**Changes**

- Define `EngineName` in terms of shared types (e.g. `import type { AgentCliPreference } from '../types'` and `export type EngineName = AgentCliPreference`).

**Why**

- Prevent drift and ensures all validation lists and DB values remain consistent.

**Verification**

- `pnpm --filter mcp-chrome-bridge lint`
- `pnpm typecheck`

### Phase 3 — Add native-server OpenClaw settings + device identity persistence

**Approach**

- Persist OpenClaw settings in native-server SQLite (same DB used for projects/sessions/messages).
- Persist device identity (Ed25519 keys) in SQLite as well.

**Files**

- `app/native-server/src/agent/db/client.ts` (schema + migrations)
- Add new module(s):
  - `app/native-server/src/agent/openclaw/settings-service.ts`
  - `app/native-server/src/agent/openclaw/device-identity.ts` (or combined with settings-service)

**Schema** (minimal)

- `openclaw_gateway_settings`:
  - `id TEXT PRIMARY KEY` (always `'default'`)
  - `ws_url TEXT NOT NULL`
  - `auth_token TEXT NOT NULL` (can be empty)
  - `updated_at TEXT NOT NULL`
  - optional: `last_test_ok_at`, `last_test_error`
- `openclaw_device_identity`:
  - `id TEXT PRIMARY KEY` (always `'default'`)
  - `device_id TEXT NOT NULL`
  - `public_key_b64url TEXT NOT NULL`
  - `private_key_b64url TEXT NOT NULL`
  - `created_at_ms INTEGER NOT NULL`

**Behavior**

- Provide a `getSettings()` returning defaults when no row exists.
- Provide `updateSettings(patch)`.
- Provide `getOrCreateIdentity()` generating Ed25519 keys if missing.

**Verification**

- Start native-server; ensure DB initializes without errors.

### Phase 4 — Implement Gateway connect/auth handshake in Node

**Goal**
Reproduce the extension-side handshake logic in Node:

- Wait for `connect.challenge` event to obtain a nonce (optional; timeout to `null`).
- Build signed `connect` params (Ed25519 signature) with payload format compatible with Gateway.

**Files**

- Add `app/native-server/src/agent/openclaw/device-auth.ts`

**Implementation notes**

- Node 22+ supports WebCrypto; use `globalThis.crypto.subtle` for Ed25519 if available.
- Use base64url encoding compatible with the extension’s implementation.
- Compute `deviceId = sha256(publicKeyRaw)`.
- Client identity:
  - `client.id = 'node-host'`
  - `client.mode = 'node'`
  - `role = 'operator'` initially (scopes `operator.read`, `operator.write`) to match current operator usage.

**Verification**

- Unit test optional; at minimum provide `/agent/openclaw/test` endpoint to validate handshake.

### Phase 5 — Add native-server API endpoints for settings + test

**Goal**
Move settings ownership to native-server and provide a local API for the extension settings UI.

**Files**

- `app/native-server/src/server/routes/agent.ts`
- `packages/shared/src/agent-types.ts` (add request/response types)

**Endpoints**

- `GET /agent/openclaw/settings` → `{ wsUrl, authToken, deviceId?, updatedAt }`
- `POST /agent/openclaw/settings` → validates, persists, returns updated settings
- `POST /agent/openclaw/test` → performs WS+connect handshake; returns `{ ok: boolean, message: string }`

**Validation**

- WS URL must be non-empty.
- Auth token may be empty **only** for localhost URLs.

### Phase 6 — Rewrite native-server OpenClawEngine to use standard RealtimeEvent

**Files**

- `app/native-server/src/agent/engines/openclaw.ts`

**Changes**

- Remove `text_delta` / `tool_delta` emissions.
- Emit `{ type: 'message', data: AgentMessage }`:
  - Assistant streaming: stable message id, `role: 'assistant'`, `messageType: 'chat'`, `isStreaming: true` during deltas; final emit with `isFinal: true`.
  - Tool events: `role: 'tool'`, `messageType: 'tool_use'` and/or `tool_result`, store raw payload in `metadata`.
- Use persisted Gateway settings (not hardcoded URL).
- Perform Gateway connect handshake before sending.
- Implement cancellation via `AbortSignal`: close socket and stop emitting.

**Event mapping**

- Gateway `chat` events likely contain `content`/`delta` and run status.
- Gateway `agent` events are treated as tool-ish output.

**Important**

- All emitted events must include `sessionId` so `AgentStreamManager` routes them.

### Phase 7 — Rewire extension settings UI to native-server

**Goal**
Settings UI should read/write/test OpenClaw Gateway via native-server endpoints.

**Files**

- `app/chrome-extension/entrypoints/shared/components/SystemSettingsForm.vue`
- `app/chrome-extension/entrypoints/shared/utils/system-settings.ts`
- `app/chrome-extension/shared/quick-panel/ui/system-settings-modal.ts`

**Changes**

- Replace extension-side `testGateway(wsUrl, token)` WebSocket handshake with:
  - `POST http://127.0.0.1:{port}/agent/openclaw/test`
- Replace `getGatewaySettings` / `setGatewaySettings` storage with native-server:
  - `GET/POST http://127.0.0.1:{port}/agent/openclaw/settings`

**Migration (optional but recommended)**

- One-time: if extension has stored wsUrl/token and server has empty settings, push them to the server.

### Phase 8 — Remove legacy “direct Gateway chat” sidepanel path

**Files**

- Remove or stop exporting:
  - `app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts`
  - `app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
  - `app/chrome-extension/entrypoints/sidepanel/composables/useChatBackendPreference.ts`
- Update `app/chrome-extension/entrypoints/sidepanel/composables/index.ts`
- Remove dead storage keys only if unused (verify with repo-wide search first).

**Why**

- Avoid two integration paths and prevent future drift.

### Phase 9 — Documentation

**Files**

- `docs/ARCHITECTURE.md`
- `CLAUDE.md` (only if it mentions extension-owned gateway settings or direct-gateway chat)

**Update**

- State that OpenClaw is integrated through native-server engine pipeline.

## Acceptance Criteria

- UI sidepanel chat works with `openclaw` engine through `/agent/chat/:sessionId/act` + SSE.
- No non-standard event types exist in engines; OpenClaw emits only shared `RealtimeEvent` shapes.
- `AgentCliPreference` includes `openclaw` and typecheck passes without casts.
- Settings UI can configure and test the Gateway via native-server endpoints.
- Legacy direct-gateway sidepanel chat code is removed (or fully unused and not exported).

## Verification Commands

- `pnpm typecheck`
- `pnpm lint`
- `pnpm --filter mcp-chrome-bridge test`

## Risks / Notes

- OpenClaw Gateway event payloads may vary; keep parsing defensive and store unknown payloads into `metadata.raw`.
- If Gateway rejects `role=operator` for node-host, switch to `role=node` and adjust scopes accordingly (documented in `docs/knowledge/openclaw-gateway.md`).
- Ensure emitted events always include `sessionId`; otherwise `AgentStreamManager` will drop them.
