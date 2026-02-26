# Gateway

The Gateway is OpenClaw's central control plane—a single WebSocket server process that coordinates all communication between messaging channels, AI agents, user interfaces, device nodes, and automation systems. It runs on `ws://127.0.0.1:18789` by default and serves as the unified entry point for all runtime operations.

For Gateway configuration options, see [Gateway Configuration](/openclaw/openclaw/3.1-gateway-configuration). For the WebSocket protocol specification, see [Gateway Protocol](/openclaw/openclaw/3.2-gateway-protocol). For daemon installation and service management, see [Gateway Service Management](/openclaw/openclaw/3.3-gateway-service-management). For remote access setup, see [Remote Access](/openclaw/openclaw/3.4-remote-access).

## Purpose and Scope

The Gateway acts as a multiplexing hub that:

- Accepts WebSocket connections from CLI tools, macOS/iOS/Android apps, and WebChat clients
- Routes RPC method calls to the appropriate subsystems
- Coordinates agent execution across sessions
- Manages inbound messages from messaging platforms through channel monitors
- Hosts HTTP endpoints for health checks, Canvas, and the Control UI
- Enforces authorization through role-based scopes and authentication modes
- Handles device/node pairing and capability discovery

This document covers the Gateway's architecture, responsibilities, and operational model. It does not cover configuration details ([Gateway Configuration](/openclaw/openclaw/3.1-gateway-configuration)), protocol wire format ([Gateway Protocol](/openclaw/openclaw/3.2-gateway-protocol)), or deployment specifics ([Gateway Service Management](/openclaw/openclaw/3.3-gateway-service-management)).

## Architecture Overview

Gateway Process

Core Subsystems

HTTP Endpoints

RPC Dispatch

WebSocket Layer

Session Store  
(loadSessionStore)

WebSocket Connections  
(ws library)

Frame Parser  
(validateRequestFrame)

Method Router  
(handleGatewayRequest)

Method Authorization  
(authorizeGatewayMethod)

RPC Handlers  
(coreGatewayHandlers)

Config System  
(loadConfig)

Agent Runtime  
(runEmbeddedPiAgent)

Cron Manager

Node Manager

Channel Monitors

Frame Writer  
(ResponseFrame/EventFrame)

HTTP Server  
(Express)

/**openclaw**/health

/**openclaw**/canvas/\*

/**openclaw**/a2ui/\*

/Control UI Static Assets

GatewayServer  
(startGatewayServer)

**Gateway Process Structure**

