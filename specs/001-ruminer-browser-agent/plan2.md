# Ruminer Blueprint MVP Completion Plan

## Summary

Implement the remaining “unfinished” RR‑V3 pieces needed for
MV3 reliability and the blueprint MVP: robust crash recovery

- retries + timeouts + artifacts, a working ChatGPT
  scanner+ingestion workflow pack with cursors/checkpoints,
  Workflows UI run visibility/scheduling, and runtime tool
  restriction enforcement in the extension background based on
  per‑tool UI selection (not browser.proxy, not group-only).

———

## Key Decisions (Locked)

1. browser.proxy is removed/stale: runtime enforcement
   happens in the extension background, at the Native
   Messaging tool-call entrypoint.
2. Tool restriction is itemwise: allow/deny is computed per
   tool name from the UI’s tool selection state.
3. Scope of enforcement: MCP tool calls only (Native
   Messaging CALL_TOOL requests coming from the native
   server). Internal RR‑V3 workflows must not be blocked by
   chat/tool selection.
4. Paused runs after MV3 restart: requeue paused → queued on
   recovery (avoid stuck paused runs).

———

## Workstream A — Replace stale browser.proxy model with

per‑tool background enforcement (MCP-only)

### A1) Make the UI’s “selected tools” state authoritative

and internally consistent

- Fix tool ID/name mismatches in app/chrome-extension/
  entrypoints/shared/utils/tool-groups.ts so every tool ID
  equals the actual MCP tool name (from packages/shared/src/
  tools.ts). - Example: change chrome_file_upload →
  chrome_upload_file, and audit all other entries.
- Set safe defaults in app/chrome-extension/entrypoints/
  shared/utils/tool-groups.ts: - observe=true, navigate=true, interact=true,
  execute=false, workflow=true - Keep stored user state if it already exists; only
  defaults apply when unset.

### A2) Implement “effective allowed tools” resolver (per-

tool)

- Add a resolver module (no UI coupling) e.g.:
  - app/chrome-extension/entrypoints/background/tool-
    selection/resolve.ts
- Behavior:
  - Read STORAGE_KEYS.TOOL_GROUP_STATE +
    STORAGE_KEYS.INDIVIDUAL_TOOL_STATE.
  - Build toolId -> enabled using:
    - tool is enabled iff its group toggle is on and no
      individual override disables it.
  - Unknown tool IDs: disabled by default unless explicitly
    mapped (security-by-default).
  - Add normalizeToolNameForPolicy(name) with an alias
    table for legacy names if any still arrive via native-
    server.

### A3) Enforce at the Native Messaging tool boundary (MCP-

only)

- In app/chrome-extension/entrypoints/background/native-
  host.ts, inside the NativeMessageType.CALL_TOOL handler: - Extract toolName = message.payload?.name. - If toolName is not allowed by resolver: - Return a ToolResult equivalent to
  createErrorResponse(...) with message: - Disabled tool: <toolName>. Enable it in Ruminer
  → Tools. - Still respond with status:'success' so the MCP
  caller receives a normal tool result with
  isError=true. - If allowed: proceed to handleCallTool(...).
- Also apply the same enforcement to the UI bridge path:
  - chrome.runtime.onMessage handler for
    { type:'call_tool' } in app/chrome-extension/
    entrypoints/background/native-host.ts.

### A4) Update prompt-layer restriction text to itemwise

(disabled-tools list)

- Replace group-based phrasing with an explicit disabled list:
  - “Disabled browser tools: … (IDs). Do not use disabled
    tools.”
- Implement this in:
  - backed by a new helper in app/chrome-extension/
    entrypoints/shared/utils/tool-groups.ts:
    - getEffectiveDisabledToolIds(state, individualState): string[]

### A5) Tests

- Add a new contract test file, e.g.:
  - app/chrome-extension/tests/tool-
    selection.contract.test.ts
- Cover:
  - Every tool name in packages/shared/src/tools.ts that is
    exposed in TOOL_SCHEMAS must appear in the UI catalog
    (or be intentionally excluded with a documented
    exclusion list).
  - Resolver correctness (group off disables all tools in
    group; individual override disables one tool).
  - Unknown tool name resolves to disabled.

———

## Workstream B — RR‑V3 reliability completion (what

“unfinished” means in runtime)

### B1) Crash recovery: requeue paused runs on restart

