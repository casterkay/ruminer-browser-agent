# Tasks: Ruminer Browser Agent

**Input**: Design documents from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Tests**: Not generating automated test tasks (spec mandates independent test scenarios, but does not require TDD/automated tests).
**Organization**: Tasks are grouped by user story for independent implementation and validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure repo surfaces + extension UI copy align to Ruminer/OpenClaw (native-server/native-host is core; OpenClaw uses plugins).

- [x] T001 Update extension branding strings in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/wxt.config.ts` (name, description, titles) for "Ruminer"
- [ ] T002 [P] Update welcome page copy to include native-host/native-server setup guidance in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/welcome/App.vue`
- [ ] T003 [P] Update popup copy to explain MCP server URL + status in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/popup/App.vue`
- [x] T004 [P] Update locales for rebrand ("Chrome MCP Server" → "Ruminer") in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/en/messages.json`
- [x] T005 [P] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/zh_CN/messages.json`
- [x] T006 [P] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/ko/messages.json`
- [x] T007 [P] Update locales for rebrand in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/_locales/de/messages.json`
- [x] T008 Add OpenClaw plugin install guidance to `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/README.md` (point to `app/openclaw-extensions/evermemos` + `mcp-client`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core plumbing required before any user story can be completed.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### A) Settings + persistence primitives

- [x] T009 Add storage keys/types for Gateway + EMOS + tool groups in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/common/constants.ts`
- [x] T010 [P] Add typed settings accessors in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/` (new file: `openclaw-settings.ts`)
- [x] T011 [P] [FR-006] Add typed tool-group state helpers in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/shared/utils/` (new file: `tool-groups.ts`)

### B) OpenClaw integration: sidepanel Gateway WS operator client

- [x] T012 Implement sidepanel Gateway WS operator client (connect + events) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts`
- [x] T013 Implement sidepanel chat (`chat.history`, `chat.send`, `chat.abort`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`

### C) OpenClaw integration: expose tools via `mcp-client`

- [x] T014 Ensure `app/openclaw-extensions/mcp-client` forwards tool calls to Ruminer MCP server (`http://127.0.0.1:12306/mcp`) and registers `TOOL_SCHEMAS`.

### D) Keep native-host/native-server plumbing intact

