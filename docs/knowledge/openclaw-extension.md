# Extensions and Plugins

## Purpose and Scope

This document describes OpenClaw's plugin architecture, including the manifest format, plugin types, discovery mechanisms, and security model. Extensions allow third-party developers to add channels, authentication providers, hooks, and other functionality without modifying the core codebase.

For information about the Skills system (workspace-level extensions), see [Tools and Skills](/openclaw/openclaw/6-tools-and-skills). For hook-based automation, see [Automation and Cron](/openclaw/openclaw/7.1-memory-configuration).

---

## Plugin Architecture Overview

OpenClaw plugins are npm packages with an `openclaw` field in their `package.json`. The Gateway discovers plugins at startup by scanning configured extension directories and npm-installed packages. Each plugin can export multiple extension modules that integrate into various subsystems.

**Plugin Lifecycle:**

fail

error

Plugin Discovery  
node_modules + extensions/

Manifest Validation  
openclaw field in package.json

Security Checks  
path containment + ownership

Load Extensions  
import extension modules

Register Handlers  
channels, hooks, auth

Runtime Integration  
gateway event loop

Startup Warnings  
skip unsafe plugins

**Sources:** [CHANGELOG.md85-90](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L85-L90) [extensions/matrix/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json) [extensions/voice-call/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json)

---

## Plugin Manifest Format

The `openclaw` field in `package.json` defines plugin metadata, extension entry points, and installation instructions.

**Example Plugin Manifest (Matrix Channel):**

```
{
  "name": "@openclaw/matrix",
  "version": "2026.2.20",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "matrix",
      "label": "Matrix",
      "selectionLabel": "Matrix (plugin)",
      "docsPath": "/channels/matrix",
      "docsLabel": "matrix",
      "blurb": "open protocol; install the plugin to enable.",
      "order": 70,
      "quickstartAllowFrom": true
    },
    "install": {
      "npmSpec": "@openclaw/matrix",
      "localPath": "extensions/matrix",
      "defaultChoice": "npm"
    }
  }
}
```

**Manifest Structure:**

openclaw field

extensions: string\[\]  
Entry point modules

channel: object  
Channel metadata

install: object  
Install instructions

hooks: object  
Hook definitions

auth: object  
Auth provider metadata

id: string  
Unique channel identifier

label: string  
Display name

docsPath: string  
Documentation URL

order: number  
Sort priority

npmSpec: string  
npm package name

localPath: string  
Development path

defaultChoice: 'npm'|'local'

