### 1. Plugin scaffold and metadata

- Create an npm package and declare the OpenClaw extension in `package.json` under `openclaw.extensions` pointing to your entry file (e.g., `./index.ts`). [1](#0-0)
- Example `package.json` snippet:
  ```json
  {
    "name": "@openclaw/my-cron-plugin",
    "openclaw": {
      "extensions": ["./index.ts"]
    }
  }
  ```

### 2. Using the cron tool from a plugin

- The Gateway provides a `cron` tool with actions: `status`, `list`, `add`, `update`, `remove`, `run`, `runs`, `wake`. [4](#0-3)
- In your plugin, import `createCronTool` and call it via the Gateway RPC (`callGatewayTool`) or directly use the RPC methods (`cron.add`, etc.). [5](#0-4)
- Job schema requires `schedule`, `payload`, and `sessionTarget` (`main` or `isolated`). [6](#0-5)

### 3. Example: plugin that registers a default cron job on load

```ts
// index.ts
import { callGatewayTool } from 'openclaw/plugin-sdk';

export async function activate({ gatewayRpc }) {
  await gatewayRpc('cron.add', {
    name: 'Plugin daily report',
    schedule: { kind: 'cron', expr: '0 8 * * *', tz: 'UTC' },
    sessionTarget: 'isolated',
    payload: { kind: 'agentTurn', message: 'Generate daily report.' },
    delivery: { mode: 'announce', channel: 'slack', to: 'channel:C123' },
  });
}
```

- This uses the same shape as the CLI `openclaw cron add`. [7](#0-6)

### 4. Optional: extend configuration schema

- If your plugin needs config, add a Zod schema and merge it into `OpenClawSchema` via the plugin loader. [1](#0-0)
- Users can then set `cron.enabled`, `cron.store`, etc., globally. [8](#0-7)

### 5. Testing and management

- Use the CLI to verify: `openclaw cron list`, `openclaw cron run <id>`, `openclaw cron runs --id <id>`. [9](#0-8)
- Jobs persist under `~/.openclaw/cron/jobs.json`; avoid manual edits while the Gateway runs. [3](#0-2)

### 6. Delivery and isolation choices

- Isolated jobs (`sessionTarget: "isolated"`) default to `delivery.mode: "announce"`; use `delivery.mode: "none"` to keep output internal. [10](#0-9)
- Main-session jobs require `payload.kind: "systemEvent"`. [11](#0-10)

## Notes

- Plugins don’t get a special “cron API”; they use the same Gateway cron tool/RPC that agents and the CLI use. [2](#0-1)
- Ensure your plugin handles the Gateway being unavailable; wrap calls in try/catch and retry if needed.
- If you only need one-shot reminders, consider `schedule.kind: "at"` with ISO timestamps; they auto-delete by default. [12](#0-11)

Wiki pages you might want to explore:

- [Overview (openclaw/openclaw)](/wiki/openclaw/openclaw#1)

### Citations

**File:** docs/automation/cron-jobs.md (L14-18)

```markdown
Cron is the Gateway’s built-in scheduler. It persists jobs, wakes the agent at
the right time, and can optionally deliver output back to a chat.

If you want _“run this every morning”_ or _“poke the agent in 20 minutes”_,
cron is the mechanism.
```

**File:** docs/automation/cron-jobs.md (L71-74)

```markdown
Cron jobs are persisted on the Gateway host at `~/.openclaw/cron/jobs.json` by default.
The Gateway loads the file into memory and writes it back on changes, so manual edits
are only safe when the Gateway is stopped. Prefer `openclaw cron add/edit` or the cron
tool call API for changes.
```

**File:** docs/automation/cron-jobs.md (L93-94)

```markdown
Optional: one-shot jobs (`schedule.kind = "at"`) delete after success by default. Set
`deleteAfterRun: false` to keep them (they will disable after success).
```

**File:** docs/automation/cron-jobs.md (L292-310)

````markdown
```json
{
  "name": "Morning brief",
  "schedule": { "kind": "cron", "expr": "0 7 * * *", "tz": "America/Los_Angeles" },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "Summarize overnight updates."
  },
  "delivery": {
    "mode": "announce",
    "channel": "slack",
    "to": "channel:C1234567890",
    "bestEffort": true
  }
}
```
````

````

**File:** docs/automation/cron-jobs.md (L357-367)
```markdown
```json5
{
  cron: {
    enabled: true, // default true
    store: "~/.openclaw/cron/jobs.json",
    maxConcurrentRuns: 1, // default 1
    webhook: "https://example.invalid/legacy", // deprecated fallback for stored notify:true jobs
    webhookToken: "replace-with-dedicated-webhook-token", // optional bearer token for webhook mode
  },
}
````

````

**File:** src/agents/tools/cron-tool.ts (L207-224)
```typescript
export function createCronTool(opts?: CronToolOptions, deps?: CronToolDeps): AnyAgentTool {
  const callGateway = deps?.callGatewayTool ?? callGatewayTool;
  return {
    label: "Cron",
    name: "cron",
    ownerOnly: true,
    description: `Manage Gateway cron jobs (status/list/add/update/remove/run/runs) and send wake events.

ACTIONS:
- status: Check cron scheduler status
- list: List jobs (use includeDisabled:true to include disabled)
- add: Create job (requires job object, see schema below)
- update: Modify job (requires jobId + patch object)
- remove: Delete job (requires jobId)
- run: Trigger job immediately (requires jobId)
- runs: Get job run history (requires jobId)
- wake: Send wake event (requires text, optional mode)

````

**File:** src/agents/tools/cron-tool.ts (L225-233)

```typescript
JOB SCHEMA (for add action):
{
  "name": "string (optional)",
  "schedule": { ... },      // Required: when to run
  "payload": { ... },       // Required: what to execute
  "delivery": { ... },      // Optional: announce summary or webhook POST
  "sessionTarget": "main" | "isolated",  // Required
  "enabled": true | false   // Optional, default true
}
```

**File:** src/agents/tools/cron-tool.ts (L251-256)

```typescript
DELIVERY (top-level):
  { "mode": "none|announce|webhook", "channel": "<optional>", "to": "<optional>", "bestEffort": <optional-bool> }
  - Default for isolated agentTurn jobs (when delivery omitted): "announce"
  - announce: send to chat channel (optional channel/to target)
  - webhook: send finished-run event as HTTP POST to delivery.to (URL required)
  - If the task needs to send to a specific chat/recipient, set announce delivery.channel/to; do not call messaging tools inside the run.
```

**File:** src/agents/tools/cron-tool.ts (L258-262)

```typescript
CRITICAL CONSTRAINTS:
- sessionTarget="main" REQUIRES payload.kind="systemEvent"
- sessionTarget="isolated" REQUIRES payload.kind="agentTurn"
- For webhook callbacks, use delivery.mode="webhook" with delivery.to set to a URL.
Default: prefer isolated agentTurn jobs unless the user explicitly wants a main-session system event.
```