- [ ] T022 Ensure native host listener remains enabled and wired via `initNativeHostListener()` in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/index.ts`, preserving existing native-host/native-server behavior alongside OpenClaw.
- [ ] T023 Ensure sidepanel and popup read native-host server status (online/offline + port) from the existing background/native-host plumbing and surface it in their UIs, so users can see native-server connectivity alongside OpenClaw status.
- [ ] T024 Keep existing `/agent/...` HTTP + SSE chat surfaces fully supported in parallel with the OpenClaw chat UI, and update routing/docs so OpenClaw is the default experience while `/agent/...` remains a backwards-compatible option.

### F) Background: Extension direct EMOS client + ingestion ledger primitives

- [x] T030 [FR-015] Implement EMOS HTTP client (POST memories, POST search, auth headers) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/emos-client.ts`
- [x] T031 [FR-017] Implement canonical item hashing (`item_key`, `content_hash`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/hash.ts`
- [x] T032 [FR-018] Implement IndexedDB ledger store (`ruminer.ingestion_ledger`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/ingestion-ledger.ts`
- [x] T033 [FR-020] Implement ledger rules (ingest/update/skip, cursor advance rules) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/ledger-policy.ts`

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Chat with Memory-Grounded Answers (Priority: P1) 🎯 MVP

**Goal**: Sidepanel Chat tab connects to Gateway WS, shows live memory suggestions while typing, sends messages to OpenClaw, streams tool calls inline, and supports tool-group toggles.

**Independent Test**: Open sidepanel → Chat; type ≥3 chars to see memory suggestions (when OpenClaw `evermemos` enabled); press Enter to send via `chat.send`; see streaming responses and tool cards; toggle tool groups and verify blocked actions fail with "disabled by tool group".

### Implementation (US1)

- [x] T034 [US1] [FR-014] Add OpenClaw Gateway settings UI (WS URL + token + test) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [x] T035 [US1] [FR-007] Move tool group toggles UI into the chat header specifically in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`
- [x] T036 [US1] [FR-014] Implement sidepanel Gateway WS operator client (connect + subscribe to events) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawGateway.ts`
- [x] T037 [US1] [FR-003] Implement `chat.history("main")` hydration in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [x] T038 [US1] [FR-003] Implement `chat.send` with idempotencyKey + attachment plumbing in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [x] T039 [US1] [FR-013] Implement `chat.abort` (stop) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [x] T040 [US1] [FR-007] Implement prompt-layer tool-group restriction injection (disabled groups summary) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useOpenClawChat.ts`
- [x] T041 [US1] [FR-002] Implement memory suggestions calling `evermemos.searchMemory` (debounced) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSuggestions.ts`
- [x] T042 [US1] [FR-005] Add "New chat" UI action (reset to empty/search mode) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`
- [x] T043 [US1] [FR-003] Render inline tool call cards from Gateway `agent` events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent-chat/timeline/TimelineToolCallStep.vue`
- [x] T044 [US1] [FR-003] Render tool results/status updates from Gateway events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent-chat/timeline/TimelineToolResultCardStep.vue`
- [x] T045 [US1] [FR-001] Replace sidepanel navigation tabs to "Chat / Memory / Workflows" in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/SidepanelNavigator.vue`
- [x] T046 [US1] [FR-034] Ensure graceful degradation when Gateway disconnected (clear banner + disabled send) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/agent/ConnectionStatus.vue`
- [ ] T047A [US1] [FR-004] Verify chat messages are auto-ingested into EMOS via OpenClaw's `evermemos` plugin (smoke test: send message in sidepanel chat, confirm it appears in EMOS search)

---

## Phase 4: User Story 2 — Ingest AI Chat Histories (Priority: P2)

**Goal**: Run a ChatGPT ingestion workflow end-to-end via RR‑V3 autonomously (extension → EMOS direct), idempotent via ledger + `message_id=item_key`, resumable via cursors, stoppable, and schedulable.

**Independent Test**: Configure EMOS in Options; open Workflows tab; run ChatGPT ingestion; verify items appear in EMOS; re-run with zero duplicates; simulate SW restart and confirm resume; cancel run and confirm cursor preserved.

### Implementation (US2)

- [x] T047 [US2] [FR-015] Add EMOS settings UI (base URL + api key + tenant/space + test) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [x] T048 [US2] [FR-033] Disable Workflows tab actions when EMOS not configured (clear CTA) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [x] T049 [US2] [FR-019] Implement Ruminer RR‑V3 node plugin registry for ingestion nodes in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/index.ts`
- [x] T050 [US2] [FR-022] Implement generic `ruminer.extract_list` node (executes workflow-defined JS to extract list + cursor) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/extract-list.ts`
- [x] T051 [US2] [FR-016] Implement generic `ruminer.extract_messages` node (executes workflow-defined JS → Standard EMOS Message JSON) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/extract-messages.ts`
- [x] T052 [US2] [FR-017] Implement `ruminer.normalize_and_hash` node (validate required fields, compute keys) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/normalize-and-hash.ts`
- [x] T053 [US2] [FR-018] Implement `ruminer.ledger_upsert` node (ledger check + update) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`
- [x] T054 [US2] [FR-019] Implement `ruminer.emos_ingest` node (EMOS upsert; retry/backoff; failure semantics) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-ingest.ts`
- [x] T055 [US2] [FR-023] Implement auth detection + immediate fail with notification (no waiting state) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/auth-check.ts`
- [x] T056 [US2] [FR-022] Enforce bounded batches + continuation enqueue (20–50 conversations) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/batching.ts`
- [ ] T056A [US2] [FR-020a] Implement run queue concurrency limiter (max parallel tabs, default 3) for conversation ingestion workflows in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/run-queue.ts`
- [ ] T057 [US2] [FR-022] Add "ChatGPT ingestion" built-in FlowV3 definition (with JS extractors) + publish into RR‑V3 flow store in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/builtin-flows/chatgpt.ts`
- [ ] T057A [US2] [FR-025] Implement workflow tool-set enforcement: validate declared tools in FlowV3 at execution time and reject tool calls not in the flow's declared set, independent of chat panel tool groups, in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/tool-set-enforcer.ts`
- [ ] T057B [US2] [FR-026] Implement configurable randomized delays between page loads and interactions in ingestion nodes (per-flow delay policy with min/max range) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/rate-limiter.ts`
- [ ] T058 [US2] [FR-012] Surface run progress (items processed, current step, errors) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T059 [US2] [FR-013] Add stop/cancel control wired to RR‑V3 cancel route in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T060 [US2] [FR-024] Add schedule controls (cron enable/disable + period) to workflow list UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T061 [US2] [FR-024] Wire schedule UI to RR‑V3 trigger store (create/update/enable/disable) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useWorkflowsV3.ts`
- [ ] T062 [US2] [FR-027] Add optional conversation filters UI (date range / length) before run in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue` — **Note**: When filter parameters change, the stored conversation order list (`$scan.{id}.conversation_order`) MUST be cleared to force a full re-scan (FR-027).

---

## Phase 5: User Story 3 — Browse and Manage Knowledge Base (Priority: P3)

**Goal**: Sidepanel Memory tab can browse/search EMOS items with filters, view details, and open canonical URLs. Memory tab is read-only (EMOS does not expose a delete API).

**Independent Test**: Ingest at least one conversation; open Memory tab; search by keyword; filter by platform; open an item; verify its full content and open canonical URL in a new tab.

### Implementation (US3)

- [x] T063 [US3] [FR-010] Create Memory tab UI scaffold in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryView.vue`
- [x] T064 [US3] [FR-010] Implement Memory tab data fetching via extension direct EMOS search in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/composables/useEmosSearch.ts`
- [x] T065 [US3] [FR-010] Implement filters (platform/date range) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryFilters.vue`
- [x] T066 [US3] [FR-010] Implement item detail view + open canonical URL in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/memory/MemoryItemDetails.vue`

---

## Phase 6: User Story 4 — Monitor and Debug Workflow Runs (Priority: P4)

**Goal**: Workflows tab lists workflows with last-run status, shows run history, and provides RR‑V3 event timeline for debugging; stop preserves cursor.

**Independent Test**: Run a workflow; observe live progress; open run history; inspect timeline; cancel and confirm cursor preserved; re-run resumes correctly.

### Implementation (US4)

- [ ] T069 [US4] [FR-011] Add "last run status + timestamp" to workflow list UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`
- [ ] T070 [US4] [FR-012] Implement run history list (per-flow) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/RunHistoryPanel.vue`
- [ ] T071 [US4] [FR-012] Implement event timeline viewer wired to RR‑V3 events store in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/rr-v3/DebuggerPanel.vue`
- [ ] T072 [US4] [FR-013] Ensure cancel/stop uses RR‑V3 API and does not advance cursor after failure in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`
- [ ] T072A [US4] [FR-032] Display flow version hash on each run in Workflows tab; detect tool-set expansion on flow mutation and prompt user for re-approval before execution in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowListItem.vue`

---

## Phase 7: User Story 5 — Author and Maintain Workflows (Priority: P5)

**Goal**: Expose RR‑V3 flow/trigger/run management via MCP tools on the native server so OpenClaw can author/repair workflows; add drift repair artifacts (screenshot + bounded HTML snippet) and "open failing run".

**Independent Test**: From an OpenClaw client, call flow CRUD methods via `browser-ext`; create/update a flow; run it; force an extraction failure; confirm "needs repair" appears with artifacts and can open the failing run context.

### Implementation (US5)

- [ ] T073 [US5] [FR-028] Implement MCP tools for RR‑V3 flow CRUD in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/rr-v3/flow.ts`
- [ ] T074 [US5] [FR-028] Implement MCP tools for RR‑V3 trigger CRUD in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/rr-v3/trigger.ts`
- [ ] T075 [US5] [FR-028] Implement MCP tools for RR‑V3 run ops + events in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/rr-v3/run.ts`
- [ ] T076 [US5] [FR-028] Implement `browser-ext` plugin action → `browser.request` mapping table in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/openclaw-extensions/browser-ext/index.ts`
- [ ] T077 [US5] [FR-029] Implement drift detection counter (repeated extraction failures) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/drift.ts`
- [ ] T078 [US5] [FR-029] Capture bounded screenshot on failure using existing browser screenshot tools from `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/tools/browser/screenshot.ts`
- [ ] T079 [US5] [FR-029] Capture bounded HTML snippet on failure (sanitized/truncated) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/drift.ts`
- [ ] T080 [US5] [FR-029] Surface "needs repair" notification in Workflows UI in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
- [ ] T081 [US5] [FR-029] Implement "open failing run" action (deep-link to run + artifacts) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/workflows/RunHistoryPanel.vue`

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Ensure quality gates, security constraints, modular degradation, accessibility, and docs.

**Note**: Quality gates (`pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build`) should be run after each phase, not only at the end. T086 is a final verification.

- [x] T082 [P] [FR-014] Implement OpenClaw Gateway connection validation in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/App.vue`
- [x] T083 [P] [FR-031] Ensure host permissions support automation on any URL (e.g. `<all_urls>`) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/wxt.config.ts`
- [x] T084 Ensure modular degradation states are clear (no Gateway → chat disabled; no EMOS → workflows disabled) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/App.vue`
- [ ] T084A [Constitution IV] Ensure keyboard navigation and ARIA attributes for all interactive sidepanel/options UI elements (tab panels, buttons, toggles, inputs, modals) across `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/` and `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/options/`
- [ ] T085 Run quickstart smoke steps and update `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/specs/001-ruminer-browser-agent/quickstart.md` with any deltas discovered
- [ ] T085A [FR-035] Implement IndexedDB debug log store with auto-rotation (last 1000 entries) and sensitive field redaction (auth tokens, API keys) in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/background/ruminer/debug-log.ts`
- [ ] T085B [FR-035] Implement debug panel UI to view the structured debug log in `/Users/tcai/Projects/Ruminer/ruminer-browser-agent/app/chrome-extension/entrypoints/sidepanel/components/debug/DebugLogPanel.vue`
- [ ] T085C [Constitution V] Audit and establish TailwindCSS design tokens; verify visual consistency across sidepanel, options, and popup surfaces
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
- **US3 (P3)**: can start after Phase 2; depends on EMOS client (search).
- **US4 (P4)**: builds on US2 runtime artifacts (runs/events) and UI scaffolding.
- **US5 (P5)**: depends on RR‑V3 MCP tools + `browser-ext` plugin mappings.

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
