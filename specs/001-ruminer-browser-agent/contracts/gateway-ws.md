# Contract — OpenClaw Gateway WebSocket (subset for Ruminer)

This contract documents the subset of the OpenClaw Gateway WebSocket protocol that Ruminer’s
extension must implement as:

- **Node client** (background service worker): handles `node.invoke` for `browser.proxy`
- **Operator/UI client** (sidepanel): uses `chat.*` methods and subscribes to push events

Authoritative references in this repo:

- `docs/knowledge/openclaw-chat-ui.md`
- `docs/knowledge/openclaw-gateway.md`
- `docs/design/blueprint.md`

## 1) Transport

- **WebSocket** text frames containing JSON.
- The first frame must be a `connect` request.
- The Gateway validates frames against schema; malformed frames are rejected.

## 2) Frame shapes (conceptual)

### 2.1 Request frame

```json
{
  "type": "req",
  "id": "uuid-or-random",
  "method": "connect|chat.send|chat.history|chat.abort|node.invoke|browser.request|...",
  "params": {}
}
```

### 2.2 Response frame

```json
{
  "type": "res",
  "id": "same-as-request-id",
  "ok": true,
  "payload": {}
}
```

If `ok=false`, `payload` contains an error object/string (implementation-defined by Gateway).

### 2.3 Event frame (server push)

```json
{
  "type": "evt",
  "event": "chat|agent|tick|health|presence|shutdown|...",
  "seq": 123,
  "payload": {}
}
```

Sequence gaps may be reported; the client should treat them as a hint to refresh state (e.g.,
re-fetch `chat.history` and/or re-sync pending tool calls).

## 3) Connect handshake (node)

### 3.1 Client requirements

The extension background service worker connects as:

- **role**: `"node"`
- **caps**: `["browser"]`
- **auth**: `{ token: "<gateway-auth-token>" }`
- **device identity**: stable `device.id` derived from a persisted keypair fingerprint (preferred)

### 3.2 Success criteria

- Gateway responds with `hello-ok`.
- The node becomes visible to the Gateway as a browser-capable node.

### 3.3 Pairing requirements

The Gateway may require first-time device pairing approval. The extension must surface a clear UI
state:

- “Pairing required” with next steps to approve the device in OpenClaw (outside extension).

## 4) Chat methods (sidepanel)

Ruminer sidepanel (Chat tab) uses these Gateway RPCs:

### 4.1 `chat.history(sessionKey)`

- **Input**: `sessionKey` (MVP: `"main"`)
- **Output**: chat transcript (may be truncated by Gateway)
- **Usage**: initial load + refresh after reconnect/seq gap

### 4.2 `chat.send(sessionKey, message, thinking, idempotencyKey, attachments)`

- **Input**:
  - `sessionKey`: `"main"`
  - `message`: user text (with Ruminer tool-group restrictions injected as system/prefix text)
  - `thinking`: optional (not required for MVP)
  - `idempotencyKey`: stable random UUID per send
  - `attachments`: optional
- **Output**: `{ runId, status }` (non-blocking ack)
- **Streaming**: updates arrive via `chat` and/or `agent` events

### 4.3 `chat.abort(sessionKey, runId?)`

- Abort an in-flight run.
- If `runId` omitted, aborts all active runs for that session (Gateway-dependent).

### 4.4 `chat.inject(sessionKey, message)`

- Append a note without running the agent (useful for UI-only status notes).

## 5) Node invocation (browser)

The extension node must handle `node.invoke` calls that target browser automation:

- The Gateway’s built-in browser tool (and the `browser-ext` plugin) ultimately route to the node as
  `browser.proxy` calls (see `contracts/browser-proxy.md`).

**Contractual requirement**: The node returns a JSON result object and never hangs.

## 6) Reliability / reconnection

The extension must:

- Reconnect automatically with exponential backoff.
- Re-send `connect` handshake on reconnect.
- Re-hydrate Chat tab state by re-calling `chat.history("main")`.
- Treat `seq gap` as “refresh required”.
