To implement a chat UI for OpenClaw, connect to the Gateway WebSocket and use the Gateway Protocol’s `chat.*` methods and events. The Gateway (default `ws://127.0.0.1:18789`) is the single control plane; no separate chat server is required [1](#0-0) .

### Minimal implementation steps

1. **Connect and handshake**
   - Open a WebSocket to the Gateway.
   - Send a `connect` frame as the first message with auth token/password and role `operator` (or `node` for device nodes).
   - Expect a `hello-ok` response with policy and, if applicable, a device token [2](#0-1) .

2. **Use chat methods**
   - `chat.history(sessionKey)` to fetch transcript (may truncate large entries) [3](#0-2) .
   - `chat.send(sessionKey, message, thinking, idempotencyKey, attachments)` to send a user message; it returns `{runId, status}` immediately and streams results via events [4](#0-3) .
   - `chat.abort(sessionKey, runId?)` to stop an in‑flight run [5](#0-4) .
   - `chat.inject(sessionKey, message)` to append an assistant note without running the agent [6](#0-5) .

3. **Subscribe to events**
   - After handshake, listen for server‑push events: `chat` (message updates), `agent` (streaming tool output), `presence`, `tick`, `health`, `shutdown` [7](#0-6) .
   - Map these to UI state (e.g., append streaming assistant text, show tool calls).

4. **Session handling**
   - Use a deterministic `sessionKey` (e.g., `"main"` for shared sessions) or per‑sender keys. WebChat defaults to the agent’s main session with a session switcher [8](#0-7) .

### Example patterns from the codebase

- **Swift/macOS**: `MacGatewayChatTransport` implements `OpenClawChatTransport` by calling `GatewayConnection.shared` methods (`chatHistory`, `chatSend`, `abortRun`) and mapping Gateway push events to `OpenClawChatTransportEvent` [9](#0-8) [10](#0-9) .
- **TypeScript/TUI**: `GatewayChatClient` wraps `GatewayClient`, sets role/mode/caps, and exposes `onEvent` for `chat`/`agent`/`tick` [11](#0-10) .
- **Web UI (Control UI)**: The Vite+Lit SPA at `http://<host>:18789/` speaks directly to the Gateway WebSocket on the same port [12](#0-11) .
- **ChatViewModel**: Manages messages, pending runs, and tool calls by calling the transport’s `sendMessage` and handling events in `handleTransportEvent` [13](#0-12) [14](#0-13) .

### Transport and discovery

- Local: connect to `ws://127.0.0.1:18789` (or configured `gateway.port`).
- Remote: use SSH tunnel or Tailscale Serve/Funnel to expose the Gateway; the same WS protocol is used [15](#0-14) .
- Auth: include `token` or `password` in the `connect` frame; local loopback connections are auto‑approved, remote require device pairing approval [16](#0-15) .

### Summary

- Connect to Gateway WebSocket, perform `connect` handshake with auth.
- Use `chat.history`, `chat.send`, `chat.abort`, `chat.inject`.
- Listen for `chat`, `agent`, `presence`, `tick`, `health`, `shutdown` events.
- No separate chat server is needed; the Gateway is the source of truth [17](#0-16) .

## Notes

- The Gateway validates all frames against JSON Schema; ensure your client sends well‑formed requests [18](#0-17) .
- For remote access, Tailscale Serve is preferred over direct LAN binding for security [15](#0-14) .
- If you need node capabilities (e.g., camera, canvas), connect with `role: "node"` and handle `node.invoke` commands; this is separate from the chat UI flow [19](#0-18) .
- The Control UI’s source is in the repo under `ui/` and can be referenced as a working example of a web-based chat client [12](#0-11) .

Wiki pages you might want to explore:

- [Overview (openclaw/openclaw)](/wiki/openclaw/openclaw#1)

### Citations

**File:** docs/gateway/protocol.md (L10-21)

```markdown
# Gateway protocol (WebSocket)

The Gateway WS protocol is the **single control plane + node transport** for
OpenClaw. All clients (CLI, web UI, macOS app, iOS/Android nodes, headless
nodes) connect over WebSocket and declare their **role** + **scope** at
handshake time.

## Transport

- WebSocket, text frames with JSON payloads.
- First frame **must** be a `connect` request.
```

**File:** docs/gateway/protocol.md (L34-78)

````markdown
Client → Gateway:

```json
{
  "type": "req",
  "id": "…",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "cli",
      "version": "1.2.3",
      "platform": "macos",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "caps": [],
    "commands": [],
    "permissions": {},
    "auth": { "token": "…" },
    "locale": "en-US",
    "userAgent": "openclaw-cli/1.2.3",
    "device": {
      "id": "device_fingerprint",
      "publicKey": "…",
      "signature": "…",
      "signedAt": 1737264000000,
      "nonce": "…"
    }
  }
}
```
````

Gateway → Client:

```json
{
  "type": "res",
  "id": "…",
  "ok": true,
  "payload": { "type": "hello-ok", "protocol": 3, "policy": { "tickIntervalMs": 15000 } }
}
```

````

**File:** docs/gateway/protocol.md (L197-200)
```markdown
## Device identity + pairing

- Nodes should include a stable device identity (`device.id`) derived from a
  keypair fingerprint.
````

**File:** docs/web/webchat.md (L14-16)

```markdown
- A native chat UI for the gateway (no embedded browser and no local static server).
- Uses the same sessions and routing rules as other channels.
- Deterministic routing: replies always go back to WebChat.
```

**File:** docs/web/webchat.md (L26-27)

```markdown
- The UI connects to the Gateway WebSocket and uses `chat.history`, `chat.send`, and `chat.inject`.
- `chat.history` is bounded for stability: Gateway may truncate long text fields, omit heavy metadata, and replace oversized entries with `[chat.history omitted: message too large]`.
```

**File:** docs/web/control-ui.md (L11-16)

```markdown
The Control UI is a small **Vite + Lit** single-page app served by the Gateway:

- default: `http://<host>:18789/`
- optional prefix: set `gateway.controlUi.basePath` (e.g. `/openclaw`)

It speaks **directly to the Gateway WebSocket** on the same port.
```

**File:** docs/web/control-ui.md (L33-54)

````markdown
## Device pairing (first connection)

When you connect to the Control UI from a new browser or device, the Gateway
requires a **one-time pairing approval** — even if you're on the same Tailnet
with `gateway.auth.allowTailscale: true`. This is a security measure to prevent
unauthorized access.

**What you'll see:** "disconnected (1008): pairing required"

**To approve the device:**

```bash
# List pending requests
openclaw devices list

# Approve by request ID
openclaw devices approve <requestId>
```
````

Once approved, the device is remembered and won't require re-approval unless
you revoke it with `openclaw devices revoke --device <id> --role <role>`. See
[Devices CLI](/cli/devices) for token rotation and revocation.

````

**File:** docs/web/control-ui.md (L93-94)
```markdown
- `chat.send` is **non-blocking**: it acks immediately with `{ runId, status: "started" }` and the response streams via `chat` events.
- Re-sending with the same `idempotencyKey` returns `{ status: "in_flight" }` while running, and `{ status: "ok" }` after completion.
````

**File:** docs/web/control-ui.md (L96-96)

```markdown
- `chat.inject` appends an assistant note to the session transcript and broadcasts a `chat` event for UI-only updates (no agent run, no channel delivery).
```

**File:** docs/web/control-ui.md (L97-100)

```markdown
- Stop:
  - Click **Stop** (calls `chat.abort`)
  - Type `/stop` (or `stop|esc|abort|wait|exit|interrupt`) to abort out-of-band
  - `chat.abort` supports `{ sessionKey }` (no `runId`) to abort all active runs for that session
```

**File:** docs/web/control-ui.md (L108-119)

````markdown
### Integrated Tailscale Serve (preferred)

Keep the Gateway on loopback and let Tailscale Serve proxy it with HTTPS:

```bash
openclaw gateway --tailscale serve
```
````

Open:

- `https://<magicdns>/` (or your configured `gateway.controlUi.basePath`)

````

**File:** apps/macos/Sources/OpenClaw/WebChatSwiftUI.swift (L19-90)
```swift
struct MacGatewayChatTransport: OpenClawChatTransport, Sendable {
    func requestHistory(sessionKey: String) async throws -> OpenClawChatHistoryPayload {
        try await GatewayConnection.shared.chatHistory(sessionKey: sessionKey)
    }

    func abortRun(sessionKey: String, runId: String) async throws {
        _ = try await GatewayConnection.shared.request(
            method: "chat.abort",
            params: [
                "sessionKey": AnyCodable(sessionKey),
                "runId": AnyCodable(runId),
            ],
            timeoutMs: 10000)
    }

    func listSessions(limit: Int?) async throws -> OpenClawChatSessionsListResponse {
        var params: [String: AnyCodable] = [
            "includeGlobal": AnyCodable(true),
            "includeUnknown": AnyCodable(false),
        ]
        if let limit {
            params["limit"] = AnyCodable(limit)
        }
        let data = try await GatewayConnection.shared.request(
            method: "sessions.list",
            params: params,
            timeoutMs: 15000)
        return try JSONDecoder().decode(OpenClawChatSessionsListResponse.self, from: data)
    }

    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [OpenClawChatAttachmentPayload]) async throws -> OpenClawChatSendResponse
    {
        try await GatewayConnection.shared.chatSend(
            sessionKey: sessionKey,
            message: message,
            thinking: thinking,
            idempotencyKey: idempotencyKey,
            attachments: attachments)
    }

    func requestHealth(timeoutMs: Int) async throws -> Bool {
        try await GatewayConnection.shared.healthOK(timeoutMs: timeoutMs)
    }

    func events() -> AsyncStream<OpenClawChatTransportEvent> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    try await GatewayConnection.shared.refresh()
                } catch {
                    webChatSwiftLogger.error("gateway refresh failed \(error.localizedDescription, privacy: .public)")
                }

                let stream = await GatewayConnection.shared.subscribe()
                for await push in stream {
                    if Task.isCancelled { return }
                    if let evt = Self.mapPushToTransportEvent(push) {
                        continuation.yield(evt)
                    }
                }
            }

            continuation.onTermination = { @Sendable _ in
                task.cancel()
            }
        }
    }
````

**File:** apps/macos/Sources/OpenClaw/WebChatSwiftUI.swift (L92-135)

```swift
    static func mapPushToTransportEvent(_ push: GatewayPush) -> OpenClawChatTransportEvent? {
        switch push {
        case let .snapshot(hello):
            let ok = (try? JSONDecoder().decode(
                OpenClawGatewayHealthOK.self,
                from: JSONEncoder().encode(hello.snapshot.health)))?.ok ?? true
            return .health(ok: ok)

        case let .event(evt):
            switch evt.event {
            case "health":
                guard let payload = evt.payload else { return nil }
                let ok = (try? JSONDecoder().decode(
                    OpenClawGatewayHealthOK.self,
                    from: JSONEncoder().encode(payload)))?.ok ?? true
                return .health(ok: ok)
            case "tick":
                return .tick
            case "chat":
                guard let payload = evt.payload else { return nil }
                guard let chat = try? JSONDecoder().decode(
                    OpenClawChatEventPayload.self,
                    from: JSONEncoder().encode(payload))
                else {
                    return nil
                }
                return .chat(chat)
            case "agent":
                guard let payload = evt.payload else { return nil }
                guard let agent = try? JSONDecoder().decode(
                    OpenClawAgentEventPayload.self,
                    from: JSONEncoder().encode(payload))
                else {
                    return nil
                }
                return .agent(agent)
            default:
                return nil
            }

        case .seqGap:
            return .seqGap
        }
    }
```

**File:** src/tui/gateway-chat.ts (L98-149)

```typescript
export class GatewayChatClient {
  private client: GatewayClient;
  private readyPromise: Promise<void>;
  private resolveReady?: () => void;
  readonly connection: { url: string; token?: string; password?: string };
  hello?: HelloOk;

  onEvent?: (evt: GatewayEvent) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onGap?: (info: { expected: number; received: number }) => void;

  constructor(opts: GatewayConnectionOptions) {
    const resolved = resolveGatewayConnection(opts);
    this.connection = resolved;

    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });

    this.client = new GatewayClient({
      url: resolved.url,
      token: resolved.token,
      password: resolved.password,
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: "openclaw-tui",
      clientVersion: VERSION,
      platform: process.platform,
      mode: GATEWAY_CLIENT_MODES.UI,
      caps: [GATEWAY_CLIENT_CAPS.TOOL_EVENTS],
      instanceId: randomUUID(),
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      onHelloOk: (hello) => {
        this.hello = hello;
        this.resolveReady?.();
        this.onConnected?.();
      },
      onEvent: (evt) => {
        this.onEvent?.({
          event: evt.event,
          payload: evt.payload,
          seq: evt.seq,
        });
      },
      onClose: (_code, reason) => {
        this.onDisconnected?.(reason);
      },
      onGap: (info) => {
        this.onGap?.(info);
      },
    });
```

**File:** apps/shared/OpenClawKit/Sources/OpenClawChatUI/ChatViewModel.swift (L55-69)

```swift
    public init(sessionKey: String, transport: any OpenClawChatTransport) {
        self.sessionKey = sessionKey
        self.transport = transport

        self.eventTask = Task { [weak self] in
            guard let self else { return }
            let stream = self.transport.events()
            for await evt in stream {
                if Task.isCancelled { return }
                await MainActor.run { [weak self] in
                    self?.handleTransportEvent(evt)
                }
            }
        }
    }
```

**File:** apps/shared/OpenClawKit/Sources/OpenClawChatUI/ChatViewModel.swift (L319-403)

```swift
    private func performSend() async {
        guard !self.isSending else { return }
        let trimmed = self.input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !self.attachments.isEmpty else { return }

        guard self.healthOK else {
            self.errorText = "Gateway health not OK; cannot send"
            return
        }

        self.isSending = true
        self.errorText = nil
        let runId = UUID().uuidString
        let messageText = trimmed.isEmpty && !self.attachments.isEmpty ? "See attached." : trimmed
        self.pendingRuns.insert(runId)
        self.armPendingRunTimeout(runId: runId)
        self.pendingToolCallsById = [:]
        self.streamingAssistantText = nil

        // Optimistically append user message to UI.
        var userContent: [OpenClawChatMessageContent] = [
            OpenClawChatMessageContent(
                type: "text",
                text: messageText,
                thinking: nil,
                thinkingSignature: nil,
                mimeType: nil,
                fileName: nil,
                content: nil,
                id: nil,
                name: nil,
                arguments: nil),
        ]
        let encodedAttachments = self.attachments.map { att -> OpenClawChatAttachmentPayload in
            OpenClawChatAttachmentPayload(
                type: att.type,
                mimeType: att.mimeType,
                fileName: att.fileName,
                content: att.data.base64EncodedString())
        }
        for att in encodedAttachments {
            userContent.append(
                OpenClawChatMessageContent(
                    type: att.type,
                    text: nil,
                    thinking: nil,
                    thinkingSignature: nil,
                    mimeType: att.mimeType,
                    fileName: att.fileName,
                    content: AnyCodable(att.content),
                    id: nil,
                    name: nil,
                    arguments: nil))
        }
        self.messages.append(
            OpenClawChatMessage(
                id: UUID(),
                role: "user",
                content: userContent,
                timestamp: Date().timeIntervalSince1970 * 1000))

        // Clear input immediately for responsive UX (before network await)
        self.input = ""
        self.attachments = []

        do {
            let response = try await self.transport.sendMessage(
                sessionKey: self.sessionKey,
                message: messageText,
                thinking: self.thinkingLevel,
                idempotencyKey: runId,
                attachments: encodedAttachments)
            if response.runId != runId {
                self.clearPendingRun(runId)
                self.pendingRuns.insert(response.runId)
                self.armPendingRunTimeout(runId: response.runId)
            }
        } catch {
            self.clearPendingRun(runId)
            self.errorText = error.localizedDescription
            chatUILogger.error("chat.send failed \(error.localizedDescription, privacy: .public)")
        }

        self.isSending = false
    }
```

**File:** docs/concepts/architecture.md (L14-18)

```markdown
- A single long‑lived **Gateway** owns all messaging surfaces (WhatsApp via
  Baileys, Telegram via grammY, Slack, Discord, Signal, iMessage, WebChat).
- Control-plane clients (macOS app, CLI, web UI, automations) connect to the
  Gateway over **WebSocket** on the configured bind host (default
  `127.0.0.1:18789`).
```

**File:** docs/concepts/architecture.md (L42-47)

```markdown
### Nodes (macOS / iOS / Android / headless)

- Connect to the **same WS server** with `role: node`.
- Provide a device identity in `connect`; pairing is **device‑based** (role `node`) and
  approval lives in the device pairing store.
- Expose commands like `canvas.*`, `camera.*`, `screen.record`, `location.get`.
```

**File:** docs/concepts/typebox.md (L76-78)

```markdown
- **Server side**: every inbound frame is validated with AJV. The handshake only
  accepts a `connect` request whose params match `ConnectParams`.
- **Client side**: the JS client validates event and response frames before
```
