# Tasks: Ruminer Browser Agent

**Input**: Design documents from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/`  
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md  
**Tests**: Not generating automated test tasks (spec mandates independent test scenarios, but does not require TDD/automated tests).  
**Organization**: Tasks are grouped by user story for independent implementation and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure repo surfaces + extension UI copy align to Ruminer/OpenClaw (remove native-host/MCP onboarding assumptions).

- [ ] T001 Update extension branding strings in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/wxt.config.ts` (name, description, titles) for “Ruminer”
- [ ] T002 [P] [FR-013] Update welcome page copy to remove native-host install instructions in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/welcome/App.vue`
- [ ] T003 [P] [FR-013] Update popup copy to remove MCP server URL instructions in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/popup/App.vue`
- [ ] T004 [P] [FR-013] Update locales for rebrand (“Chrome MCP Server” → “Ruminer”) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/en/messages.json`
- [ ] T005 [P] [FR-013] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/zh_CN/messages.json`
- [ ] T006 [P] [FR-013] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/ko/messages.json`
- [ ] T007 [P] [FR-013] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/de/messages.json`
- [ ] T008 Add OpenClaw plugin install guidance to `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/README.md` (point to `app/openclaw-extensions/evermemos` + `browser-ext`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core plumbing required before any user story can be completed.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### A) Settings + persistence primitives

- [ ] T009 Add storage keys/types for Gateway + EMOS + tool groups in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/common/constants.ts`
- [ ] T010 [P] [FR-013] Add typed settings accessors in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/` (new file: `openclaw-settings.ts`)
- [ ] T011 [P] [FR-013] Add typed tool-group state helpers in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/` (new file: `tool-groups.ts`)

### B) Background: OpenClaw Gateway WS client (node role)

- [ ] T012 Create Gateway WS protocol types (req/res/evt frames) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/protocol.ts`
- [ ] T013 Create resilient WS connection manager (connect/hello-ok/reconnect/backoff) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/connection.ts`
- [ ] T014 Implement node handshake (`role:"node"`, `caps:["browser"]`, auth token, device id) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/node-client.ts`
- [ ] T015 Implement event fanout (broadcast Gateway connection status to UI) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/common/message-types.ts`
- [ ] T016 Wire background startup to initialize Gateway node client in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/index.ts`

### C) Background: `browser.proxy` dispatcher skeleton + tool-group runtime gate

- [ ] T017 Implement tool-group runtime gate (route → group mapping; reject disabled) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/tool-group-gate.ts`
- [ ] T018 Implement `browser.proxy` request router (`{method,path,query,body}`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts`
- [ ] T019 Map minimal Observe/Navigate/Interact/Execute routes to existing tool implementations under `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/browser/` from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts`
- [ ] T020 Handle `node.invoke` → `browser.proxy` dispatch + response framing in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/node-invoke-handler.ts`
- [ ] T021 Ensure dispatcher returns clear `tool_group_disabled` errors per `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/contracts/tool-groups.md` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts`

### D) Remove native-host/MCP server assumptions (core cleanup)

- [ ] T022 Disable native host listener boot in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/index.ts` (stop calling `initNativeHostListener()`; keep code temporarily but no longer used)
- [ ] T023 [P] [FR-013] Gate/remove native host auto-connect pings from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/main.ts`
- [ ] T024 [P] [FR-013] Gate/remove native host auto-connect pings from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/popup/main.ts`
- [ ] T025 Deprecate UI connection model based on `/agent/...` HTTP + SSE by replacing `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useAgentServer.ts` with a Gateway WS transport (keep file but route to new implementation to avoid widespread imports)
- [ ] T026 Deprecate `/agent/chat/.../act` HTTP posting by replacing `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useAgentChat.ts` with a Gateway WS transport

### E) OpenClaw plugin: `browser-ext` (repo module)

- [ ] T027 Create OpenClaw plugin manifest in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/openclaw-extensions/browser-ext/openclaw.plugin.json`
- [ ] T028 Implement plugin entrypoint registering one tool that maps actions → `browser.request` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/openclaw-extensions/browser-ext/index.ts`
- [ ] T029 Add plugin TypeScript config in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/openclaw-extensions/browser-ext/tsconfig.json`

### F) Background: Extension direct EMOS client + ingestion ledger primitives

- [ ] T030 Implement EMOS HTTP client (POST memories, POST search, auth headers) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/emos-client.ts`
- [ ] T031 Implement canonical item hashing (`item_key`, `content_hash`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/hash.ts`
- [ ] T032 Implement IndexedDB ledger store (`ruminer.ingestion_ledger`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/ingestion-ledger.ts`
- [ ] T033 Implement ledger rules (ingest/update/skip, cursor advance rules) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/ledger-policy.ts`

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Chat with Memory-Grounded Answers (Priority: P1) 🎯 MVP

**Goal**: Sidepanel Chat tab connects to Gateway WS, shows live memory suggestions while typing, sends messages to OpenClaw, streams tool calls inline, and supports tool-group toggles.

**Independent Test**: Open sidepanel → Chat; type ≥3 chars to see memory suggestions (when OpenClaw `evermemos` enabled); press Enter to send via `chat.send`; see streaming responses and tool cards; toggle tool groups and verify blocked actions fail with “disabled by tool group”.

### Implementation (US1)

- [ ] T034 [US1] [FR-013] Add OpenClaw Gateway settings UI (WS URL + token + test) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [ ] T035 [US1] [FR-027] Move tool group toggles UI into the chat header specifically in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`
- [ ] T036 [US1] [FR-013] Implement sidepanel Gateway WS operator client (connect + subscribe to events) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts`
- [ ] T037 [US1] [FR-013] Implement `chat.history("main")` hydration in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [ ] T038 [US1] [FR-013] Implement `chat.send` with idempotencyKey + attachment plumbing in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [ ] T039 [US1] [FR-013] Implement `chat.abort` (stop) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [ ] T040 [US1] [FR-013] Implement prompt-layer tool-group restriction injection (disabled groups summary) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [ ] T041 [US1] [FR-013] Implement memory suggestions calling `evermemos.searchMemory` (debounced) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSuggestions.ts`
- [ ] T042 [US1] [FR-013] Add “New chat” UI action (reset to empty/search mode) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`
- [ ] T043 [US1] [FR-013] Render inline tool call cards from Gateway `agent` events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent-chat/timeline/TimelineToolCallStep.vue`
- [ ] T044 [US1] [FR-013] Render tool results/status updates from Gateway events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent-chat/timeline/TimelineToolResultCardStep.vue`
- [ ] T045 [US1] [FR-013] Replace sidepanel navigation tabs to “Chat / Memory / Workflows” in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/SidepanelNavigator.vue`
- [ ] T046 [US1] [FR-013] Ensure graceful degradation when Gateway disconnected (clear banner + disabled send) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent/ConnectionStatus.vue`

---

## Phase 4: User Story 2 — Ingest AI Chat Histories (Priority: P2)

**Goal**: Run a ChatGPT ingestion workflow end-to-end via RR‑V3 autonomously (extension → EMOS direct), idempotent via ledger + `message_id=item_key`, resumable via cursors, stoppable, and schedulable.

**Independent Test**: Configure EMOS in Options; open Workflows tab; run ChatGPT ingestion; verify items appear in EMOS; re-run with zero duplicates; simulate SW restart and confirm resume; cancel run and confirm cursor preserved.

### Implementation (US2)

- [ ] T047 [US2] [FR-013] Add EMOS settings UI (base URL + api key + tenant/space + test) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [ ] T048 [US2] [FR-013] Disable Workflows tab actions when EMOS not configured (clear CTA) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T049 [US2] [FR-013] Implement Ruminer RR‑V3 node plugin registry for ingestion nodes in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/index.ts`
- [ ] T050 [US2] [FR-022] Implement generic `ruminer.extract_list` node (executes workflow-defined JS to extract list + cursor) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/extract-list.ts`
- [ ] T051 [US2] [FR-016] Implement generic `ruminer.extract_messages` node (executes workflow-defined JS → Standard EMOS Message JSON) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/extract-messages.ts`
- [ ] T052 [US2] [FR-013] Implement `ruminer.normalize_and_hash` node (validate required fields, compute keys) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/normalize-and-hash.ts`
- [ ] T053 [US2] [FR-013] Implement `ruminer.ledger_upsert` node (ledger check + update) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`
- [ ] T054 [US2] [FR-013] Implement `ruminer.emos_ingest` node (EMOS upsert; retry/backoff; failure semantics) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-ingest.ts`
- [ ] T055 [US2] [FR-023] Implement generic auth detection + “waiting for user login” run status node in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/auth-check.ts`
- [ ] T056 [US2] [FR-022] Enforce bounded batches + continuation enqueue (20–50 conversations) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/batching.ts`
- [ ] T057 [US2] [FR-022] Add “ChatGPT ingestion” built-in FlowV3 definition (with JS extractors) + publish into RR‑V3 flow store in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/builtin-flows/chatgpt.ts`
- [ ] T058 [US2] [FR-013] Surface run progress (items processed, current step, errors) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T059 [US2] [FR-013] Add stop/cancel control wired to RR‑V3 cancel route in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T060 [US2] [FR-013] Add schedule controls (cron enable/disable + period) to workflow list UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T061 [US2] [FR-013] Wire schedule UI to RR‑V3 trigger store (create/update/enable/disable) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useWorkflowsV3.ts`
- [ ] T062 [US2] [FR-013] Add optional conversation filters UI (date range / length) before run in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`

---

## Phase 5: User Story 3 — Browse and Manage Knowledge Base (Priority: P3)

**Goal**: Sidepanel Memory tab can browse/search EMOS items with filters, view details, open canonical URLs, and delete items.

**Independent Test**: Ingest at least one conversation; open Memory tab; search by keyword; filter by platform; open an item; delete an item and confirm it disappears (and is removed from EMOS or clearly marked deleted).

### Implementation (US3)

- [ ] T063 [US3] [FR-013] Create Memory tab UI scaffold in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryView.vue`
- [ ] T064 [US3] [FR-013] Implement Memory tab data fetching via extension direct EMOS search in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSearch.ts`
- [ ] T065 [US3] [FR-013] Implement filters (platform/date range) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryFilters.vue`
- [ ] T066 [US3] [FR-013] Implement item detail view + open canonical URL in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryItemDetails.vue`
- [ ] T067 [US3] [FR-013] Determine EMOS delete API support by inspecting `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/docs/knowledge/evermemos.md` and implement delete accordingly in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/emos-client.ts`
- [ ] T068 [US3] [FR-013] Wire delete action + confirmation UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryItemDetails.vue`

---

## Phase 6: User Story 4 — Monitor and Debug Workflow Runs (Priority: P4)

**Goal**: Workflows tab lists workflows with last-run status, shows run history, and provides RR‑V3 event timeline for debugging; stop preserves cursor.

**Independent Test**: Run a workflow; observe live progress; open run history; inspect timeline; cancel and confirm cursor preserved; re-run resumes correctly.

### Implementation (US4)

- [ ] T069 [US4] [FR-013] Add “last run status + timestamp” to workflow list UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T070 [US4] [FR-013] Implement run history list (per-flow) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/RunHistoryPanel.vue`
- [ ] T071 [US4] [FR-013] Implement event timeline viewer wired to RR‑V3 events store in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/rr-v3/DebuggerPanel.vue`
- [ ] T072 [US4] [FR-013] Ensure cancel/stop uses RR‑V3 API and does not advance cursor after failure in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`

---

## Phase 7: User Story 5 — Author and Maintain Workflows (Priority: P5)

**Goal**: Expose RR‑V3 flow/trigger/run management over `browser.proxy` so OpenClaw can author/repair workflows; add drift repair artifacts (screenshot + bounded HTML snippet) and “open failing run”.

**Independent Test**: From an OpenClaw client, call flow CRUD methods via `browser-ext`; create/update a flow; run it; force an extraction failure; confirm “needs repair” appears with artifacts and can open the failing run context.

### Implementation (US5)

- [ ] T073 [US5] [FR-013] Implement `browser.proxy` routes for RR‑V3 flow CRUD in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts` (`/rr_v3/flow/*`)
- [ ] T074 [US5] [FR-013] Implement `browser.proxy` routes for RR‑V3 trigger CRUD in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts` (`/rr_v3/trigger/*`)
- [ ] T075 [US5] [FR-013] Implement `browser.proxy` routes for RR‑V3 run ops + events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/openclaw/browser-proxy-dispatcher.ts` (`/rr_v3/run/*`)
- [ ] T076 [US5] [FR-013] Implement `browser-ext` plugin action → `browser.request` mapping table in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/openclaw-extensions/browser-ext/index.ts`
- [ ] T077 [US5] [FR-013] Implement drift detection counter (repeated extraction failures) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/drift.ts`
- [ ] T078 [US5] [FR-013] Capture bounded screenshot on failure using existing browser screenshot tools from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/browser/screenshot.ts`
- [ ] T079 [US5] [FR-013] Capture bounded HTML snippet on failure (sanitized/truncated) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/drift.ts`
- [ ] T080 [US5] [FR-013] Surface “needs repair” notification in Workflows UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T081 [US5] [FR-013] Implement “open failing run” action (deep-link to run + artifacts) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/RunHistoryPanel.vue`

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Ensure quality gates, security constraints, modular degradation, and docs.

- [ ] T082 [P] [FR-014] Implement OpenClaw Gateway connection validation in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [ ] T083 [P] [FR-031] Ensure host permissions support automation on any URL (e.g. `<all_urls>`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/wxt.config.ts`
- [ ] T084 Ensure modular degradation states are clear (no Gateway → chat disabled; no EMOS → workflows disabled) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/App.vue`
- [ ] T085 Run quickstart smoke steps and update `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/quickstart.md` with any deltas discovered
- [ ] T086 Run repo quality gates: `pnpm run lint`, `pnpm run format`, `pnpm run typecheck`, `pnpm run build` (root `package.json` scripts)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: independent; can start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**.
- **US1–US5**: all depend on Foundational completion.
- **Polish (Phase 8)**: depends on whichever user stories are targeted for release (at minimum US1 + US2).

### User Story Dependencies

- **US1 (P1)**: can start after Phase 2; establishes Gateway WS + chat UI.
- **US2 (P2)**: can start after Phase 2; depends on EMOS client + ledger + RR‑V3 nodes.
- **US3 (P3)**: can start after Phase 2; depends on EMOS client (search + delete).
- **US4 (P4)**: builds on US2 runtime artifacts (runs/events) and UI scaffolding.
- **US5 (P5)**: depends on `browser.proxy` RR‑V3 routes + `browser-ext` plugin mappings.

### Parallel Opportunities

- Phase 1 tasks T002–T007 can run in parallel (different files/locales).
- Phase 2 tasks T012–T021 can be split across multiple implementers ([P] by file-level separation).
- After Phase 2 completes:
  - US1 and US2 can proceed in parallel (UI transport vs ingestion engine), as long as shared primitives stay stable.

---

## Parallel Example: US1

```bash
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts"
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts"
Task: "Implement /Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSuggestions.ts"
```

---

## Implementation Strategy

### MVP First (US1 only)

Complete Phase 1 → Phase 2 → US1 (Phase 3). Stop and validate US1 independently against its acceptance scenarios.

### Recommended MVP (US1 + US2)

After US1, implement US2 to populate EMOS (enables real memory value and validates idempotent ingestion).
