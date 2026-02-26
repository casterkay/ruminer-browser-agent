# Overview

## Purpose and Scope

This page introduces **OpenClaw**, a self-hosted multi-channel AI gateway that connects AI agents to messaging platforms (WhatsApp, Telegram, Discord, Slack, Signal, etc.) through a centralized control plane. It explains the system's core architecture, key components, and how they interact.

For detailed terminology definitions, see [Key Concepts](/openclaw/openclaw/1.1-key-concepts). For installation and first-run instructions, see [Quick Start](/openclaw/openclaw/1.2-quick-start). For in-depth architecture diagrams, see [Architecture Diagrams](/openclaw/openclaw/1.3-architecture-diagrams).

---

## What is OpenClaw

OpenClaw is a **personal AI assistant framework** that runs on your own infrastructure. It provides:

- **Multi-channel messaging**: Connect one AI agent to multiple messaging platforms simultaneously
- **Centralized control**: Single Gateway server (`ws://127.0.0.1:18789`) coordinates all channels, agents, and tools
- **Hot-reload configuration**: Change settings without restarting the Gateway
- **Sandboxed execution**: Run agent tools in isolated Docker containers for security
- **Extension system**: Add new channels and capabilities via npm-installable plugins
- **Session management**: Isolated conversation contexts per user/channel/group

The system is built around a **hub-and-spoke architecture**: the Gateway acts as the central control plane, with channels, clients, and agents connecting via WebSocket RPC.