- Update queue recovery to treat orphan paused runs like
  running runs: - In app/chrome-extension/entrypoints/background/record-
  replay-v3/storage/queue.ts: - recoverOrphanLeases(...) must set paused → queued
  and drop lease. - In .../engine/recovery/recovery-coordinator.ts: - Patch RunRecord status to queued - Emit run.recovered with fromStatus:'paused' →
  toStatus:'queued'

### B2) Implement run-level retries (queue maxAttempts

becomes real)

- Add a queue operation to requeue without incrementing
  attempt: - Extend RunQueue interface in .../engine/queue/queue.ts
  with: - requeue(runId, now, opts?: { reason?: string }):
  Promise<void> - Implement in .../storage/queue.ts: - status → queued, drop lease, keep attempt
  unchanged, update timestamps.
- Update scheduler finalization in .../engine/queue/
  scheduler.ts: - After deps.execute(item) completes, inspect the
  RunRecord (from storage) and decide: - succeeded|canceled → markDone - failed: - if item.attempt < item.maxAttempts AND
  shouldRetryRun(run.error) → queue.requeue(...)
  (do not markDone) - else markDone
- Define shouldRetryRun(error) (decision-complete):
  - retry if error.retryable === true OR error.code ∈
    {NETWORK_REQUEST_FAILED, TIMEOUT, NAVIGATION_FAILED,
    INTERNAL}
  - never retry if error.code ∈ {VALIDATION_ERROR,
    PERMISSION_DENIED, DAG_INVALID, DAG_CYCLE,
    UNSUPPORTED_NODE}

### B3) Enforce flow run timeouts + correct node timeout

scoping

- In .../engine/kernel/runner.ts:
  - Enforce flow.policy.runTimeoutMs over the entire run.
  - Implement TimeoutPolicy.scope:'node' as total time
    across attempts, not per attempt.

### B4) Artifacts + drift/repair signal (FR‑029)

- Replace the current artifact implementation to capture the
  actual run tab: - Implement createCdpArtifactService() in .../engine/
  kernel/artifacts.ts using existing CDP helpers (@/
  utils/cdp-session-manager) to call
  Page.captureScreenshot.
- Implement drift capture in .../engine/kernel/runner.ts:
  - Track consecutive failures per nodeId within a run
    attempt loop.
  - On 3rd consecutive failure for the same node:
    - capture bounded screenshot (downscale/quality cap)
    - capture bounded HTML snippet via
      chrome.scripting.executeScript returning a
      sanitized+truncated string (e.g. 50k chars max)
    - append run events:
      - artifact.screenshot (use existing event, store
        base64 in data)
      - add new event type artifact.html_snippet
        (extend domain/events.ts) with { nodeId, data }
    - patch RunRecord with a new optional field:
      - repair?: { needed:true; nodeId; ts;
        reason:'drift_3x'; }
- Add Workflows UI surfacing (see Workstream D).

### B5) Tests

Extend RR‑V3 tests in app/chrome-extension/tests/record-
replay-v3/:

- Recovery: paused → queued on crash recovery.
- Scheduler: failed retryable run requeues until maxAttempts,
  then terminates.
- Runner: run timeout triggers a terminal failure with
  TIMEOUT.

———

## Workstream C — ChatGPT platform pack (workflow-level scripts + backend APIs)

- Remove platform-specific ingestion nodes (`ruminer.scan_conversation_list`, `ruminer.extract_messages`).
- Implement ChatGPT ingestion using workflow-level `script` nodes calling backend APIs, with resumable state stored in
  `chrome.storage.local` (cursor/checkpoints) and ledger-based idempotency.
- Add background RPC helpers for workflow scripts (ledger existence checks, ingestion entrypoint, and notifications).

### C6) Tests

- Add unit tests for scan heuristic as a pure function (new
  helper module).
- Add v3 integration test that:
  - initializes empty scan state
  - runs scanner once → enqueues ingestion runs + writes
    conversation order
  - reruns scanner with same order → stops after 3 matches
  * enqueues none

———

## Workstream D — Workflows UI: progress, stop, schedule,

repair visibility (FR‑011/012/013/024/029/032)

### D1) Real-time progress + event timeline

- In app/chrome-extension/entrypoints/sidepanel/components/
  workflows/WorkflowsView.vue: - when a run is expanded (openRunId), fetch events via
  useWorkflowsV3.getRunEvents(runId) and render a
  timeline (new subcomponent recommended). - compute “current step” from the latest node.started /
  run.\* event. - compute processed counts from standardized log events
  emitted by ingestion nodes.

