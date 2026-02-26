# Creating Custom Plugins

This document covers the plugin architecture in OpenClaw and explains how to create, test, and publish custom plugins. Plugins extend OpenClaw's capabilities by adding new channels, tools, auth providers, or other functionality.

For information about installing existing plugins, see the plugin system overview. For built-in extensions bundled with OpenClaw, see [Built-in Extensions](/openclaw/openclaw/10.2-built-in-extensions).

---

## Plugin Types

OpenClaw supports two main plugin categories:

Plugin Type

Purpose

Examples

**Channel Plugins**

Add messaging platform integrations

Matrix, Zalo, Microsoft Teams

**Utility Plugins**

Add tools, auth providers, diagnostics

voice-call, diagnostics-otel

Channel plugins appear in channel selection UIs and provide message routing. Utility plugins extend other subsystems without exposing new channels.

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20) [extensions/msteams/package.json1-38](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/package.json#L1-L38)

---

## Plugin Directory Structure

A plugin is a Node.js package with an `openclaw` field in its `package.json`. The minimal structure:

```
my-plugin/
├── package.json          # Plugin manifest with openclaw field
├── index.ts              # Entry point (or multiple files)
├── CHANGELOG.md          # Version history (optional but recommended)
└── README.md             # Usage documentation
```

For workspace development (bundled plugins), plugins live under `extensions/<plugin-name>/`. For third-party plugins, they can be published to npm and installed via `npm install`.

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20)

---

## Plugin Manifest (openclaw Field)

The `openclaw` field in `package.json` defines plugin metadata and behavior.

### Minimal Utility Plugin

```
{
  "name": "@openclaw/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"]
  }
}
```

### Channel Plugin with Metadata

```
{
  "name": "@openclaw/my-channel",
  "version": "1.0.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "mychannel",
      "label": "My Channel",
      "selectionLabel": "My Channel (Bot API)",
      "docsPath": "/channels/mychannel",
      "docsLabel": "mychannel",
      "blurb": "Custom messaging platform integration.",
      "aliases": ["mc"],
      "order": 90,
      "quickstartAllowFrom": true
    },
    "install": {
      "npmSpec": "@openclaw/my-channel",
      "localPath": "extensions/my-channel",
      "defaultChoice": "npm"
    }
  }
}
```

### Channel Field Reference

Field

Type

Purpose

`id`

string

Unique channel identifier (used in config)

`label`

string

Display name in UIs

`selectionLabel`

string

Name shown in channel selection flows

`docsPath`

string

Relative URL to documentation

`docsLabel`

string

Short identifier for docs references

`blurb`

string

One-line description

`aliases`

string\[\]

Alternative short names

`order`

number

Sort priority in UI lists (lower = earlier)

`quickstartAllowFrom`

boolean

Whether channel supports allowFrom in quickstart