The Gateway is a single Node.js process that multiplexes WebSocket and HTTP traffic. The [\`startGatewayServer\`](https://github.com/openclaw/openclaw/blob/e321f21d/`startGatewayServer`) function initializes the server with a shared port for both protocols.

Sources: [src/gateway/server.ts1-4](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.ts#L1-L4) [src/gateway/server.impl.ts1-100](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts#L1-L100) [src/gateway/server-methods.ts95-147](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods.ts#L95-L147)

## Core Components

### WebSocket Server

The Gateway uses the `ws` library to handle WebSocket connections. Each connection represents an operator (CLI, UI, app) or node (iOS/Android device). Connections begin with a `connect` handshake that negotiates the protocol version and establishes authentication.

Component

File

Purpose

`GatewayServer`

[src/gateway/server.impl.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts)

Main server lifecycle management

`validateRequestFrame`

[src/gateway/protocol/index.ts239](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/index.ts#L239-L239)

Parses inbound request frames

`validateConnectParams`

[src/gateway/protocol/index.ts238](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/index.ts#L238-L238)

Validates connection handshake

Frame types

[src/gateway/protocol/schema/frames.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/schema/frames.ts)

Request/Response/Event frame schemas

**Frame Flow:**

HandlerGatewayClientHandlerGatewayClientEvents flow independentlyRequestFrame {id, method, params}validateRequestFrameauthorizeGatewayMethodhandleGatewayRequestProcess (agent.run, sessions.list, etc)ResponseFrame {id, ok, result/error}ResponseFrameEventFrame {stream, data}

Sources: [src/gateway/protocol/index.ts232-240](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/index.ts#L232-L240) [src/gateway/protocol/schema/frames.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/schema/frames.ts) [src/gateway/server-methods.ts95-147](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods.ts#L95-L147)

### RPC Method Routing

The Gateway routes RPC methods through [\`handleGatewayRequest\`](https://github.com/openclaw/openclaw/blob/e321f21d/`handleGatewayRequest`) which:

1.  Authorizes the method against the client's role and scopes via [\`authorizeGatewayMethod\`](https://github.com/openclaw/openclaw/blob/e321f21d/`authorizeGatewayMethod`)
2.  Applies rate limiting for control-plane writes (config.apply, config.patch, update.run)
3.  Dispatches to the appropriate handler from [\`coreGatewayHandlers\`](https://github.com/openclaw/openclaw/blob/e321f21d/`coreGatewayHandlers`)

**Core Handler Categories:**

Category

Handlers

Example Methods

Connection

`connectHandlers`

`connect` handshake

Agent

`agentHandlers`

`agent`, `agent.wait`, `agent.identity.get`

Agents

`agentsHandlers`

`agents.list`, `agents.create`, `agents.files.set`

Sessions

`sessionsHandlers`

`sessions.list`, `sessions.patch`, `sessions.reset`

Config

`configHandlers`

`config.get`, `config.set`, `config.apply`

Channels

`channelsHandlers`

`channels.status`, `channels.logout`

Cron

`cronHandlers`

`cron.list`, `cron.add`, `cron.run`

Nodes

`nodeHandlers`

`node.list`, `node.invoke`, `node.pair.approve`

Devices

`deviceHandlers`

`device.pair.list`, `device.token.rotate`

Skills

`skillsHandlers`

`skills.status`, `skills.install`

Models

`modelsHandlers`

`models.list`

Browser

`browserHandlers`

`browser.request` (tool-level proxy)

Chat

`chatHandlers`

`chat.history`, `chat.send` (WebChat native)

System

`systemHandlers`

`wake`, `last-heartbeat`

Update

`updateHandlers`

`update.run`

Wizard

`wizardHandlers`

`wizard.start`, `wizard.next`

Sources: [src/gateway/server-methods.ts1-148](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods.ts#L1-L148) [src/gateway/server-methods/](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/)

### HTTP Endpoints

The Gateway serves HTTP traffic on the same port as WebSocket connections. Express handles routing:

Endpoint

Purpose

Auth Required

`/__openclaw__/health`

Health check probe (JSON status)

No (by default)

`/__openclaw__/canvas/*`

Canvas tool iframe host

Node capability URL

`/__openclaw__/a2ui/*`

A2UI bundle host

Node capability URL

`/` and static assets

Control UI + WebChat

Gateway auth token

The Canvas and A2UI endpoints use node-scoped capability URLs instead of shared-IP fallback auth to prevent unauthorized access.

Sources: [src/gateway/server.impl.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts) [CHANGELOG.md81](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L81-L81)

## Responsibilities

### Session Management

The Gateway maintains a session store (`sessions.json`) and per-session transcript files. The [\`sessionsHandlers\`](https://github.com/openclaw/openclaw/blob/e321f21d/`sessionsHandlers`) implement:

- `sessions.list`: Enumerate sessions with metadata (model, thinking level, group info)
- `sessions.patch`: Update session config (model override, thinking level, verbose level, send policy)
- `sessions.reset`: Clear transcript and reset session state
- `sessions.delete`: Remove session entirely
- `sessions.compact`: Trigger compaction (summarization) of long transcripts

Sessions are keyed by `sessionKey` (e.g., `main:<agentId>:<channel>:<chatId>`, `group:<agentId>:<channel>:<groupId>`). The session store is shared across all Gateway clients.

Sources: [src/gateway/server-methods/sessions.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/sessions.ts) [src/config/sessions.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/sessions.ts)

### Agent Lifecycle

The Gateway coordinates agent execution through the [\`agentHandlers\`](https://github.com/openclaw/openclaw/blob/e321f21d/`agentHandlers`):

- `agent`: Run a single agent turn (CLI-style synchronous execution)
- `agent.wait`: Wait for an in-progress run to complete (polls lifecycle events)
- `agent.identity.get`: Retrieve agent identity (name, description from config)

Agent runs emit lifecycle events (`agent` stream) to connected clients:

- `lifecycle`: Start, end, error phases
- `text_delta`: Streaming text output
- `tool_start`, `tool_output`: Tool execution progress
- `model_fallback`: Fallback to alternate model on failure

The agent runtime itself is in [\`runEmbeddedPiAgent\`](https://github.com/openclaw/openclaw/blob/e321f21d/`runEmbeddedPiAgent`) which the Gateway invokes via [\`agentCommand\`](https://github.com/openclaw/openclaw/blob/e321f21d/`agentCommand`)

Sources: [src/gateway/server-methods/agent.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/agent.ts) [src/agents/pi-embedded.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/pi-embedded.ts) [src/commands/agent.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/commands/agent.ts)

### Channel Coordination

The Gateway does not directly monitor messaging channels. Instead, channel monitors (separate modules) connect inbound and outbound:

- Inbound: Monitors call into the Gateway's auto-reply system via [\`getReplyFromConfig\`](https://github.com/openclaw/openclaw/blob/e321f21d/`getReplyFromConfig`)
- Outbound: Monitors use Gateway RPC (`send` method) or direct channel APIs

The Gateway provides `channels.status` and `channels.logout` methods for operational control.

Sources: [src/gateway/server-methods/channels.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/channels.ts) [src/auto-reply/reply.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/auto-reply/reply.ts) [src/channel-web.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/channel-web.ts)

### Configuration Hot Reload

The Gateway watches `openclaw.json` for changes via `chokidar`. When the file changes:

1.  The file is re-parsed and validated via [\`loadConfig\`](https://github.com/openclaw/openclaw/blob/e321f21d/`loadConfig`)
2.  If `gateway.reload` is set to `hot`, safe changes are applied without restart
3.  If set to `restart` or `hybrid`, structural changes trigger a graceful restart
4.  If set to `off`, changes require manual restart

The reload mode is configured by `gateway.reload` (default: `hybrid`).

Sources: [src/config/config.js](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/config.js) [CHANGELOG.md1-10](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L1-L10)

### Node and Device Pairing

The Gateway manages two pairing flows:

**Node Pairing** (iOS/Android devices):

1.  Node calls `node.pair.request` with capabilities and version info
2.  Gateway generates a pairing code and emits `node.pair.requested` event
3.  Operator approves via `node.pair.approve` (CLI or Control UI)
4.  Gateway emits `node.pair.resolved` event
5.  Node calls `node.pair.verify` to confirm and receive connection details

**Device Pairing** (operator devices like macOS app):

1.  Device calls `device.pair.request` (implicit, via challenge flow)
2.  Gateway generates a pairing code
3.  Operator approves via `device.pair.approve`
4.  Device receives authentication token

Both flows support approval allowlists for auto-approval.

Sources: [src/gateway/server-methods/nodes.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/nodes.ts) [src/gateway/server-methods/devices.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods/devices.ts) [CHANGELOG.md37](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L37-L37)

## Authorization and Security

### Authentication Modes

The Gateway supports multiple authentication modes via `gateway.auth.mode`:

Mode

Description

Use Case

`token`

Requires `gateway.auth.token` (auto-generated if missing)

Default for local/remote access

`password`

Requires `gateway.auth.password`

Alternative to token

`tailscale`

Uses Tailscale identity headers

Tailnet-only Serve mode

`none`

No authentication (localhost only)

Local development (explicit opt-in)

The mode defaults to `token` with automatic generation and persistence if not explicitly set to `none`.

Sources: [src/gateway/server.impl.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts) [CHANGELOG.md64](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L64-L64)

### Role-Based Scopes

Each WebSocket connection has a role (`operator` or `node`) and scopes. Operators receive scopes based on their authentication context:

- CLI connections get admin scope by default
- Device connections receive scopes from pairing metadata
- WebChat connections have restricted scopes (no `sessions.patch`, `sessions.delete`)

The [\`authorizeOperatorScopesForMethod\`](https://github.com/openclaw/openclaw/blob/e321f21d/`authorizeOperatorScopesForMethod`) function maps methods to required scopes. For example:

- `config.apply` requires `config.write` scope
- `cron.add` requires `cron.write` scope
- `sessions.patch` requires `sessions.write` scope

Admin scope (`operator.admin`) grants access to all methods.

Sources: [src/gateway/server-methods.ts38-64](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods.ts#L38-L64) [src/gateway/method-scopes.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/method-scopes.ts) [CHANGELOG.md70](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L70-L70)

### Rate Limiting

Control-plane write methods (`config.apply`, `config.patch`, `update.run`) are rate-limited to 3 requests per 60 seconds per `deviceId+clientIp` via [\`consumeControlPlaneWriteBudget\`](https://github.com/openclaw/openclaw/blob/e321f21d/`consumeControlPlaneWriteBudget`) Exceeded requests receive an `UNAVAILABLE` error with `retryAfterMs`.

Sources: [src/gateway/server-methods.ts104-128](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods.ts#L104-L128) [src/gateway/control-plane-rate-limit.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/control-plane-rate-limit.ts) [CHANGELOG.md91](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L91-L91)

### Sandbox Guardrails

The Gateway enforces sandbox containment for agent tool execution when `agents.defaults.sandbox.mode` is `non-main` or `all`. Sandbox isolation uses Docker containers with per-session or per-agent scopes.

Sources: [CHANGELOG.md330-332](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L330-L332) README.md sandbox documentation

## Operational Model

### Startup Sequence

Port in use

process start

loadDotEnv

assertSupportedRuntime  
(Node >= 22)

loadConfig  
(openclaw.json)

ensurePortAvailable  
(18789)

startGatewayServer

Start Channel Monitors

Gateway Ready

handlePortError  
(suggest kill/cleanup)

The Gateway starts via [\`openclaw gateway\`](https://github.com/openclaw/openclaw/blob/e321f21d/`openclaw gateway`) or the npm entry point. The [\`startGatewayServer\`](https://github.com/openclaw/openclaw/blob/e321f21d/`startGatewayServer`) function:

1.  Validates the port is available via [\`ensurePortAvailable\`](https://github.com/openclaw/openclaw/blob/e321f21d/`ensurePortAvailable`)
2.  Creates the Express HTTP server
3.  Attaches the WebSocket upgrade handler
4.  Loads the initial config and session store
5.  Starts file watchers for hot reload
6.  Initializes channel monitors

If the port is occupied, [\`handlePortError\`](https://github.com/openclaw/openclaw/blob/e321f21d/`handlePortError`) suggests commands to identify the conflicting process.

Sources: [src/index.ts1-94](https://github.com/openclaw/openclaw/blob/e321f21d/src/index.ts#L1-L94) [src/gateway/server.impl.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts) [src/infra/ports.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/infra/ports.ts)

### Event Broadcasting

The Gateway broadcasts events to all connected WebSocket clients via [\`EventFrame\`](https://github.com/openclaw/openclaw/blob/e321f21d/`EventFrame`):

Event Stream

Purpose

Example Data

`agent`

Agent lifecycle and output

`{stream: "text_delta", data: {text: "..."}}`

`chat`

WebChat messages

`{stream: "message", data: {text: "..."}}`

`presence`

Client presence updates

`{deviceId, role, scopes}`

`tick`

Periodic heartbeat

`{timestamp, uptime}`

`health`

Health status changes

`{ok, issues}`

`cron`

Cron job events

`{jobId, status}`

`node.pair.requested`

Node pairing request

`{nodeId, code}`

`exec.approval.requested`

Exec approval request

`{commandText, sessionKey}`

`shutdown`

Gateway shutdown notification

`{reason}`

Sources: [src/gateway/protocol/schema/frames.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol/schema/frames.ts) [src/gateway/server-methods-list.ts102-122](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server-methods-list.ts#L102-L122)

### Graceful Shutdown

The Gateway handles `SIGTERM` and `SIGINT` by:

1.  Broadcasting a `shutdown` event to all connected clients
2.  Closing all WebSocket connections with close code 1001 (going away)
3.  Stopping channel monitors
4.  Flushing pending session store writes
5.  Optionally resetting Tailscale Serve/Funnel if `gateway.tailscale.resetOnExit` is true

Sources: [src/gateway/server.impl.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.impl.ts)

## Gateway Methods Reference

The Gateway exposes the following RPC methods (see [Gateway Protocol](/openclaw/openclaw/3.2-gateway-protocol) for wire format):

**Agent & Sessions:**

- `agent`, `agent.wait`, `agent.identity.get`
- `sessions.list`, `sessions.patch`, `sessions.reset`, `sessions.delete`, `sessions.compact`

**Configuration:**

- `config.get`, `config.set`, `config.apply`, `config.patch`, `config.schema`

**Agents:**

- `agents.list`, `agents.create`, `agents.update`, `agents.delete`
- `agents.files.list`, `agents.files.get`, `agents.files.set`

**Models & Skills:**

- `models.list`
- `skills.status`, `skills.bins`, `skills.install`, `skills.update`

**Channels:**

- `channels.status`, `channels.logout`

**Cron:**

- `cron.list`, `cron.add`, `cron.update`, `cron.remove`, `cron.run`, `cron.runs`

**Nodes & Devices:**

- `node.list`, `node.describe`, `node.invoke`, `node.rename`
- `node.pair.request`, `node.pair.approve`, `node.pair.reject`, `node.pair.verify`
- `device.pair.list`, `device.pair.approve`, `device.pair.reject`, `device.pair.remove`
- `device.token.rotate`, `device.token.revoke`

**System:**

- `health`, `logs.tail`, `wake`, `last-heartbeat`, `update.run`

**WebChat:**

- `chat.history`, `chat.send`, `chat.abort`

**Wizard:**

- `wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status`

A complete list is maintained in [\`listGatewayMethods\`](https://github.com/openclaw/openclaw/blob/e321f21d/`listGatewayMethods`)