**Sources**: [README.md1-498](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L1-L498) [package.json1-217](https://github.com/openclaw/openclaw/blob/e321f21d/package.json#L1-L217)

---

## System Architecture Overview

Storage

Agent Runtime

Gateway Core (Port 18789)

User Entry Points

CLI (openclaw)

Control UI  
HTTP Dashboard

macOS App  
Menu Bar

Channels  
WhatsApp/Telegram  
Discord/Slack/Signal

Gateway WebSocket Server  
src/gateway/

Config I/O  
src/config/io.ts  
OpenClawSchema

Auth System  
src/auth/

runEmbeddedPiAgent  
src/agents/agent-pi.ts

System Prompt Builder  
src/agents/system-prompt.ts

MemoryIndexManager  
src/memory/manager.ts

Tool Registry  
src/tools/

Sandbox Context  
src/agents/sandbox/

openclaw.json  
~/.openclaw/

Session Transcripts  
sessions/\*.jsonl

Workspace  
IDENTITY.md  
SKILLS.md  
memory/\*.md

memory.sqlite  
Vector + BM25 Index

**Key Code Entities**:

- **Gateway Server**: [src/gateway/server.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/server.ts)
- **Agent Executor**: [src/agents/agent-pi.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/agent-pi.ts)
- **Config Schema**: [src/config/zod-schema.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/zod-schema.ts)
- **Memory Manager**: [src/memory/manager.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/memory/manager.ts)
- **Tool System**: [src/tools/](https://github.com/openclaw/openclaw/blob/e321f21d/src/tools/)

**Sources**: [src/index.ts1-94](https://github.com/openclaw/openclaw/blob/e321f21d/src/index.ts#L1-L94) [src/config/zod-schema.ts1-470](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/zod-schema.ts#L1-L470) [README.md180-197](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L180-L197)

---

## Core Components

### Gateway Server

The **Gateway** is the central WebSocket server (port `18789` by default) that coordinates all system components. It exposes an RPC protocol defined in [src/gateway/protocol.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/protocol.ts) for:

- **Configuration management**: `config.get`, `config.set`, `config.apply`, `config.patch`
- **Agent control**: `agent.send`, `agent.execute`
- **Session operations**: `sessions.list`, `sessions.history`, `sessions.send`
- **Channel management**: `channels.status`, `channels.login`
- **System diagnostics**: `gateway.health`, `gateway.status`

The Gateway runs as a **background service** via platform-specific supervisors:

- macOS: `launchd` (LaunchAgent)
- Linux: `systemd` (user service)
- Windows: Task Scheduler

**Configuration**: Gateway behavior is controlled by `gateway.*` config keys:

Field

Purpose

Default

`gateway.port`

WebSocket listen port

`18789`

`gateway.bind`

Network binding mode

`"loopback"`

`gateway.auth.mode`

Authentication type

`"token"`

`gateway.reload.mode`

Config hot-reload behavior

`"hybrid"`

`gateway.controlUi.enabled`

Serve web dashboard

`true`

**Sources**: [src/config/types.gateway.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/types.gateway.ts) [docs/gateway/configuration.md1-480](https://github.com/openclaw/openclaw/blob/e321f21d/docs/gateway/configuration.md#L1-L480)

---

### Configuration System

OpenClaw uses a **strict, hot-reloadable** configuration system:

1.  **Schema**: Defined via Zod schemas in [src/config/zod-schema.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/zod-schema.ts) All config keys must match the schema or the Gateway refuses to start.
2.  **File**: `~/.openclaw/openclaw.json` (JSON5 format supporting comments and trailing commas)
3.  **Validation**: [src/config/validation.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/validation.ts) validates config on load and plugin registration
4.  **Hot Reload**: [src/config/io.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/io.ts) watches the config file and applies changes automatically

**Reload Modes** (`gateway.reload.mode`):

Mode

Behavior

`hybrid` (default)

Hot-apply safe changes; auto-restart for infrastructure changes

`hot`

Hot-apply only; log warnings for restart-needed changes

`restart`

Restart Gateway on any config change

`off`

No file watching; manual restart required

**Hot-Apply vs Restart**:

- **Hot-apply**: `channels.*`, `agents.*`, `tools.*`, `cron.*`, `hooks.*`, `session.*`, `messages.*`
- **Restart required**: `gateway.port`, `gateway.bind`, `gateway.auth`, `gateway.tailscale`, `gateway.tls`

**Include System**: Configs support `$include` directives to split large configs:

```
{
  gateway: { port: 18789 },
  agents: { $include: "./agents.json5" },
  channels: { $include: ["./channels/telegram.json5", "./channels/discord.json5"] }
}
```

**Sources**: [src/config/config.ts1-15](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/config.ts#L1-L15) [src/config/zod-schema.ts95-470](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/zod-schema.ts#L95-L470) [docs/gateway/configuration.md327-366](https://github.com/openclaw/openclaw/blob/e321f21d/docs/gateway/configuration.md#L327-L366)

---

### Agent Runtime

The **Agent Runtime** executes AI agent turns via [runEmbeddedPiAgent](https://github.com/openclaw/openclaw/blob/e321f21d/runEmbeddedPiAgent) in [src/agents/agent-pi.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/agent-pi.ts) It orchestrates:

1.  **System Prompt Construction**: [src/agents/system-prompt.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/system-prompt.ts) assembles prompts from workspace files (`IDENTITY.md`, `SKILLS.md`, `MEMORY.md`)
2.  **Tool Creation**: [src/tools/registry.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/tools/registry.ts) provides tools based on policy resolution
3.  **Memory Search**: [src/memory/manager.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/memory/manager.ts) handles semantic search via `memory_search` tool
4.  **Model Provider Calls**: Integrates with Anthropic, OpenAI, Gemini, etc. via [pi-ai SDK](https://github.com/openclaw/openclaw/blob/e321f21d/pi-ai SDK)
5.  **Session Persistence**: [src/config/sessions/store.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/sessions/store.ts) writes JSONL transcripts

**Tool Policy Resolution Chain**:

```
Global tools.allow/deny
  → tools.byProvider[provider]
    → agents.list[agentId].tools
      → session-specific overrides (groups)
        → sandbox.tools (if sandboxed)
```

Deny always wins. Tool groups like `group:fs`, `group:runtime` expand to multiple tools.

**Sources**: [src/agents/agent-pi.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/agent-pi.ts) [src/agents/system-prompt.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/system-prompt.ts) [src/tools/index.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/tools/index.ts) [docs/tools/index.md1-227](https://github.com/openclaw/openclaw/blob/e321f21d/docs/tools/index.md#L1-L227)

---

### Memory System

OpenClaw provides **semantic memory search** over workspace Markdown files and session transcripts via a hybrid vector + BM25 index.

**Architecture**:

- **Backend**: `MemoryIndexManager` in [src/memory/manager.ts111-1128](https://github.com/openclaw/openclaw/blob/e321f21d/src/memory/manager.ts#L111-L1128)
- **Storage**: SQLite database with `sqlite-vec` extension (vector tables) + FTS5 (keyword search)
- **Embedding Providers**: OpenAI, Gemini, Voyage, or local `node-llama-cpp`
- **Chunking**: 400-token chunks with 80-token overlap
- **Hybrid Search**: Combines vector similarity (70% weight) and BM25 keyword (30% weight)

**Configuration Example**:

```
{
  agents: {
    defaults: {
      memorySearch: {
        enabled: true,
        provider: "openai",  // or "gemini", "voyage", "local", "auto"
        sources: ["memory", "sessions"],
        sync: {
          watch: true,
          onSearch: true,
          intervalMinutes: 60
        }
      }
    }
  }
}
```

**Memory Sources**:

1.  **`memory`**: `MEMORY.md` + `memory/*.md` in workspace
2.  **`sessions`**: Session transcripts from `~/.openclaw/agents/<agentId>/sessions/*.jsonl`

**Tools**:

- `memory_search(query)`: Semantic search with hybrid ranking
- `memory_get(path)`: Read specific memory file by path

**Alternative Backend**: QMD (`memory.backend = "qmd"`) uses external [qmd CLI](https://github.com/openclaw/openclaw/blob/e321f21d/qmd CLI) for BM25 + vector + reranking.

**Sources**: [src/memory/manager.ts1-1128](https://github.com/openclaw/openclaw/blob/e321f21d/src/memory/manager.ts#L1-L1128) [src/agents/memory-search.ts1-250](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/memory-search.ts#L1-L250) [docs/concepts/memory.md1-250](https://github.com/openclaw/openclaw/blob/e321f21d/docs/concepts/memory.md#L1-L250)

---

### Channel System

Channels connect the Gateway to messaging platforms. OpenClaw includes **built-in channels** and supports **extension channels** via plugins.

**Built-in Channels**:

- WhatsApp ([Baileys](https://github.com/openclaw/openclaw/blob/e321f21d/Baileys)), Telegram ([grammY](https://github.com/openclaw/openclaw/blob/e321f21d/grammY)), Discord ([discord.js](https://github.com/openclaw/openclaw/blob/e321f21d/discord.js)), Slack ([Bolt](https://github.com/openclaw/openclaw/blob/e321f21d/Bolt)), Signal ([signal-cli](https://github.com/openclaw/openclaw/blob/e321f21d/signal-cli)), Google Chat, BlueBubbles (iMessage), iMessage (legacy), WebChat

**Extension Channels** (npm plugins):

- Matrix (`@openclaw/matrix`), Zalo (`@openclaw/zalo`), Zalo Personal (`@openclaw/zalouser`), MS Teams (`@openclaw/msteams`)

**Channel Lifecycle**:

"runEmbeddedPiAgent""Session Manager(sessions/)""Security Check(channels/access-control.ts)""Message Router(gateway/router.ts)""Channel Monitor(telegram/bot.ts)"User"runEmbeddedPiAgent""Session Manager(sessions/)""Security Check(channels/access-control.ts)""Message Router(gateway/router.ts)""Channel Monitor(telegram/bot.ts)"Useralt\[Unauthorized\]\[Authorized\]"Send message""Normalize to MessageEnvelope""Route to Gateway""Check dmPolicy/allowFrom""Send pairing code""Resolve session key""Load transcript history""Execute agent turn""Build prompt + call model""Execute tools""Save response""Return reply""Deliver formatted message"

**Access Control** (`dmPolicy`):

- `pairing` (default): Require one-time approval code
- `allowlist`: Only users in `allowFrom` array
- `open`: Allow all DMs (requires `allowFrom: ["*"]`)
- `disabled`: Ignore all DMs

**Sources**: [src/channels/](https://github.com/openclaw/openclaw/blob/e321f21d/src/channels/) [docs/channels/](https://github.com/openclaw/openclaw/blob/e321f21d/docs/channels/) [README.md336-399](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L336-L399)

---

### Tool System

Tools expose capabilities to agents. The system includes:

**Core Tools** (always available unless denied):

- **File I/O**: `read`, `write`, `edit`, `apply_patch`
- **Execution**: `exec`, `bash`, `process`
- **Sessions**: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status`
- **Memory**: `memory_search`, `memory_get`
- **Web**: `web_search`, `web_fetch`
- **UI**: `browser`, `canvas`
- **Automation**: `cron`, `gateway`
- **Messaging**: `message`
- **Nodes**: `nodes` (device control)
- **Media**: `image` (understanding)

**Tool Profiles** (base allowlists):

- `minimal`: `session_status` only
- `coding`: File I/O + execution + sessions + memory
- `messaging`: Messaging tools + session tools
- `full`: No restrictions

**Tool Groups** (shorthands):

- `group:runtime`: `exec`, `bash`, `process`
- `group:fs`: `read`, `write`, `edit`, `apply_patch`
- `group:sessions`: All session tools
- `group:memory`: `memory_search`, `memory_get`
- `group:web`: `web_search`, `web_fetch`
- `group:ui`: `browser`, `canvas`

**Policy Example**:

```
{
  tools: {
    profile: "coding",
    deny: ["browser", "canvas"],  // Disable UI tools
    byProvider: {
      "google-antigravity": {
        allow: ["group:fs", "sessions_list"]  // Restrict specific provider
      }
    }
  }
}
```

**Sources**: [src/tools/](https://github.com/openclaw/openclaw/blob/e321f21d/src/tools/) [src/config/types.tools.ts1-350](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/types.tools.ts#L1-L350) [docs/tools/index.md1-227](https://github.com/openclaw/openclaw/blob/e321f21d/docs/tools/index.md#L1-L227)

---

### Sandbox System

The **Sandbox System** isolates agent tool execution in Docker containers to reduce security risk.

**Configuration**:

```
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",  // off | non-main | all
        scope: "session",  // session | agent | shared
        workspaceAccess: "rw",  // none | ro | rw
        tools: {
          allow: ["bash", "process", "read", "write", "sessions_list"],
          deny: ["browser", "canvas", "cron", "gateway"]
        }
      }
    }
  }
}
```

**Modes**:

- `off`: No sandboxing (all tools on host)
- `non-main`: Sandbox non-DM sessions (groups, channels)
- `all`: Sandbox all sessions

**Scopes**:

- `session`: One container per session (isolated)
- `agent`: One container per agent (shared across sessions)
- `shared`: One container shared by all agents

**Workspace Access**:

- `none`: No workspace mount
- `ro`: Read-only workspace
- `rw`: Read-write workspace

**Image**: Default is `openclaw-sandbox:latest`. Build with `scripts/sandbox-setup.sh`.

**Sources**: [src/agents/sandbox/](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/sandbox/) [docs/gateway/sandboxing.md1-120](https://github.com/openclaw/openclaw/blob/e321f21d/docs/gateway/sandboxing.md#L1-L120)

---

## Extension and Plugin Model

OpenClaw supports **extensions** via npm packages that declare channel or capability plugins.

**Plugin Metadata** (`package.json`):

```
{
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "matrix",
      "label": "Matrix",
      "docsPath": "/channels/matrix",
      "order": 70
    }
  }
}
```

**Plugin Discovery**:

1.  Core scans `node_modules/@openclaw/*` and `extensions/*/package.json`
2.  Loads extensions via [src/plugins/loader.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/plugins/loader.ts)
3.  Merges plugin schemas into `OpenClawSchema` via [src/config/schema.ts209-248](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/schema.ts#L209-L248)

**Channel Extensions**:

- [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37): Matrix protocol
- [extensions/zalo/package.json1-36](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json#L1-L36): Zalo Bot API
- [extensions/zalouser/package.json1-38](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalouser/package.json#L1-L38): Zalo personal accounts
- [extensions/msteams/package.json1-32](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/package.json#L1-L32): Microsoft Teams

**Capability Extensions**:

- [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20): Twilio/Telnyx voice calls
- [extensions/memory-lancedb/package.json1-21](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/memory-lancedb/package.json#L1-L21): LanceDB memory backend

**Plugin SDK**: Exported via [dist/plugin-sdk/](https://github.com/openclaw/openclaw/blob/e321f21d/dist/plugin-sdk/) (`openclaw/plugin-sdk` in package exports).

**Sources**: [extensions/](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/) [src/plugins/](https://github.com/openclaw/openclaw/blob/e321f21d/src/plugins/) [src/config/schema.ts91-165](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/schema.ts#L91-L165)

---

## Data Flow: Message Processing

Denied

Allowed

Yes

No

Inbound Message  
channels/\*/monitor.ts

Normalize Envelope  
MessageEnvelope

Route to Gateway  
gateway/router.ts

Access Control  
dmPolicy check

Resolve Session Key  
deriveSessionKey()

Load Transcript  
sessions/\*.jsonl

Build System Prompt  
system-prompt.ts

Call AI Model  
runEmbeddedPiAgent

Execute Tools  
tools/registry.ts

Sandboxed?

Docker Container  
sandbox/context.ts

Host Execution

Save Transcript  
JSONL append

Format Reply  
channel-specific

Deliver to User

**Key Functions**:

- **Normalization**: [src/channels/envelope.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/channels/envelope.ts)
- **Session Key**: [src/config/sessions.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/sessions.ts#LNaN-LNaN)
- **Agent Execution**: [src/agents/agent-pi.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/agent-pi.ts#LNaN-LNaN)
- **Tool Registry**: [src/tools/registry.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/tools/registry.ts)
- **Sandbox Context**: [src/agents/sandbox/context.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/sandbox/context.ts)

**Sources**: [src/gateway/router.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/gateway/router.ts) [src/channels/](https://github.com/openclaw/openclaw/blob/e321f21d/src/channels/) [src/agents/agent-pi.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/agents/agent-pi.ts)

---

## Key File Structure

```
openclaw/
├── src/
│   ├── gateway/           # Gateway server, RPC protocol, router
│   ├── config/            # Schema (zod-schema.ts), validation, I/O
│   ├── agents/            # Agent runtime, system prompt, sandbox
│   ├── channels/          # Built-in channels (telegram, discord, etc.)
│   ├── memory/            # Memory index manager, embeddings, hybrid search
│   ├── tools/             # Tool registry, built-in tools (exec, read, etc.)
│   ├── sessions/          # Session management, transcript store
│   ├── cli/               # CLI commands (program.ts, agent-cli.ts, etc.)
│   └── infra/             # Infrastructure (env, errors, ports, dotenv)
├── extensions/            # Extension plugins (matrix, zalo, msteams)
│   ├── matrix/
│   ├── zalo/
│   ├── zalouser/
│   ├── msteams/
│   └── voice-call/
├── docs/                  # Documentation (configuration, channels, tools)
├── ui/                    # Control UI (Lit web components)
├── apps/                  # Native apps (macos, ios, android)
├── skills/                # Bundled skills (markdown files)
├── scripts/               # Build and maintenance scripts
└── openclaw.json          # User configuration file (~/.openclaw/)
```

**Configuration Paths**:

- Config: `~/.openclaw/openclaw.json`
- State dir: `~/.openclaw/` (or `$OPENCLAW_STATE_DIR`)
- Workspace: `~/.openclaw/workspace/` (or `agents.defaults.workspace`)
- Sessions: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
- Memory DB: `~/.openclaw/agents/<agentId>/memory.sqlite`

**Sources**: [src/](https://github.com/openclaw/openclaw/blob/e321f21d/src/) [extensions/](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/) [README.md309-311](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L309-L311)

---

## Summary

OpenClaw is a **hub-and-spoke AI gateway** where:

- The **Gateway** (port 18789) is the central control plane
- **Agents** execute AI turns via `runEmbeddedPiAgent` with tool support
- **Channels** normalize messaging platform protocols into unified envelopes
- **Configuration** is schema-validated and hot-reloadable
- **Memory** provides semantic search over workspace Markdown and transcripts
- **Sandboxing** isolates tool execution in Docker containers
- **Extensions** add new channels and capabilities via npm plugins

All system state lives in **files**: config in `openclaw.json`, sessions in `*.jsonl` transcripts, memory in Markdown + SQLite, and workspace context in `IDENTITY.md`, `SKILLS.md`, etc.

**Sources**: [README.md1-498](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L1-L498) [package.json1-217](https://github.com/openclaw/openclaw/blob/e321f21d/package.json#L1-L217) [src/config/zod-schema.ts95-470](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/zod-schema.ts#L95-L470)
