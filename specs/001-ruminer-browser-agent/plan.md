# Implementation Plan: Ruminer Browser Agent

**Branch**: `001-ruminer-browser-agent` | **Date**: 2026-02-27 | **Updated**: 2026-03-03 | **Spec**: `specs/001-ruminer-browser-agent/spec.md`  
**Input**: Feature specification from `specs/001-ruminer-browser-agent/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a sidepanel-first Chrome MV3 extension that connects to the OpenClaw Gateway over localhost
WebSocket as an **operator/UI client** for chat (`chat.*`), and exposes browser automation via a
local MCP server (`app/native-server`). OpenClaw calls those MCP tools via the `mcp-client` plugin
(OpenClaw → MCP client → Ruminer MCP server), and the native server bridges execution to the
extension via Native Messaging.

Ruminer enforces tool restrictions in **two layers**, both inside the extension:

- **Prompt layer**: sidepanel chat injects an itemwise _disabled-tools list_ (denylist) derived from the
  UI tool selection state
- **Runtime layer**: the extension background enforces per-tool allow/deny at the Native Messaging
  tool-call entrypoint for **MCP tool calls only** (no `browser.proxy`; not group-only; RR‑V3 internal
  workflows are never blocked by chat tool selection)

Ruminer runs RR‑V3 for MV3-safe workflows (crash recovery, retries, timeouts, artifacts) and ingests
AI chat history (ChatGPT first, then Gemini/Claude/DeepSeek) into EverMemOS via two paths:

- Extension direct EMOS client: autonomous ingestion workflows (RR-V3 triggered) run within the extension and convert message elements in DOM into standard EMOS message JSON.
- OpenClaw `evermemos` plugin: memory search + auto-ingest of the user's sidepanel chat with the agent.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (monorepo uses TypeScript `^5.8.3`), Node.js (for build tooling)  
**Primary Dependencies**: Vue 3, WXT (MV3 extension framework), TailwindCSS 4, Zod, pnpm workspaces  
**Storage**: Browser local persistence (`chrome.storage.local`), IndexedDB (RR-V3 stores + ingestion ledger)  
**Testing**: Vitest (extension), `pnpm typecheck` (`tsc --noEmit`)  
**Target Platform**: Chrome extension Manifest V3 (service worker + sidepanel + options)  
**Project Type**: Monorepo (extension + shared TS package + OpenClaw plugin modules)  
**Performance Goals**: Sidepanel feels instant; memory suggestions appear within 500ms debounce budget  
**Constraints**: MV3 service worker lifecycle (restarts, no long-lived state), local-first, secrets in storage only  
**Scale/Scope**: MVP ships Chat tab + Tool Selection (groups + per-tool overrides) + RR‑V3 workflow runtime + ChatGPT ingestion pack; then 3 more packs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Code quality & type safety**: Strict TypeScript; explicit error handling; no dead code.
- **Pattern consistency**: Follow existing extension message/state patterns; reuse RR-V3 storage/engine patterns.
- **Best practices**: Respect MV3 SW constraints; validate untrusted inputs across boundary (content ↔ background).
- **UX**: Any long op shows progress; errors are plain-language with next steps; workflows are stoppable.
- **Engineering standards**: `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build` pass before merge.

## Project Structure

### Documentation (this feature)

```text
specs/001-ruminer-browser-agent/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
app/
├── chrome-extension/                 # MV3 extension (Vue 3 + WXT)
│   ├── entrypoints/
│   │   ├── background/               # SW orchestration (tools, RR-V3, dispatch)
│   │   ├── sidepanel/                # Sidepanel UI (Chat/Memory/Workflows)
│   │   └── options/                  # Options (Gateway + EMOS config, tool defaults)
│   └── common/                       # Shared UI/background constants + message types
│
└── openclaw-extensions/
    ├── evermemos/                    # OpenClaw plugin (existing): add/search memory
    └── mcp-client/                  # OpenClaw plugin (existing): OpenClaw → MCP client → /mcp