### D2) Stop/cancel controls

- In app/chrome-extension/entrypoints/sidepanel/components/
  workflows/WorkflowListItem.vue: - Add Stop button: - queued → rr_v3.cancelQueueItem - running/paused → rr_v3.cancelRun - Must stop within ~2s (best-effort); UI updates via
  event subscription already present in useWorkflowsV3.

### D3) Schedule controls (cron)

- Implement in WorkflowListItem.vue:
  - cron enabled toggle + simple presets (“every 6h”,
    “daily 2am”) producing a cron expression.
- Wire to RPC in app/chrome-extension/entrypoints/sidepanel/
  composables/useWorkflowsV3.ts: - create/update/enable/disable triggers via existing
  rr_v3.\*Trigger methods.

### D4) Drift/repair surface (FR‑029)

- In Workflows UI:
  - detect run.repair.needed via RunRecord.repair (or via
    artifact events), and show a “Needs repair” badge.
  - show captured screenshot + HTML snippet when present.
  - “Open failing run” action:
    - open stored conversationUrl (from run args or event
      context) in a new tab
    - optionally focus a “Debugger”/timeline view.

### D5) Flow version/hash + tool re-approval modal (FR‑032)

- Extend FlowV3 with:
  - meta.versionHash: string
  - meta.requiredTools: string[] (tool IDs)
- Compute versionHash = sha256(stableJson(flow without
  timestamps)) when saving built-in flows (and on any save
  via RPC).
- Add approval store in chrome.storage.local:
  - key: ruminer.flowApprovals
  - value: { [flowId]: { approvedToolsHash, approvedTools,
    approvedAt } }
- Before rr_v3.enqueueRun from UI:
  - if requiredToolsHash differs → show blocking modal
    listing added tools and require approval; then persist
    approval and proceed.

———

## Workstream E — Spec/doc alignment + changelog hygiene

### E1) Update stale browser.proxy references everywhere

- Update:
  - .specify/memory/blueprint.md (tool restriction
    enforcement section)
  - specs/001-ruminer-browser-agent/spec.md (FR‑030
    wording)
  - specs/001-ruminer-browser-agent/contracts/tool-
    groups.md → rewrite as Tool Selection (per-tool)
    contract
  - specs/001-ruminer-browser-agent/quickstart.md (remove
    browser-ext plugin + browser.proxy; document mcp-client
  * native-server path)
  - specs/001-ruminer-browser-agent/tasks.md (remove
    browser-proxy-dispatcher tasks; add native-host
    enforcement tasks)

### E2) Refresh legacy docs

- Rewrite docs/ARCHITECTURE.md to reflect Ruminer/OpenClaw +
  native-server + RR‑V3 + EMOS split.
- Update docs/CHANGELOG.md:
  - add a new Ruminer version section documenting the RR‑V3
    completion + ChatGPT pack + runtime tool enforcement
  - clearly mark earlier “Chrome MCP Server” entries as
    legacy history.

———

## Public Interfaces / Data Changes (Explicit)

- New RR‑V3 node kinds:
  - ruminer.page_auth_check
  - (optional) ruminer.random_delay
- New persistent var:
  - meta.requiredTools
- New chrome.storage.local key:
  - ruminer.flowApprovals

———

## Test Matrix / Acceptance Scenarios

1. Runtime tool restriction (itemwise):
   - Disable chrome_click_element in Tools UI → an OpenClaw
     MCP tool call to chrome_click_element returns
     isError=true with “Disabled tool …”.
2. RR‑V3 crash recovery:
   - Pause a run → simulate SW restart → run becomes queued
     and executes again (no stuck paused).
3. Run retry:
   - Force a retryable failure (e.g., EMOS unreachable) →
     run requeues until maxAttempts, then fails terminal.
4. ChatGPT pack:
   - Run scanner → enqueues conversation ingestion runs →
     items ingested into EMOS → rerun scanner → no
     duplicates.
5. Workflows UI:
   - Run shows live step + processed counts; Stop cancels
     within ~2s; timeline shows events; drift artifacts
     appear after 3 consecutive failures.

———

## Rollout / Migration Notes

- Tool default changes apply only if no stored tool state
  exists.
- RR‑V3 schema changes are additive (optional fields + new
  event type); no DB migration required unless later added
  deliberately.
