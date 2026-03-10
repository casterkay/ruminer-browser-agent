# Tasks: Ruminer Browser Agent

**Input**: Design documents from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Includes targeted automated tests where `plan.md` explicitly mandates them (contract + Vitest). Otherwise, rely on spec-defined independent test scenarios.

**Organization**: Setup + Foundational + one phase per user story (US1–US5 in priority order) + final Polish phase.

## Format: `- [ ] T### [P?] [US#?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[US#]**: Present only inside user story phases
- **All task descriptions include absolute file paths**

---

## Phase 1: Setup (Spec/Doc Alignment + Hygiene)

**Purpose**: Remove stale `browser.proxy`/`browser-ext` assumptions and align docs/contracts with `plan.md`’s locked decisions before implementing code changes.

- [x] T001 [P] Update tool restriction section to per-tool native-host enforcement (remove `browser.proxy`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/.specify/memory/blueprint.md`
- [x] T002 [P] Update spec wording to match per-tool MCP-only enforcement (remove `browser.proxy` references; keep workflows unblocked) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/spec.md`
- [x] T003 [P] Rewrite group-based “route → group” contract into per-tool Tool Selection contract (UI state → allow/deny by tool name) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/contracts/tool-groups.md`
- [x] T004 [P] Update setup/validation steps to reference `mcp-client → native-server → native-host` (remove `browser-ext` + `browser.proxy`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/quickstart.md`
- [ ] T005 [P] Refresh architecture doc to reflect Ruminer/OpenClaw split, native-server bridge, RR‑V3, and EMOS dual-path integration in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/docs/ARCHITECTURE.md`
- [ ] T006 [P] Add a new changelog entry documenting RR‑V3 completion + ChatGPT pack + runtime per-tool enforcement; mark older “Chrome MCP Server” entries as legacy in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/docs/CHANGELOG.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the `plan.md` security boundary: per-tool allow/deny enforcement in the extension background for **MCP tool calls only** (Native Messaging CALL_TOOL), without blocking internal RR‑V3 workflows.

**⚠️ CRITICAL**: No user story work should ship until this phase is complete.

- [x] T007 Fix tool ID/name mismatches so UI tool IDs equal MCP tool names (audit entire catalog) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/tool-groups.ts`
- [x] T008 Implement default tool-group state (observe+navigate+interact+workflow on; execute off) that only applies when stored state is unset in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/tool-groups.ts`
- [x] T009 Create per-tool allow/deny resolver (reads TOOL_GROUP_STATE + INDIVIDUAL_TOOL_STATE; unknown tools disabled-by-default; legacy alias normalization) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tool-selection/resolve.ts`
- [x] T010 Enforce resolver at the Native Messaging MCP tool boundary (CALL_TOOL) and UI bridge `{ type:'call_tool' }`, returning `isError=true` ToolResult but `status:'success'` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/native-host.ts`
- [x] T011 [P] Add contract tests that (1) UI catalog covers all exposed MCP tools and (2) resolver semantics are correct (group off disables, per-tool override disables, unknown disabled) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/tests/tool-selection.contract.test.ts`

**Checkpoint**: Runtime per-tool enforcement is active for MCP calls; RR‑V3 internal execution remains unaffected.

---

## Phase 3: User Story 1 — Chat with Memory-Grounded Answers in Sidepanel (Priority: P1) 🎯 MVP

**Goal**: Sidepanel chat works end-to-end with OpenClaw Gateway, and tool restrictions are communicated as an itemwise **disabled-tools list** (prompt layer) while runtime enforcement blocks disabled MCP tools.

**Independent Test**: Open sidepanel → Chat; type ≥3 chars to see memory suggestions (when OpenClaw `evermemos` enabled); press Enter to send via `chat.send`; toggle tools; confirm a disabled tool call returns `isError=true` with a clear “Disabled tool: <name> …” message.

- [x] T012 [P] [US1] Add helper to compute effective disabled tool IDs (from group state + per-tool overrides) for prompt injection in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/tool-groups.ts`
- [x] T013 [US1] Update chat prompt injection to list disabled tools (“Disabled tools: …”) instead of group-based phrasing in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`

**Checkpoint**: Chat sends the correct disabled-tools list prompt and runtime blocks disabled MCP tools.

---

## Phase 4: User Story 2 — Ingest AI Chat Histories into Knowledge Base (Priority: P2)

**Goal**: Ship a working **ChatGPT** platform pack using **script nodes + backend API** (no DOM scraping, no platform-specific scan/extract nodes) with MV3-safe RR‑V3 reliability: crash recovery, retries, and timeouts.

**Independent Test**: Verify EMOS connectivity in Options; run **ChatGPT – Import All** from Workflows tab; confirm it runs in the background (current tab irrelevant), ingests via backend APIs, posts a browser notification with a summary, and re-running causes **no duplicates** (ledger enforces idempotency). Then open a `https://chatgpt.com/c/...` tab and run **ChatGPT – Import Current Conversation**; confirm it ingests regardless of existing ledger entries and posts a summary notification.

### RR‑V3 Reliability (Crash Recovery / Retries / Timeouts)

- [x] T014 [US2] Requeue orphan `paused` runs on recovery (paused → queued + lease dropped) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/storage/queue.ts`
- [x] T015 [US2] Emit `run.recovered` for paused → queued transitions and patch run status accordingly in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/recovery/recovery-coordinator.ts`
- [x] T016 [US2] Add `requeue(runId, now, { reason })` API to the run queue interface in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/queue/queue.ts`
- [x] T017 [US2] Implement `requeue(...)` storage behavior (status → queued, drop lease, keep attempt unchanged, timestamps updated) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/storage/queue.ts`
- [x] T018 [US2] Implement run-level retries in scheduler finalization (retryable errors requeue until `maxAttempts`, else terminal) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/queue/scheduler.ts`
- [x] T019 [US2] Define `shouldRetryRun(error)` policy (retryable codes vs never-retry codes per `plan.md`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/queue/scheduler.ts`
- [x] T020 [US2] Enforce `flow.policy.runTimeoutMs` across the entire run and implement `TimeoutPolicy.scope:'node'` as total time across attempts in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/kernel/runner.ts`
- [x] T021 [P] [US2] Extend RR‑V3 tests: paused→queued recovery in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/tests/record-replay-v3/recovery.test.ts`, retry requeue semantics in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/tests/record-replay-v3/scheduler.test.ts`, and run-timeout terminal failure in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/tests/record-replay-v3/runner.onError.contract.test.ts`

### ChatGPT Platform Pack (Workflow-Level Scripts + Backend API)

**Reference**: Auth and headers follow `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/_ref/chatgpt-exporter/src/api.ts` (access token via `/api/auth/session`, optional `Chatgpt-Account-Id` for Team, and `/backend-api/*` endpoints).

- [x] T022 [US2] Rewrite ChatGPT built-in flows to two script-driven workflows (**Import All** + **Import Current Conversation**) using backend APIs (no DOM scraping) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt.ts`
- [x] T023 [US2] Implement a background RPC listener for ChatGPT workflow scripts:
  - ledger group existence checks (skip already-ingested conversations efficiently)
  - conversation ingestion entrypoint (normalize → ledger → EMOS ingest)
  - browser notification on run completion
    in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt-workflow-rpc.ts`
- [x] T024 [US2] Wire the ChatGPT workflow RPC listener into background init in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/index.ts`
- [x] T025 [US2] Extend RR‑V2 `openTab` action params to support `active:false` so scheduled **Import All** runs don’t steal focus in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay/actions/handlers/tabs.ts`
- [x] T026 [US2] Remove platform-specific scan/extract node kinds from Ruminer ingest plugin registration (at minimum `ruminer.scan_conversation_list` and `ruminer.extract_messages`) to enforce workflow-level extraction in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/index.ts`
- [x] T027 [P] [US2] Add a minimal contract test for ChatGPT ingestion RPC (happy path + EMOS missing settings failure) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/tests/ruminer/chatgpt-ingest-rpc.test.ts`

**Checkpoint**: ChatGPT **Import All** and **Import Current Conversation** run end-to-end via backend APIs, are idempotent via the ledger, are schedulable in the background without stealing focus, and each run posts a browser notification summary.

---

## Phase 5: User Story 3 — Browse and Manage Knowledge Base in Sidepanel (Priority: P3)

**Goal**: Memory tab is read-only, supports search/browse/filter, and can open canonical URLs.

**Independent Test**: Open Memory tab; search/browse items (requires at least one ingested conversation); filter by platform/date; open an item and open its canonical URL.

- [ ] T032 [US3] Remove any delete/remove capability from the Memory tab data layer to match “read-only” spec (remove DELETE call + API surface) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSearch.ts`
- [ ] T033 [US3] Ensure Memory tab UI exposes only read-only actions (view details + open canonical URL) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryItemDetails.vue`

**Checkpoint**: Memory tab matches read-only contract; no delete actions exist.

---

## Phase 6: User Story 4 — Monitor and Debug Workflow Runs (Priority: P4)

**Goal**: Workflows tab shows real-time progress, stoppable runs, scheduling, and a debuggable event timeline; drift failures surface “needs repair” with artifacts.

**Independent Test**: Run an ingestion workflow; watch progress (current step + processed counts); stop within ~2s; view run history + event timeline; force an extraction drift and see repair badge + screenshot + HTML snippet.

### Engine: Artifacts + Drift/Repair Signal (FR‑029)

- [x] T034 [US4] Implement artifact capture against the run’s actual tab via CDP `Page.captureScreenshot` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/kernel/artifacts.ts`
- [x] T035 [US4] Capture drift artifacts on 3rd consecutive failure per node (bounded screenshot + bounded HTML snippet) and append `artifact.html_snippet` events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/kernel/runner.ts`
- [x] T036 [US4] Extend RR‑V3 domain to add `artifact.html_snippet` event + `RunRecordV3.repair?: { needed:true; nodeId; ts; reason:'drift_3x' }` and wire persistence/serialization in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/domain/events.ts`

### UI: Timeline / Stop / Schedule / Repair Visibility (FR‑011/012/013/024/029)

- [x] T037 [US4] Render run event timeline and computed “current step” for expanded runs (fetch via `getRunEvents`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T038 [P] [US4] Add a dedicated timeline subcomponent for run events (recommended) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/RunTimeline.vue`
- [x] T039 [US4] Add Stop controls (queued → `rr_v3.cancelQueueItem`, running/paused → `rr_v3.cancelRun`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [x] T040 [US4] Add schedule controls (enable/disable + preset cron expressions) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [x] T041 [US4] Extend workflows composable with cancel APIs + trigger create/update/enable/disable RPC wrappers in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useWorkflowsV3.ts`
- [x] T042 [US4] Surface drift/repair badge + show screenshot/HTML snippet artifacts + “open failing run” action in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`

**Checkpoint**: Workflows UI provides progress, stop, schedule, and repair visibility with actionable artifacts.

---

## Phase 7: User Story 5 — Author and Maintain Workflows with AI Assistance (Priority: P5)

**Goal**: Workflows are safe to run after tool changes (re-approval), and flow metadata supports versioning + declared tool sets without coupling to chat tool selection.

**Independent Test**: Change a flow’s declared tools; attempt to run from UI; verify a blocking modal requests re-approval; approve and run; confirm internal RR‑V3 execution is not blocked by chat tool selection.

- [x] T043 [US5] Extend `FlowV3` metadata to include `meta.versionHash` and `meta.requiredTools` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/domain/flow.ts`
- [x] T044 [US5] Compute and persist `meta.versionHash = sha256(stableJson(flow))` on save/upsert (built-in flows and RPC saves) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/bootstrap.ts`
- [x] T045 [US5] Add `ruminer.flowApprovals` store keyed by flowId and enforce tool re-approval before enqueueing runs from UI (hash tool list; diff-added tools) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useWorkflowsV3.ts`
- [x] T046 [US5] Implement UI modal that lists added tools and requires explicit approval before running a changed flow in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`

**Checkpoint**: Flow tool changes are gated by re-approval; runtime tool enforcement remains MCP-only and does not block workflows.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and quality gates for the `plan.md` acceptance matrix.

- [ ] T047 Run `quickstart.md` smoke steps and update any deltas in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/quickstart.md`
- [ ] T048 Run repo quality gates (`pnpm run lint`, `pnpm run format`, `pnpm run typecheck`, `pnpm run build`) and fix any discovered issues in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks shipping (runtime tool enforcement boundary).
- **US1–US5 (Phases 3–7)**: All depend on Foundational completion; can proceed in parallel by file boundaries.
- **Polish (Phase 8)**: Depends on whichever user stories are targeted for release (at minimum US1 + US2 + US4 for `plan.md` MVP completion).

### User Story Dependencies (Recommended)

- **US1 (P1)**: Requires Phase 2; independent of workflow engine work.
- **US2 (P2)**: Requires RR‑V3 reliability tasks; unblocks meaningful Memory data.
- **US3 (P3)**: Depends on US2 (needs ingested items for realistic validation).
- **US4 (P4)**: Depends on US2 for real runs/events and artifacts to visualize.
- **US5 (P5)**: Depends on US4 UI surface for approvals and repair workflows.

### Parallel Opportunities

- Phase 1 docs tasks T001–T006 can run in parallel.
- After Phase 2 completes:
  - US1 (prompt injection) can proceed in parallel with US2 (RR‑V3 reliability + ChatGPT pack).
  - US4 engine artifact tasks (T034–T036) can proceed in parallel with US4 UI tasks (T037–T042) after required types/events exist.

---

## Parallel Example: US2

```bash
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt.ts"
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt-workflow-rpc.ts"
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay/actions/handlers/tabs.ts"
```

---

## Implementation Strategy

### MVP First (per `plan.md`)

1. Phase 1 (docs alignment) → Phase 2 (runtime per-tool enforcement)
2. US1 (prompt disabled-tools list) + US2 (RR‑V3 reliability + ChatGPT pack)
3. US4 (Workflows UI visibility + stop + schedule + repair artifacts)
4. Phase 8 (quickstart + quality gates)

### Incremental Delivery

- Ship Phase 2 + US1 first to harden safety boundaries for OpenClaw MCP usage.
- Add US2 to deliver the core “history collector” pipeline (idempotent ingestion).
- Add US4 to make workflows trustworthy and debuggable for real-world drift.