**Sources:** [extensions/matrix/package.json16-35](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L16-L35) [extensions/zalo/package.json12-34](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json#L12-L34) [extensions/msteams/package.json15-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/msteams/package.json#L15-L37)

---

## Plugin Manifest Structure Diagram

package.json

openclaw field

extensions array

channel object (optional)

install object (optional)

./index.ts

./monitor.ts (if multi-file)

id: 'mychannel'

label: 'My Channel'

docsPath: '/channels/mychannel'

order: 90

npmSpec: '@openclaw/my-plugin'

localPath: 'extensions/my-plugin'

defaultChoice: 'npm'

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [extensions/zalo/package.json1-36](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json#L1-L36) [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20)

---

## Plugin Entry Points and Exports

Each file listed in `extensions` must export specific hooks and metadata for OpenClaw to load the plugin.

### Entry Point Pattern

```
// index.ts
import type { PluginContext } from "openclaw/plugin-sdk";

export async function initialize(context: PluginContext) {
  // Called when plugin is loaded
  console.log("My plugin initialized");
}

export async function shutdown() {
  // Called on gateway shutdown
  console.log("My plugin shutting down");
}
```

### Channel Plugin Pattern

For channel plugins, export monitor functions or channel-specific handlers:

```
import type { PluginContext } from "openclaw/plugin-sdk";

export async function initialize(context: PluginContext) {
  const { config, gateway } = context;

  // Register channel monitor
  const monitor = await startMyChannelMonitor(config);

  // Register cleanup
  context.onShutdown(() => monitor.stop());
}
```

### Available Hooks

Hook

Purpose

Required

`initialize(context)`

Plugin setup, called during gateway boot

Yes

`shutdown()`

Cleanup logic

No

`context.onShutdown(fn)`

Register cleanup callbacks

No

**Sources:** [extensions/matrix/package.json17-19](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L17-L19) [extensions/voice-call/package.json15-17](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L15-L17)

---

## Plugin Discovery and Loading Flow

Invalid

Error

Gateway Startup

Plugin Discovery

Scan extensions/ and node_modules

Load package.json openclaw field

Validate Manifest Schema

Resolve Entry Points

Load via jiti (TypeScript/ESM)

Call initialize(context)

Register Hooks/Channels

Plugin Active

Skip Plugin + Log Warning

**Sources:** [src/plugins/source-display.ts1-100](https://github.com/openclaw/openclaw/blob/e321f21d/src/plugins/source-display.ts#L1-L100) [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13)

---

## Plugin SDK API Surface

OpenClaw exports `openclaw/plugin-sdk` for plugin authors. The SDK provides:

### PluginContext Interface

```
interface PluginContext {
  config: OpenClawConfig;         // Full gateway configuration
  gateway: GatewayInstance;       // Gateway RPC and state access
  onShutdown(fn: () => void): void; // Register cleanup hooks
}
```

### Imports from Plugin SDK

```
import type {
  PluginContext,
  OpenClawConfig,
  // Add other exports as needed
} from "openclaw/plugin-sdk";
```

The SDK also re-exports common types for channels, auth providers, and tools.

**Sources:** [package.json39-46](https://github.com/openclaw/openclaw/blob/e321f21d/package.json#L39-L46) [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13)

---

## Dependencies and Installation

### Dependency Placement Rules

OpenClaw plugins follow strict dependency rules for npm installation:

Section

Purpose

Used When

`dependencies`

Runtime requirements

Always installed with plugin

`devDependencies`

Build/test tools, type stubs

Not installed in production

`peerDependencies`

Shared with host (openclaw core)

Host must provide

**Critical:** Do not use `workspace:*` in `dependencies` for published plugins. It breaks `npm install`. Instead:

```
{
  "dependencies": {
    "some-runtime-dep": "^1.0.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  }
}
```

The runtime resolves `openclaw/plugin-sdk` via jiti aliasing, so plugins do not need openclaw as a runtime dependency.

**Sources:** [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13) [extensions/matrix/package.json6-15](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L6-L15)

---

## Plugin Installation Flow

Discovery

npm install

Local Path

npm install --omit=dev

Symlink or Copy

Load Entry Points

initialize(context)

**Sources:** [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13) [extensions/matrix/package.json32-35](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L32-L35)

---

## Plugin Types: Channel vs Utility

Utility Plugin

package.json (no channel field)

index.ts

Tool Registration

Hook Registration

Auth Provider

Hidden from Channel UI

Channel Plugin

package.json with channel field

index.ts

Channel Monitor

Message Sending

Message Receiving

Appears in Channel UI

**Sources:** [extensions/matrix/package.json16-29](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L16-L29) [extensions/voice-call/package.json14-18](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L14-L18) [extensions/zalo/package.json12-28](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/zalo/package.json#L12-L28)

---

## Channel Plugin Code Entities

For channel plugins, key code entities to implement:

Entity

Purpose

Example

Monitor class/function

Polls or listens for inbound messages

`startMatrixMonitor()`

Send handler

Delivers outbound messages

`sendMatrixMessage()`

Media handler

Uploads/downloads attachments

`downloadMatrixMedia()`

Config schema

Validates channel configuration

`channels.matrix` config block

Channel status

Reports health for `openclaw channels status`

`getMatrixStatus()`

Channel plugins must integrate with OpenClaw's message routing by calling gateway APIs to deliver inbound messages and listening for outbound send requests.

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [docs/channels/index.md14-28](https://github.com/openclaw/openclaw/blob/e321f21d/docs/channels/index.md#L14-L28)

---

## Testing Custom Plugins

### Local Development (Workspace)

For bundled plugins under `extensions/`:

1.  Add to `pnpm-workspace.yaml` (already includes `extensions/*`)
2.  Run `pnpm install` from repo root
3.  Plugin is auto-discovered from `extensions/` directory
4.  Test with `pnpm openclaw gateway run` (TypeScript via `tsx`)

### External Testing (npm)

For published plugins:

1.  Publish to npm: `npm publish --access public`
2.  Install in test environment: `npm install -g @openclaw/my-plugin`
3.  Plugin is discovered from `node_modules/`
4.  Verify with `openclaw plugins list`

### Plugin-Specific Tests

Plugins can include their own test suites in `devDependencies`:

```
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "openclaw": "workspace:*",
    "vitest": "^4.0.0"
  }
}
```

**Sources:** [AGENTS.md86-97](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L86-L97) [package.json100-127](https://github.com/openclaw/openclaw/blob/e321f21d/package.json#L100-L127)

---

## Publishing Plugins

### Publishing to npm

Published plugins must follow the OpenClaw plugin manifest format:

```
# From plugin directory
npm publish --access public
```

Ensure:

- `package.json` has correct `openclaw` field
- `dependencies` contains only runtime deps (no `workspace:*`)
- `main` or `exports` points to built output if pre-compiled

### Plugin Versioning

Plugins can follow independent versioning or align with OpenClaw releases. For alignment (like bundled extensions), use the same version as the core package.

**Sources:** [docs/reference/RELEASING.md93-121](https://github.com/openclaw/openclaw/blob/e321f21d/docs/reference/RELEASING.md#L93-L121) [extensions/matrix/CHANGELOG.md1-145](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/CHANGELOG.md#L1-L145)

---

## Publishing to Clawhub

Clawhub is the official plugin registry for OpenClaw. To publish:

1.  Create a Clawhub account at [clawhub.com](https://clawhub.com)
2.  Package your plugin (ensure `openclaw` field is correct)
3.  Submit via Clawhub web interface or CLI
4.  Users can install with `openclaw plugins install <your-plugin>`

Skills (smaller extensions) can also be published to Clawhub. For skills, see the skills documentation.

**Sources:** [README.md259-263](https://github.com/openclaw/openclaw/blob/e321f21d/README.md#L259-L263) [.github/workflows/auto-response.yml32-35](https://github.com/openclaw/openclaw/blob/e321f21d/.github/workflows/auto-response.yml#L32-L35)

---

## Security and Audit Considerations

### Plugin Trust Boundary

Plugins run in-process with full access to the OpenClaw runtime. Treat plugin installation as equivalent to running arbitrary code.

**Security defaults:**

- Plugins are **not** sandboxed by default
- Plugins can access `runtime.system.runCommandWithTimeout`
- Plugins are trusted by the gateway

### Pinning and Integrity

For npm plugins, OpenClaw supports optional pinning:

```
openclaw plugins install @openclaw/my-plugin --pin
```

This persists resolved metadata (version, integrity hash) and warns on drift during updates.

### Audit Command

The `openclaw security audit` command flags:

- Unpinned plugin specs
- Missing integrity metadata
- Install-record version drift

**Sources:** [CHANGELOG.md89-90](https://github.com/openclaw/openclaw/blob/e321f21d/CHANGELOG.md#L89-L90) [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13)

---

## Example: Minimal Channel Plugin

Here's a complete minimal channel plugin structure:

### package.json

```
{
  "name": "@my-org/my-channel",
  "version": "1.0.0",
  "type": "module",
  "main": "./index.js",
  "dependencies": {
    "some-channel-sdk": "^2.0.0"
  },
  "devDependencies": {
    "openclaw": "workspace:*"
  },
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "mychannel",
      "label": "My Channel",
      "selectionLabel": "My Channel",
      "docsPath": "/channels/mychannel",
      "docsLabel": "mychannel",
      "blurb": "A custom channel integration.",
      "order": 100
    }
  }
}
```

### index.ts

```
import type { PluginContext } from "openclaw/plugin-sdk";

export async function initialize(context: PluginContext) {
  const { config, gateway } = context;

  // Check if channel is enabled in config
  const channelConfig = config.channels?.mychannel;
  if (!channelConfig?.enabled) {
    console.log("My Channel is disabled, skipping");
    return;
  }

  console.log("Starting My Channel monitor...");

  // Start polling/listening for messages
  const monitor = startMonitor(channelConfig);

  // Register shutdown cleanup
  context.onShutdown(() => {
    console.log("Stopping My Channel monitor...");
    monitor.stop();
  });
}

function startMonitor(config: any) {
  // Your channel-specific monitoring logic
  return {
    stop: () => { /* cleanup */ }
  };
}
```

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20)

---

## Plugin Lifecycle Hooks

PluginContextPluginPluginLoaderGatewayPluginContextPluginPluginLoaderGatewayPlugin runs monitors, registers toolsDiscover PluginsScan extensions/ and node_modulesLoad Entry Point (jiti)Create Contextinitialize(context)configgatewayonShutdown(cleanup)shutdown() or onShutdown callbacksCleanup resources

**Sources:** [src/plugins/source-display.ts1-100](https://github.com/openclaw/openclaw/blob/e321f21d/src/plugins/source-display.ts#L1-L100) [AGENTS.md11-13](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L11-L13)

---

## Common Plugin Patterns

### Pattern: Config-Gated Initialization

```
export async function initialize(context: PluginContext) {
  const config = context.config.myPlugin;
  if (!config?.enabled) return;

  // Initialize only if explicitly enabled
}
```

### Pattern: Gateway RPC Registration

```
export async function initialize(context: PluginContext) {
  // Register custom RPC methods
  context.gateway.registerMethod("myplugin.action", async (params) => {
    // Handle RPC call
    return { success: true };
  });
}
```

### Pattern: Cleanup Registration

```
export async function initialize(context: PluginContext) {
  const resource = await acquireResource();

  context.onShutdown(async () => {
    await resource.release();
  });
}
```

**Sources:** [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37) [extensions/voice-call/package.json1-20](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/voice-call/package.json#L1-L20)

---

## Troubleshooting Plugin Development

### Plugin Not Discovered

Check:

- `package.json` has valid `openclaw` field
- Plugin is in `extensions/` or `node_modules/`
- `extensions` array points to valid files
- File paths use relative `./` notation

### Runtime Errors on Load

Check:

- Plugin exports `initialize` function
- `initialize` accepts `PluginContext` parameter
- No syntax errors in entry point
- Dependencies are installed (`npm install` or `pnpm install`)

### Channel Not Appearing in UI

Check:

- `channel` field is present in `openclaw` manifest
- `channel.id` is unique and doesn't conflict
- Gateway restarted after plugin installation

**Sources:** [src/plugins/source-display.ts1-100](https://github.com/openclaw/openclaw/blob/e321f21d/src/plugins/source-display.ts#L1-L100) [extensions/matrix/package.json1-37](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/package.json#L1-L37)

---

## CI and GitHub Actions for Plugins

OpenClaw's CI pipeline includes plugin validation. For bundled plugins under `extensions/`:

- Auto-labeled by path in pull requests
- Tested via core test suite
- Version-synced via `pnpm plugins:sync` script

For external plugins, set up your own CI:

```
name: Plugin CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm test
      - run: npm run build
```

**Sources:** [.github/workflows/ci.yml1-50](https://github.com/openclaw/openclaw/blob/e321f21d/.github/workflows/ci.yml#L1-L50) [.github/labeler.yml1-100](https://github.com/openclaw/openclaw/blob/e321f21d/.github/labeler.yml#L1-L100) [AGENTS.md92-97](https://github.com/openclaw/openclaw/blob/e321f21d/AGENTS.md#L92-L97)

---

## Plugin Documentation

Channel plugins should include:

- `README.md` with setup instructions
- `CHANGELOG.md` following OpenClaw's format (version headers, Changes/Fixes sections)
- Docs page at `docs/channels/<channel-id>.md` for bundled plugins

Utility plugins should document:

- What tools/hooks/providers they add
- Configuration options
- Example usage

**Sources:** [docs/reference/RELEASING.md38-42](https://github.com/openclaw/openclaw/blob/e321f21d/docs/reference/RELEASING.md#L38-L42) [extensions/matrix/CHANGELOG.md1-145](https://github.com/openclaw/openclaw/blob/e321f21d/extensions/matrix/CHANGELOG.md#L1-L145)

---

## Next Steps

After creating your plugin:

1.  Test locally in a development environment
2.  Write tests for core functionality
3.  Document configuration options
4.  Publish to npm (for external plugins)
5.  Submit to Clawhub for discoverability
6.  Consider opening a PR to add it to the community plugins list

For more details on specific plugin types, see:

- Channel plugin examples: Matrix, Zalo, Microsoft Teams
- Utility plugin examples: voice-call, diagnostics-otel