**Sources:** [extensions/matrix/package.json16-35](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L16-L35) [extensions/zalo/package.json12-34](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json#L12-L34) [extensions/msteams/package.json15-36](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/package.json#L15-L36)

---

## Plugin Types

OpenClaw supports several plugin types, each integrating with different subsystems.

### Extension Type Matrix

Type

Purpose

Example

Key Fields

**Channel**

Add messaging platform integration

`@openclaw/matrix`, `@openclaw/msteams`

`channel.id`, `channel.label`, `channel.docsPath`

**Auth Provider**

Custom OAuth/token providers

`@openclaw/google-gemini-cli-auth`

`auth.provider`, `auth.label`

**Hook**

Lifecycle event handlers

`before_agent_start`, `message:received`

`hooks.exports`

**Tool Extension**

Add agent tool capabilities

`voice_call`, `browser`

Tool registration in extension module

**Generic**

Other functionality

`@openclaw/diagnostics-otel`

Extension-specific fields

**Plugin Type Resolution:**

Registration

Export Patterns

Extension Module  
./index.ts

export monitorChannel  
Channel handler

export hooks  
Lifecycle handlers

export authProvider  
Token provider

export toolHandlers  
Tool implementations

Channel Monitor Registry  
channels.{id}.monitor

Hook Registry  
gateway.hooks

Auth Provider Registry  
auth.providers

Tool Registry  
tools.{name}

**Sources:** [extensions/matrix/package.json22-29](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L22-L29) [extensions/voice-call/package.json14-18](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L14-L18) [extensions/google-gemini-cli-auth/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/google-gemini-cli-auth/package.json)

---

## Built-in Extensions

OpenClaw ships with several bundled extensions in the `extensions/` directory.

### Bundled Channel Plugins

Plugin

Package

Description

Status

**Matrix**

`@openclaw/matrix`

Matrix protocol homeserver client

Published

**MS Teams**

`@openclaw/msteams`

Microsoft Teams Bot Framework

Published

**Zalo**

`@openclaw/zalo`

Zalo Bot API (Vietnam messaging)

Published

**Zalo Personal**

`@openclaw/zalouser`

Zalo personal account via QR

Published

**Voice Call**

`@openclaw/voice-call`

Twilio/Telnyx telephony

Published

**Channel Plugin Structure:**

Gateway Integration

Channel Plugin

package.json  
openclaw.channel

index.ts  
export monitorChannel

channel handler  
onMessage, send, status

channel config schema  
Zod validation

Channel Monitor Loop  
startChannelMonitors()

Message Router  
onInboundMessage()

Send Pipeline  
sendMessage()

**Sources:** [extensions/matrix/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json) [extensions/msteams/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/package.json) [extensions/zalo/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json) [extensions/voice-call/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json)

### Bundled Internal Plugins

Plugin

Purpose

Published

**diagnostics-otel**

OpenTelemetry tracing/metrics

Bundled

**google-antigravity-auth**

Google OAuth provider

Private

**google-gemini-cli-auth**

Gemini CLI OAuth provider

Private

**copilot-proxy**

Copilot proxy provider

Private

**Sources:** [extensions/diagnostics-otel/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/diagnostics-otel/package.json) [extensions/google-antigravity-auth/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/google-antigravity-auth/package.json) [extensions/google-gemini-cli-auth/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/google-gemini-cli-auth/package.json)

---

## Plugin Discovery and Loading

The Gateway discovers plugins through three mechanisms: bundled extensions, npm-installed packages, and workspace plugins.

### Discovery Sources

Plugin Registry

Security Filters

Discovery Sources

fail

fail

fail

Plugin Discovery  
loadPlugins()

Bundled Extensions  
extensions/\*/package.json

npm Packages  
node_modules/\*/package.json

Workspace Plugins  
plugins.allow config

Path Containment  
realpath containment

Ownership Check  
uid/gid validation

Permission Check  
world-writable reject

Validated Plugins  
manifest + integrity

Loaded Extensions  
imported modules

Active Handlers  
registered callbacks

Skip Plugin  
startup warning

**Sources:** [CHANGELOG.md85-90](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L85-L90) [src/config/config.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/config.ts)

### Security Checks

OpenClaw enforces strict security checks during plugin discovery:

1.  **Path Containment:** Plugins must reside within trusted roots (no symlink escapes via `realpath()`)
2.  **Ownership Validation:** Reject plugins with suspicious `uid`/`gid`
3.  **Permission Check:** Reject world-writable plugin directories
4.  **Integrity Verification:** Track npm metadata (`version`, `spec`, `integrity`, `shasum`) for drift detection

**Security Audit Findings:**

```
openclaw security audit
```

Reports:

- Unpinned plugin specs (no `--pin` flag)
- Missing integrity metadata
- Install-record version drift
- Discoverable non-bundled plugins with empty `plugins.allow`

**Sources:** [CHANGELOG.md89-90](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L89-L90)

---

## Plugin Configuration

Plugins can extend the core configuration schema and register their own sections.

### Configuration Extension Pattern

Plugin Config

OpenClawSchema  
Zod core schema

Plugin Schema  
channel/hook extensions

Merged Schema  
validateConfigObjectWithPlugins()

Runtime Config  
loadConfig()

channels.{id}  
channel-specific config

hooks  
hook handlers

plugins.allow  
plugin allowlist

**Example: Matrix Channel Config**

```
{
  channels: {
    matrix: {
      enabled: true,
      homeserver: "https://matrix.org",
      userId: "@bot:matrix.org",
      accessToken: "syt_...",
      dmPolicy: "pairing",
      allowFrom: ["@user:matrix.org"],
      rooms: {
        "!roomid:matrix.org": {
          autoReply: true,
          requireMention: true
        }
      }
    }
  }
}
```

**Sources:** [src/config/config.ts16-21](https://github.com/openclaw/openclaw/blob/e321f21d/src/config/config.ts#L16-L21) [extensions/matrix/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json)

---

## Plugin SDK

OpenClaw provides a plugin SDK for developing custom extensions.

### SDK Exports

```
// From package.json exports
import type { PluginContext } from "openclaw/plugin-sdk";
import { resolveAccountId } from "openclaw/plugin-sdk/account-id";
```

**SDK Structure:**

Core Types

Plugin SDK  
dist/plugin-sdk/

index.d.ts  
Core types

account-id.d.ts  
Account resolution

PluginContext  
Gateway access

ChannelAPI  
Channel interface

HookAPI  
Hook interface

ConfigAPI  
Config access

**Sources:** [package.json39-46](https://github.com/openclaw/openclaw/blob/e321f21d/package.json#L39-L46) [src/index.ts](https://github.com/openclaw/openclaw/blob/e321f21d/src/index.ts)

### Plugin Development Workflow

1.  **Create Package:** Initialize npm package with `openclaw` field
2.  **Define Manifest:** Specify `extensions`, `channel`, `install` metadata
3.  **Implement Handlers:** Export channel monitor, hook handlers, or tool implementations
4.  **Test Locally:** Use `localPath` in `install` config for development
5.  **Publish:** Publish to npm with `npmSpec` for distribution

**Example Plugin Structure:**

```
@openclaw/my-channel/
├── package.json          # openclaw manifest
├── index.ts             # export monitorChannel
├── src/
│   ├── handler.ts       # channel message handler
│   └── config.ts        # Zod config schema
└── README.md
```

**Sources:** [extensions/matrix/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json) [extensions/voice-call/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json)

---

## Plugin Installation and Management

OpenClaw provides CLI commands for managing plugins.

### Installation Methods

```
# Install from npm (pinned)
openclaw plugins install @openclaw/matrix --pin

# Install from local path (development)
openclaw plugins install ./extensions/matrix

# Enable installed plugin
openclaw plugins enable matrix

# List installed plugins
openclaw plugins list
```

**Plugin Installation Flow:**

Registration

Verification

Install Source

drift

openclaw plugins install

npm install  
resolve spec

Local Copy  
symlink or copy

Integrity Check  
shasum verification

Metadata Persist  
version, spec, timestamp

Update plugins.allow  
add to config

Gateway Reload  
hot reload or restart

Integrity Warning  
confirm update

**Sources:** [CHANGELOG.md89](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L89-L89) [CHANGELOG.md110](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L110-L110)

### Plugin Update Workflow

```
# Check for integrity drift
openclaw security audit

# Update plugin (warns on drift)
openclaw plugins update @openclaw/matrix

# Force reinstall
openclaw plugins install @openclaw/matrix --force
```

**Update Integrity Checks:**

1.  Compare installed `version` vs npm registry
2.  Verify `integrity` hash matches resolved package
3.  Detect `spec` changes (e.g., `^1.0.0` → `^2.0.0`)
4.  Prompt for confirmation on drift

**Sources:** [CHANGELOG.md89](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L89-L89)

---

## Plugin Security Model

OpenClaw enforces a trust boundary between core and plugins.

### Security Boundaries

Sandbox Boundary

Plugin Boundary

Trusted Core

restricted

read-only

Gateway Process  
ws://127.0.0.1:18789

Core Tools  
bash, read, write

Core Config  
openclaw.json

Plugin Code  
imported extension modules

Plugin Dependencies  
transitive npm packages

Docker Containers  
per-session isolation

Workspace Containment  
~/.openclaw/workspace

**Sources:** [CHANGELOG.md85-90](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L85-L90) [CHANGELOG.md93](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L93-L93)

### Plugin Restrictions

Capability

Core

Plugins

Notes

**File System**

Full access

Workspace-constrained

Plugins cannot escape workspace via symlinks

**Network**

Full access

SSRF-guarded

Plugins inherit SSRF policy for outbound requests

**Process Spawn**

`system.run` available

Restricted by tool policy

Plugins can use `bash` tool but not `system.run` directly

**Config Write**

Direct access

RPC-only via `config.apply`

Plugins cannot bypass validation

**Gateway Control**

Direct access

RPC-only via `gateway.restart`

Plugins use rate-limited RPC methods

**Tool Policy Example (restricting plugin access):**

```
{
  tools: {
    allow: ["bash", "read", "write", "edit"],
    deny: ["system_run", "gateway", "cron"],
    ownerOnly: ["gateway", "whatsapp_login"]
  }
}
```

**Sources:** [CHANGELOG.md112](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L112-L112) [CHANGELOG.md93](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L93-L93)

---

## Hook System

Plugins can register lifecycle hooks to intercept gateway events.

### Hook Types

System Lifecycle

Message Lifecycle

Agent Lifecycle

before_agent_start  
Model/provider overrides

after_agent_start  
Context injection

before_tool_call  
Tool interception

after_tool_call  
Result transformation

message:received  
Inbound processing

message:sent  
Outbound tracking

BOOT.md  
Startup checks

HEARTBEAT.md  
Interval wakeups

Hook Registry  
gateway.hooks

**Example Hook Handler:**

```
export const hooks = {
  before_agent_start: async (context, options) => {
    // Override model/provider before agent starts
    return {
      model: "custom-model",
      provider: "custom-provider"
    };
  },

  "message:received": async (context, message) => {
    // Process inbound message
    console.log("Received:", message);
  }
};
```

**Sources:** [CHANGELOG.md153](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L153-L153) [CHANGELOG.md174](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L174-L174)

### Hook Security

Hooks are subject to path containment and must reside within trusted directories:

```
# Valid hook paths
~/.openclaw/hooks/my-hook.ts
extensions/my-plugin/hooks.ts

# Invalid (rejected at startup)
/tmp/untrusted-hook.ts
../../../etc/passwd
```

**Sources:** [CHANGELOG.md85](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L85-L85)

---

## Skills as Plugins

Skills are lightweight workspace-scoped plugins defined by `SKILL.md` files.

### Skills vs Extensions

Aspect

Skills

Extensions

**Distribution**

Workspace files

npm packages

**Format**

Markdown with frontmatter

TypeScript modules

**Scope**

Per-agent workspace

Global gateway

**Security**

Symlink-rejected during packaging

Path containment checks

**Discovery**

`~/.openclaw/workspace/skills/`

`node_modules/` + `extensions/`

**Skill Example (Slack Actions):**

```
---
name: slack
description: Use when you need to control Slack from OpenClaw
metadata: { "openclaw": { "emoji": "💬", "requires": { "config": ["channels.slack"] } } }
---

# Slack Actions

Use `slack` tool to react, pin, send messages...
```

**Sources:** [skills/slack/SKILL.md1-6](https://github.com/openclaw/openclaw/blob/e321f21d/skills/slack/SKILL.md#L1-L6) [CHANGELOG.md94](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L94-L94)

For detailed skill documentation, see [Skills System](/openclaw/openclaw/6.4-skills-system).

---

## Tool Display Metadata

Plugins can provide UI metadata for tool calls in the Control UI.

**Tool Display Configuration:**

```
{
  "tools": {
    "slack": {
      "icon": "messageSquare",
      "title": "Slack",
      "actions": {
        "react": { "label": "react", "detailKeys": ["channelId", "messageId", "emoji"] },
        "sendMessage": { "label": "send", "detailKeys": ["to", "content"] }
      }
    }
  }
}
```

**Sources:** [ui/src/ui/tool-display.json218-233](https://github.com/openclaw/openclaw/blob/e321f21d/ui/src/ui/tool-display.json#L218-L233)

---

## Plugin Versioning and Compatibility

Plugins follow the core OpenClaw release schedule for compatibility.

### Version Alignment

All published plugins track core versions:

```
# Core OpenClaw
openclaw@2026.2.20

# Published Plugins
@openclaw/matrix@2026.2.20
@openclaw/msteams@2026.2.20
@openclaw/voice-call@2026.2.20
```

**Version Compatibility Matrix:**

Core Version

Plugin Version

Compatible

2026.2.20

2026.2.20

✓ Yes

2026.2.20

2026.2.19

⚠️ Warn

2026.2.20

2026.1.x

✗ No

**Sources:** [extensions/matrix/CHANGELOG.md3-7](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/CHANGELOG.md#L3-L7) [extensions/voice-call/CHANGELOG.md3-7](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/CHANGELOG.md#L3-L7) [extensions/msteams/CHANGELOG.md3-7](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/CHANGELOG.md#L3-L7)

---

## Plugin Development Best Practices

1.  **Manifest Completeness:** Include `channel`, `install`, and documentation links
2.  **Schema Validation:** Use Zod for plugin config schemas
3.  **Error Handling:** Return structured errors with helpful messages
4.  **Security:** Never bypass gateway RPC for sensitive operations
5.  **Testing:** Provide local development path in `install.localPath`
6.  **Documentation:** Link to docs in `channel.docsPath`
7.  **Integrity:** Pin dependencies and track `integrity` hashes

**Sources:** [extensions/matrix/package.json](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json) [CHANGELOG.md89](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L89-L89)