packages/
├── shared/                           # Shared TS types/constants (legacy MCP tool schemas, etc.)
└── wasm-simd/                        # WASM SIMD utilities (optional)
```

**Structure Decision**: Keep the existing pnpm monorepo. Implement the new architecture primarily in
`app/chrome-extension/entrypoints/background/` (Native Messaging tool executor + RR-V3 runtime) and
`app/chrome-extension/entrypoints/sidepanel/` (native-server agent chat UI + tool selection UI + workflows UI),
and use `app/openclaw-extensions/mcp-client` to expose MCP tools inside OpenClaw.

## Phase Plan (high-level)

### Phase 0 — Research & Interface Decisions

- Confirm OpenClaw Gateway WS frame shapes + relevant `chat.*` usage for UI.
- Decide session strategy for sidepanel (MVP: deterministic `sessionKey = "main"`).
- Align chat transport: sidepanel → native-server (HTTP + SSE), native-server → OpenClaw Gateway (WebSocket).

### Phase 1 — Design Artifacts (contracts + data model)

- Define contracts for:
  - Gateway WS handshake + event framing (subset used by extension)
  - MCP tool call semantics + **Tool Selection policy** (prompt denylist + runtime per-tool enforcement)
  - Standard EMOS message JSON + ingestion ledger entry + EMOS API mapping
- Produce data model for settings, tool groups, ledger, and RR-V3 workflow entities.

### Phase 2 — Implementation Planning (ready for `/speckit.tasks`)

- Ensure OpenClaw tool calls work via `mcp-client` → local MCP server (`app/native-server`).
- Update sidepanel Chat tab to use native-server agent routes (`/agent/chat/:sessionId/act`) and render streamed events.
- Implement tool selection state + prompt-layer denylist injection.
- Implement runtime per-tool enforcement at the Native Messaging boundary (MCP-only).
- Implement autonomous ingestion workflow nodes (ChatGPT pack first) + ledger + EMOS direct client.

### Phase 3 — MVP Completion

This phase integrates the concrete “unfinished RR‑V3 pieces” and doc hygiene required for MV3 reliability
and the Blueprint MVP.

- Workstream A: Replace stale `browser.proxy` model with per-tool background enforcement (MCP-only)
- Workstream B: RR‑V3 reliability completion (crash recovery, retries, timeouts, artifacts)
- Workstream C: ChatGPT platform pack (scanner + ingestion) with cursors/checkpoints
- Workstream D: Workflows UI (progress, stop, schedule, repair visibility, tool re-approval)
- Workstream E: Spec/doc alignment + changelog hygiene

---

## Blueprint MVP Completion Plan

### Summary

Implement the remaining “unfinished” RR‑V3 pieces needed for MV3 reliability and the Blueprint MVP:

- retries + timeouts + artifacts
- a working ChatGPT scanner + ingestion workflow pack with cursors/checkpoints
- Workflows UI run visibility + scheduling
- runtime tool restriction enforcement in the extension background based on per‑tool UI selection
  (not `browser.proxy`, not group-only)

### Key Decisions (Locked)

1. `browser.proxy` is removed/stale: runtime enforcement happens in the extension background, at the
   Native Messaging tool-call entrypoint.
2. Tool restriction is itemwise: allow/deny is computed per tool name from the UI’s tool selection state.
3. Scope of enforcement: MCP tool calls only (Native Messaging `CALL_TOOL` requests coming from the
   native server). Internal RR‑V3 workflows must not be blocked by chat/tool selection.
4. Paused runs after MV3 restart: requeue paused → queued on recovery (avoid stuck paused runs).

---

## Workstream A — Replace stale `browser.proxy` model with per‑tool background enforcement (MCP-only)

### A1) Make the UI’s “selected tools” state authoritative and internally consistent

- Fix tool ID/name mismatches in `app/chrome-extension/entrypoints/shared/utils/tool-groups.ts` so every
  tool ID equals the actual MCP tool name (from `packages/shared/src/tools.ts`).
  - Example: change `chrome_file_upload` → `chrome_upload_file`, and audit all other entries.
- Set safe defaults in `app/chrome-extension/entrypoints/shared/utils/tool-groups.ts`:
  - observe=true, navigate=true, interact=true, execute=false, workflow=true
  - Keep stored user state if it already exists; defaults apply only when unset.

### A2) Implement “effective allowed tools” resolver (per-tool)

- Add a resolver module (no UI coupling), e.g.:
  - `app/chrome-extension/entrypoints/background/tool-selection/resolve.ts`
- Behavior:
  - Read `STORAGE_KEYS.TOOL_GROUP_STATE` + `STORAGE_KEYS.INDIVIDUAL_TOOL_STATE`.
  - Build `toolId -> enabled` using:
    - tool is enabled iff its group toggle is on and no individual override disables it.
  - Unknown tool IDs: disabled by default unless explicitly mapped (security-by-default).
  - Add `normalizeToolNameForPolicy(name)` with an alias table for legacy names if any still arrive via
    native-server.

### A3) Enforce at the Native Messaging tool boundary (MCP-only)

- In `app/chrome-extension/entrypoints/background/native-host.ts`, inside the
  `NativeMessageType.CALL_TOOL` handler:
  - Extract `toolName = message.payload?.name`.
  - If `toolName` is not allowed by resolver:
    - Return a ToolResult equivalent to `createErrorResponse(...)` with message:
      - `Disabled tool: <toolName>. Enable it in Ruminer → Tools.`
    - Still respond with `status:'success'` so the MCP caller receives a normal tool result with
      `isError=true`.
  - If allowed: proceed to `handleCallTool(...)`.
- Also apply the same enforcement to the UI bridge path:
  - `chrome.runtime.onMessage` handler for `{ type:'call_tool' }` in
    `app/chrome-extension/entrypoints/background/native-host.ts`.

### A4) Update prompt-layer restriction text to itemwise (disabled-tools list)

- Replace group-based phrasing with an explicit disabled list:
  - `Disabled browser tools: … (IDs). Do not use disabled tools.`
- Implement this in:
  - `app/chrome-extension/entrypoints/sidepanel/composables/useAgentChat.ts`
  - backed by a new helper in `app/chrome-extension/entrypoints/shared/utils/tool-groups.ts`:
    - `getEffectiveDisabledToolIds(state, individualState): string[]`

### A5) Tests

- Add a new contract test file, e.g.:
  - `app/chrome-extension/tests/tool-selection.contract.test.ts`
- Cover:
  - Every tool name in `packages/shared/src/tools.ts` that is exposed in `TOOL_SCHEMAS` must appear in
    the UI catalog (or be intentionally excluded with a documented exclusion list).
  - Resolver correctness (group off disables all tools in group; individual override disables one tool).
  - Unknown tool name resolves to disabled.

---

## Workstream B — RR‑V3 reliability completion (what “unfinished” means in runtime)

### B1) Crash recovery: requeue paused runs on restart

- Update queue recovery to treat orphan paused runs like running runs:
  - In `app/chrome-extension/entrypoints/background/record-replay-v3/storage/queue.ts`:
    - `recoverOrphanLeases(...)` must set paused → queued and drop lease.
  - In `.../engine/recovery/recovery-coordinator.ts`:
    - Patch RunRecord status to queued
    - Emit `run.recovered` with `fromStatus:'paused'` → `toStatus:'queued'`

### B2) Implement run-level retries (queue maxAttempts becomes real)

- Add a queue operation to requeue without incrementing attempt:
  - Extend RunQueue interface in `.../engine/queue/queue.ts` with:
    - `requeue(runId, now, opts?: { reason?: string }): Promise<void>`
  - Implement in `.../storage/queue.ts`:
    - status → queued, drop lease, keep attempt unchanged, update timestamps.
- Update scheduler finalization in `.../engine/queue/scheduler.ts`:
  - After `deps.execute(item)` completes, inspect the RunRecord (from storage) and decide:
    - succeeded|canceled → markDone
    - failed:
      - if `item.attempt < item.maxAttempts` AND `shouldRetryRun(run.error)` → `queue.requeue(...)`
        (do not markDone)
      - else markDone
- Define `shouldRetryRun(error)` (decision-complete):
  - retry if `error.retryable === true` OR `error.code ∈ {NETWORK_REQUEST_FAILED, TIMEOUT, NAVIGATION_FAILED, INTERNAL}`
  - never retry if `error.code ∈ {VALIDATION_ERROR, PERMISSION_DENIED, DAG_INVALID, DAG_CYCLE, UNSUPPORTED_NODE}`

### B3) Enforce flow run timeouts + correct node timeout scoping

- In `.../engine/kernel/runner.ts`:
  - Enforce `flow.policy.runTimeoutMs` over the entire run.
  - Implement `TimeoutPolicy.scope:'node'` as total time across attempts, not per attempt.

### B4) Artifacts + drift/repair signal (FR‑029)

- Replace the current artifact implementation to capture the actual run tab:
  - Implement `createCdpArtifactService()` in `.../engine/kernel/artifacts.ts` using existing CDP
    helpers (`@/utils/cdp-session-manager`) to call `Page.captureScreenshot`.
- Implement drift capture in `.../engine/kernel/runner.ts`:
  - Track consecutive failures per nodeId within a run attempt loop.
  - On 3rd consecutive failure for the same node:
    - capture bounded screenshot (downscale/quality cap)
    - capture bounded HTML snippet via `chrome.scripting.executeScript` returning a sanitized+truncated
      string (e.g. 50k chars max)
    - append run events:
      - `artifact.screenshot` (use existing event, store base64 in data)
      - add new event type `artifact.html_snippet` (extend `domain/events.ts`) with `{ nodeId, data }`
    - patch RunRecord with a new optional field:
      - `repair?: { needed:true; nodeId; ts; reason:'drift_3x' }`
- Add Workflows UI surfacing (see Workstream D).

### B5) Tests

Extend RR‑V3 tests in `app/chrome-extension/tests/record-replay-v3/`:

- Recovery: paused → queued on crash recovery.
- Scheduler: failed retryable run requeues until maxAttempts, then terminates.
- Runner: run timeout triggers a terminal failure with TIMEOUT.

---

## Workstream C — ChatGPT platform pack (scanner + conversation ingestion), with cursors/checkpoints

### C1) Add missing orchestration node: scanner that enqueues conversation ingestion runs

- Add a composite RR‑V3 node in `.../engine/plugins/ruminer-ingest/scan-conversation-list.ts`:
  - Node kind: `ruminer.scan_conversation_list`
  - Config (exact):
    - platform: string (use `chatgpt` for MVP)
    - listScript: string (runs in tab, returns `{ items, nextCursor, done }`)
    - targetFlowIdVar: string (var holding ingestion flow id, default `ruminer.scan.targetFlowId`)
    - stateKey: string (persistent var key, default `$scan.<platform>.state`)
    - heuristicMatchStreak: number default 3
    - maxItemsPerRun: number default 50 (20–50 allowed)
    - maxEnqueuePerRun: number default 50
    - fullScanEveryRuns: number default 20
    - fullScanEveryDays: number default 7
    - maxOrderListSize: number default 500
    - filtersVar: string default `ruminer.scan.filters` (object; used to compute filterHash)
  - Persistent state shape at `$scan.chatgpt.state`:

    ```ts
    type ScanStateV1 = {
      schemaVersion: 1;
      conversationOrder: string[]; // newest→older, capped to maxOrderListSize
      filterHash: string | null;
      scannerRuns: number;
      lastFullScanAt: number | null; // completion time
      fullScanCursor: string | null; // null when not in-progress
    };
    ```

  - Algorithm (exact):
    - Load ScanStateV1 (or initialize empty).
    - Compute `filterHash = sha256(stableJson(filters))`; if changed:
      - clear conversationOrder, reset `fullScanCursor=null`, set `lastFullScanAt=null`
    - Decide mode:
      - If `fullScanCursor != null`: continue full scan.
      - Else if conversationOrder empty: start full scan.
      - Else if `(scannerRuns % fullScanEveryRuns === 0)` OR `(now-lastFullScanAt > fullScanEveryDays)`:
        start full scan.
      - Else normal scan.
    - Run listScript once to fetch up to maxItemsPerRun items for current cursor.
    - In normal scan: apply heuristic stop while iterating returned items at indices starting at 0:
      - maintain streak of consecutive `item.id === conversationOrder[index]`
      - break after heuristicMatchStreak is reached
    - Determine shouldEnqueue for each visited item:
      - new: id not in conversationOrder
      - moved: conversationOrder[index] exists and differs from current id
      - fullScanBackfill: (mode=fullScan) and conversation has never been ingested (see C2)
    - Enqueue ingestion runs via `enqueueRun(...)`:
      - args must include:
        - platform:'chatgpt'
        - conversationId
        - conversationUrl
      - priority: scanner=10, conversation_ingest=0
    - Update conversationOrder only when cursor==0:
      - `newOrder = unique(scannedTopIds + oldOrderMinusThoseIds)`; cap to maxOrderListSize
    - Update/advance fullScanCursor:
      - if mode=fullScan and done=false:
        - set cursor=nextCursor and enqueue a continuation run of the scanner flow itself (flowId=ctx.flow.id)
          with args `{ ruminerScanContinuation:true }`
      - if done=true: set fullScanCursor=null, set lastFullScanAt=now
    - Increment scannerRuns on successful node completion.
    - Emit progress logs via `ctx.log('info', ..., { scanned, enqueued, mode, cursor })`.

### C2) Add “conversation ever ingested” check used by full scan backfill

- Extend ledger module with an index-based existence check:
  - `app/chrome-extension/entrypoints/background/ruminer/ingestion-ledger.ts`:
    - `hasAnyLedgerEntryForGroup(groupId: string): Promise<boolean>` using group_id index
- Full scan mode enqueues backfill ingestion only when `hasAnyLedgerEntryForGroup(groupId)` is false.

### C3) Implement ChatGPT built-in flows and register on startup

- Create:
  - `app/chrome-extension/entrypoints/background/ruminer/builtin-flows/chatgpt.ts`
  - `app/chrome-extension/entrypoints/background/ruminer/builtin-flows/index.ts`
- Two FlowV3 definitions with stable IDs:
  1. `ruminer.chatgpt.scanner.v1`
     - Nodes: navigate → ruminer.scan_conversation_list
     - Flow variables:
       - `ruminer.scan.targetFlowId = 'ruminer.chatgpt.conversation_ingest.v1'`
       - filter variables (minMessages/dateRange) under `ruminer.scan.filters`
  2. `ruminer.chatgpt.conversation_ingest.v1`
     - Nodes: navigate → ruminer.page_auth_check → ruminer.extract_messages → ruminer.normalize_and_hash →
       ruminer.ledger_upsert → ruminer.emos_ingest
     - Variables: conversationUrl, conversationId
- In `app/chrome-extension/entrypoints/background/record-replay-v3/bootstrap.ts`:
  - Add `ensureBuiltinFlows(storage)` that upserts built-ins if missing.
  - Mark built-in flows via `flow.meta.tags += ['builtin']` and `flow.meta.bindings` for recommended
    origins (ChatGPT), but do not hard-restrict (per `<all_urls>`).

### C4) Add missing node: platform login check (FR‑023)

- Add `ruminer.page_auth_check` node:
  - config: `{ platformLabel, script, notifyTitle }`
  - script returns boolean “logged in”
  - on false: emit chrome.notifications with “Not logged in to <platform> …”, return PERMISSION_DENIED.

### C5) Rate limiting/delays (FR‑026)

- Add a simple node `ruminer.random_delay` (or reuse V2 delay) and put it into built-in flows:
  - between navigation and extraction, and between major steps
  - default ranges: page loads 1–3s, interactions 200–500ms (configurable as vars)

### C6) Tests

- Add unit tests for scan heuristic as a pure function (new helper module).
- Add v3 integration test that:
  - initializes empty scan state
  - runs scanner once → enqueues ingestion runs + writes conversation order
  - reruns scanner with same order → stops after 3 matches and enqueues none

---

## Workstream D — Workflows UI: progress, stop, schedule, repair visibility (FR‑011/012/013/024/029/032)

### D1) Real-time progress + event timeline

- In `app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`:
  - when a run is expanded (openRunId), fetch events via `useWorkflowsV3.getRunEvents(runId)` and render
    a timeline (new subcomponent recommended).
  - compute “current step” from the latest node.started / run.\* event.
  - compute processed counts from standardized log events emitted by ingestion nodes.

### D2) Stop/cancel controls

- In `app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`:
  - Add Stop button:
    - queued → `rr_v3.cancelQueueItem`
    - running/paused → `rr_v3.cancelRun`
  - Must stop within ~2s (best-effort); UI updates via event subscription already present in useWorkflowsV3.

### D3) Schedule controls (cron)

- Implement in `WorkflowListItem.vue`:
  - cron enabled toggle + simple presets (“every 6h”, “daily 2am”) producing a cron expression.
- Wire to RPC in `app/chrome-extension/entrypoints/sidepanel/composables/useWorkflowsV3.ts`:
  - create/update/enable/disable triggers via existing `rr_v3.*Trigger` methods.

### D4) Drift/repair surface (FR‑029)

- In Workflows UI:
  - detect run.repair.needed via RunRecord.repair (or via artifact events), and show a “Needs repair” badge.
  - show captured screenshot + HTML snippet when present.
  - “Open failing run” action:
    - open stored conversationUrl (from run args or event context) in a new tab
    - optionally focus a “Debugger”/timeline view.

### D5) Flow version/hash + tool re-approval modal (FR‑032)

- Extend FlowV3 with:
  - `meta.versionHash: string`
  - `meta.requiredTools: string[]` (tool IDs)
- Compute `versionHash = sha256(stableJson(flow without timestamps))` when saving built-in flows (and on
  any save via RPC).
- Add approval store in chrome.storage.local:
  - key: `ruminer.flowApprovals`
  - value: `{ [flowId]: { approvedToolsHash, approvedTools, approvedAt } }`
- Before `rr_v3.enqueueRun` from UI:
  - if requiredToolsHash differs → show blocking modal listing added tools and require approval; then
    persist approval and proceed.

---

## Workstream E — Spec/doc alignment + changelog hygiene

### E1) Update stale `browser.proxy` references everywhere

- Update:
  - `.specify/memory/blueprint.md` (tool restriction enforcement section)
  - `specs/001-ruminer-browser-agent/spec.md` (FR‑030 wording)
  - `specs/001-ruminer-browser-agent/contracts/tool-groups.md` → rewrite as Tool Selection (per-tool) contract
  - `specs/001-ruminer-browser-agent/quickstart.md` (remove browser-ext plugin + browser.proxy; document
    mcp-client \* native-server path)
  - `specs/001-ruminer-browser-agent/tasks.md` (remove browser-proxy-dispatcher tasks; add native-host enforcement tasks)

### E2) Refresh legacy docs

- Rewrite `docs/ARCHITECTURE.md` to reflect Ruminer/OpenClaw + native-server + RR‑V3 + EMOS split.
- Update `docs/CHANGELOG.md`:
  - add a new Ruminer version section documenting the RR‑V3 completion + ChatGPT pack + runtime tool enforcement
  - clearly mark earlier “Chrome MCP Server” entries as legacy history.

---

## Public Interfaces / Data Changes (Explicit)

- New RR‑V3 node kinds:
  - `ruminer.scan_conversation_list`
  - `ruminer.page_auth_check`
  - (optional) `ruminer.random_delay`
- New Flow metadata:
  - `meta.requiredTools`
  - `meta.versionHash`
- New chrome.storage.local key:
  - `ruminer.flowApprovals`
- New/extended run diagnostics data:
  - `artifact.html_snippet` run event
  - `RunRecord.repair?: { needed:true; nodeId; ts; reason:'drift_3x' }`

---

## Test Matrix / Acceptance Scenarios

1. Runtime tool restriction (itemwise):
   - Disable `chrome_click_element` in Tools UI → an OpenClaw MCP tool call to `chrome_click_element`
     returns `isError=true` with “Disabled tool …”.
2. RR‑V3 crash recovery:
   - Pause a run → simulate SW restart → run becomes queued and executes again (no stuck paused).
3. Run retry:
   - Force a retryable failure (e.g., EMOS unreachable) → run requeues until maxAttempts, then fails terminal.
4. ChatGPT pack:
   - Run scanner → enqueues conversation ingestion runs → items ingested into EMOS → rerun scanner → no duplicates.
5. Workflows UI:
   - Run shows live step + processed counts; Stop cancels within ~2s; timeline shows events; drift artifacts
     appear after 3 consecutive failures.

---

## Rollout / Migration Notes

- Tool default changes apply only if no stored tool state exists.
- RR‑V3 schema changes are additive (optional fields + new event type); no DB migration required unless later
  added deliberately.

---

## Discrepancies & Conflicts (Original plan vs current plan, plus affected docs)

This section enumerates the concrete mismatches between the original `plan.md` draft and the current
MVP completion plan (Workstreams A–E), plus conflicts with existing docs/spec that must be updated per
Workstream E.

### 1) Tool restriction model (prompt + runtime)

- **Conflict**: `plan.md` Phase 1 previously described “tool group policy (prompt-layer now; runtime layer optional)”.
  - **Resolution**: runtime enforcement is **required** and **locked** (Workstream A3) at the extension background’s
    Native Messaging `CALL_TOOL` entrypoint; prompt injection must be an **itemwise disabled-tools list** (Workstream A4).
- **Conflict**: `plan.md` previously framed restrictions as **group-level** toggles (“tool groups”) without requiring
  per-tool normalization.
  - **Resolution**: keep tool groups as UX, but enforcement becomes **per-tool name**, computed from group toggles +
    per-tool overrides (Workstream A2), with unknown tools disabled-by-default.
- **Doc conflicts (resolved in this branch; keep checking for regressions)**:
  - `specs/001-ruminer-browser-agent/contracts/tool-groups.md` rewritten as per-tool Tool Selection contract (no route → group mapping).
  - `.specify/memory/blueprint.md`, `specs/001-ruminer-browser-agent/quickstart.md`, and `specs/001-ruminer-browser-agent/spec.md`
    aligned to `mcp-client` and Native Messaging runtime enforcement (no `browser-ext` dependency for tool calls).

### 2) Enforcement scope: MCP-only vs workflows

- **Conflict**: `plan.md` did not explicitly separate chat tool selection from internal workflow execution.
  - **Resolution**: enforcement scope is **MCP tool calls only** (Native Messaging `CALL_TOOL` requests from native-server).
    RR‑V3 internal workflows must not be blocked by chat/tool selection (Workstream A3 + locked decision #3).

### 3) RR‑V3 reliability definition (“unfinished”)

- **Discrepancy**: `plan.md` broadly stated “RR‑V3 for reliable workflows” but did not define the reliability bar.
  - **Resolution**: adopt Workstream B as explicit scope: paused→queued recovery, run-level retries, run timeouts,
    artifact capture, drift/repair signaling, and required test coverage.

### 4) Artifacts and drift/repair surface (FR‑029)

- **Discrepancy**: `plan.md` did not specify artifact capture method or drift-trigger conditions.
  - **Resolution**: implement CDP screenshot capture of the **actual run tab** and capture bounded HTML snippet on the
    3rd consecutive failure for a node; emit `artifact.html_snippet` and set `RunRecord.repair` (Workstream B4).

### 5) ChatGPT pack: scanner algorithm + cursor/checkpoint semantics

- **Discrepancy**: `plan.md` referenced “ChatGPT ingestion pack” but did not define scanner heuristics, cursor continuation,
  or the persistent scan state schema.
  - **Resolution**: adopt Workstream C exactly: ScanStateV1 schema, heuristicMatchStreak=3 stop condition, periodic full scans,
    cursor continuation via scanner self-enqueue, and backfill gating via “ever ingested” ledger check.

### 6) Workflows UI requirements (FR‑011/012/013/024/032)

- **Discrepancy**: `plan.md` mentioned “Workflows UI” but not the concrete interaction model.
  - **Resolution**: adopt Workstream D: event timeline on expand, stop/cancel semantics and latency target, cron scheduling UI +
    RPC wiring, drift/repair badge + “open failing run”, and tool re-approval modal keyed by `meta.requiredTools` + versionHash.

### 7) Public interfaces / data changes not previously captured

- **Discrepancy**: `plan.md` did not enumerate new node kinds, new flow metadata, or new storage keys.
  - **Resolution**: adopt the “Public Interfaces / Data Changes” section above (nodes, `meta.requiredTools`, `meta.versionHash`,
    `ruminer.flowApprovals`, `artifact.html_snippet`, `RunRecord.repair`).

### 8) Doc + changelog hygiene scope

- **Discrepancy**: `plan.md` did not include a plan to eliminate stale `browser.proxy`/`browser-ext` references in the repo.
  - **Resolution**: adopt Workstream E: update blueprint/spec/contracts/quickstart/tasks, refresh `docs/ARCHITECTURE.md`,
    and update `docs/CHANGELOG.md`.
