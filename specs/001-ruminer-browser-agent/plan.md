# Implementation Plan: Ruminer Browser Agent

**Branch**: `001-ruminer-browser-agent` | **Date**: 2026-02-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-ruminer-browser-agent/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Ruminer Browser Agent transforms Chrome into a browser agent with centralized AI chat history by:

1. **Sidepanel UI** with three tabs: Chat (with live EMOS memory search), Memory browser, and Workflow manager.
2. **OpenClaw Gateway integration** via localhost WebSocket — extension connects as a node (`role: "node"`, `caps: ["browser"]`) and implements a superset `browser.proxy` route dispatcher (standard routes + extension-specific routes).
3. **Tool group enforcement** at two layers in the extension: prompt layer (injected into `chat.send` to OpenClaw) and runtime layer (route dispatcher rejects disabled groups).
4. **EverMemOS (EMOS) integration** via two independent paths: (a) OpenClaw's `evermemos` plugin for sidepanel chat (memory search + auto-ingest OpenClaw chats), (b) extension's direct EMOS client for autonomous ingestion workflows.
5. **RR-V3 workflow runtime** for reliable MV3 execution (queue + leasing + crash recovery) with AI-authored ingestion workflows.
6. **AI-assisted workflow authoring**: Agent develops workflows upon user request (built-in workflows shipped for ChatGPT/Gemini/Claude/DeepSeek; users can request agent to develop more workflows).
7. **Workflow Manager**: In sidepanel Workflows tab, users configure cron schedules (enable/disable per workflow, set period) and manually trigger workflows for immediate execution.

**Technical approach**: Fork `mcp-chrome`, deprecate the MCP server/native messaging host, build Gateway WebSocket client, implement superset `browser.proxy` dispatcher, add `browser-ext` OpenClaw plugin, ship ChatGPT pack as first built-in workflow.

## Technical Context

**Language/Version**: TypeScript 5.8+, Vue 3 (Composition API), Chrome Manifest V3
**Primary Dependencies**:

- **Extension**: WXT (framework), Vue 3, TailwindCSS 4, Lucide icons
- **Runtime**: RR-V3 (Record-and-Replay V3) for workflow execution
- **Integration**: WebSocket client for OpenClaw Gateway, Fetch API for EMOS
- **Storage**: IndexedDB (via RR-V3 storage abstraction + custom `ruminer.ingestion_ledger` store), Chrome storage API (`chrome.storage.local` for settings)
  **Testing**: Vitest (extension), Jest (native server - deprecated), manual smoke testing
  **Target Platform**: Chrome 120+ (Manifest V3), sidepanel API available
  **Project Type**: Chrome MV3 extension (monorepo with 4 packages)
  **Performance Goals**:
- Live EMOS search results within 500ms of typing (90% of attempts)
- First-time setup (Gateway + EMOS connection) under 2 minutes
- Workflow stop within 2 seconds of user clicking stop/cancel
- No perceptible page load impact from extension injection
  **Constraints**:
- MV3 service worker lifecycle — no persistent background state assumption
- Scheduled triggers (cron) are best-effort, only run while browser is running
- Tool group enforcement must work without OpenClaw (runtime layer only)
- Ingestion workflows must work without OpenClaw running (direct EMOS API)
- Bounded batch processing (20-50 conversations) per workflow run with continuation runs
- DAG-only flows (no graph-level loops; pagination/scrolling as composite nodes)
- Workflows are AI-authored upon user request; built-in workflows shipped for MVP platforms
- Users configure cron schedules per workflow (opt-in, not automatic)
  **Scale/Scope**:
- 4 AI chat platforms (ChatGPT, Gemini, Claude, DeepSeek)
- Built-in ingestion workflows shipped for each platform
- Users can request agent to develop additional workflows
- Sidepanel with 3 tabs (Chat, Memory, Workflows)
- Workflows tab: list workflows, enable/disable cron per workflow, set cron period, manual trigger
- ~5 tool groups with 20-30 tools total
- IndexedDB stores: `rr_v3_flows`, `rr_v3_runs`, `rr_v3_events`, `persistent_vars`, `ruminer.ingestion_ledger`
- Monorepo: 4 packages (chrome-extension, mcp-chrome-bridge [deprecated], chrome-mcp-shared, @chrome-mcp/wasm-simd)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Design Evaluation

**Principle I (Code Quality First)**: ✅ PASS

- All new TypeScript code will compile with `strict: true`
- Functions will have single, clear responsibilities
- Public API surfaces will have full TypeScript types (discriminated unions preferred)
- Error handling will be explicit with sufficient logging context

**Principle II (Pattern Consistency)**: ✅ PASS

- Message passing will use the project's established message protocol
- State management will follow existing patterns (RR-V3 storage abstraction for IndexedDB, chrome.storage.local for settings)
- File/directory naming will follow monorepo conventions (kebab-case files, PascalCase components)
- New `browser.proxy` routes will follow existing route registration/dispatch patterns

**Principle III (Best Practices)**: ✅ PASS

- Dependencies will be added intentionally with stated reasons
- Security boundaries respected (content scripts untrusted, background SW trusted)
- MV3 lifecycle constraints respected (alarms/events for long-running operations, proper SW termination handling)
- Async operations will use async/await with proper error propagation
- Configuration/secrets will use chrome.storage.local (extension) and plugin config (OpenClaw)

**Principle IV (User Experience)**: ✅ PASS

- UI operations will provide immediate visual feedback (loading indicators for >200ms operations)
- Error states will be communicated in plain language with suggested next steps
- Workflows will be interruptible (pause, cancel, take over)
- Extension will not degrade browsing experience (no perceptible page load impact)
- Keyboard navigation and accessibility will be supported

**Principle V (Visual Aesthetics)**: ✅ PASS

- Consistent design token system (existing TailwindCSS 4 configuration)
- Purposeful animation/transitions (state changes, attention guidance)
- Responsive layout for sidepanel context
- Clear visual hierarchy (primary actions prominent, destructive actions distinct)
- Consistent icon usage (single icon set: Lucide)

**Principle VI (Engineering Standards)**: ✅ PASS

- All code will pass linting, formatting, and type checking before merge
- Commit messages will follow Conventional Commits (enforced by commitlint)
- Each package will build independently (no circular dependencies)
- Breaking changes will be documented in PR descriptions
- Build artifacts will be reproducible

### Quality Gates Verification

1. **Type Safety**: ✅ Will pass (`pnpm typecheck`)
2. **Lint**: ✅ Will pass (`pnpm lint`)
3. **Format**: ✅ Will pass (`pnpm format`)
4. **Build**: ✅ Will pass (`pnpm build`)
5. **No Regressions**: ✅ Will verify via manual smoke test
6. **PR Review**: ✅ Will follow constitution-based review standards

**Constitution Check Result**: ✅ **PASS — Proceed to Phase 0 research**

## Project Structure

### Documentation (this feature)

```text
specs/001-ruminer-browser-agent/
├── spec.md              # Feature specification (user stories, requirements, acceptance criteria)
├── plan.md              # This file (technical approach, constitution check, structure)
├── research.md          # Phase 0 output (technology decisions, best practices)
├── data-model.md        # Phase 1 output (entities, validation rules, state transitions)
├── quickstart.md        # Phase 1 output (development setup, first-run steps)
├── contracts/           # Phase 1 output (interface contracts)
│   ├── gateway-websocket.md      # OpenClaw Gateway WS protocol
│   ├── browser-proxy-routes.md   # Superset route dispatcher protocol
│   ├── emos-api.md               # EverMemOS API contract
│   ├── tool-groups.md            # Tool group enforcement contract
│   └── rr-v3-runtime.md          # RR-V3 workflow node contracts
└── tasks.md             # Phase 2 output (dependency-ordered implementation tasks)
```

### Source Code (repository root)

```text
# Monorepo structure (pnpm workspaces)
app/chrome-extension/          # Main extension package (chrome-mcp-server)
├── entrypoints/
│   ├── background/            # Service worker (main orchestrator)
│   │   ├── index.ts           # SW entry point + Gateway WS client setup
│   │   ├── gateway-client/    # Gateway WebSocket client (node connection)
│   │   ├── browser-proxy/     # Superset route dispatcher
│   │   │   ├── routes/        # Standard routes (snapshot, act, navigate, tabs)
│   │   │   └── extension/     # Extension routes (bookmarks, history, network, flows, ledger, element-selection)
│   │   ├── tool-groups/       # Tool group enforcement (prompt + runtime layers)
│   │   ├── chat/              # Sidepanel chat via Gateway WS (chat.* methods)
│   │   ├── emos-client/       # Direct EMOS API client (autonomous ingestion)
│   │   ├── ingestion/         # Ingestion workflows + ledger + normalization
│   │   │   ├── ledger/        # Local idempotency ledger (IndexedDB)
│   │   │   ├── normalization/ # Canonical raw item schema + hashing
│   │   │   └── platforms/     # Platform packs (chatgpt/, gemini/, claude/, deepseek/)
│   │   └── record-replay-v3/  # RR-V3 runtime (existing)
│   ├── sidepanel/             # Sidepanel UI (primary interface)
│   │   ├── App.vue            # Root component with 3 tabs
│   │   ├── components/
│   │   │   ├── chat-tab/      # Chat interface (search mode + chat mode)
│   │   │   ├── memory-tab/    # Memory browser (search/browse/manage)
│   │   │   └── workflows-tab/ # Workflow manager (list workflows, enable/disable cron, set period, manual trigger, monitor runs)
│   │   └── composables/
│   │       ├── useGateway.ts  # Gateway WS connection + chat.*
│   │       ├── useEMOS.ts     # EMOS client (direct API + memory search)
│   │       └── useToolGroups.ts # Tool group state + enforcement
│   ├── options/               # Options page (settings)
│   │   ├── App.vue            # Settings UI
│   │   └── components/
│   │       ├── gateway-config/ # OpenClaw Gateway connection (WS URL + token + test)
│   │       ├── emos-config/    # EMOS connection (base URL + API key + tenant/space + test)
│   │       └── tool-groups/    # Tool group default toggles
│   └── content.ts             # Content script (DOM read/write for platform packs)
├── workers/                   # Web workers (heavy computation)
└── manifest.json              # Chrome MV3 manifest

packages/shared/               # Shared TypeScript types + constants
├── src/
│   ├── types/
│   │   ├── gateway.ts         # Gateway WS protocol types
│   │   ├── browser-proxy.ts   # browser.proxy route types
│   │   ├── emos.ts            # EverMemOS API types
│   │   ├── tool-groups.ts     # Tool group definitions
│   │   ├── ingestion.ts       # Canonical raw item + ledger types
│   │   └── rr-v3.ts           # RR-V3 types (existing)
│   └── constants/
│       ├── platforms.ts       # Platform pack configurations
│       └── tool-groups.ts     # Tool group tools mapping

app/native-server/             # [DEPRECATED] Native messaging host + MCP server
# NOTE: This package is deprecated per blueprint §4.1. No changes needed.

packages/wasm-simd/            # [UNCHANGED] Rust→WebAssembly SIMD vector operations
# NOTE: No changes needed for this feature.
```

**Structure Decision**: Monorepo with 4 packages. Primary development occurs in `app/chrome-extension` (extension package) with shared types in `packages/shared`. The `app/native-server` package is deprecated per blueprint §4.1 — no changes will be made to it. `packages/wasm-simd` is unchanged.

## Complexity Tracking

> **No violations requiring justification** — all aspects align with constitutional principles and project patterns.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| N/A       | N/A        | N/A                                  |

---

## Phase 0: Outline & Research

### Research Tasks

The following unknowns from Technical Context require research:

1. **OpenClaw Gateway WebSocket Protocol**
   - Research: What is the exact Gateway WS protocol for node connection, `browser.proxy` dispatch, and `chat.*` methods?
   - Deliverable: Gateway WS protocol specification with message schemas

2. **RR-V3 Integration Patterns**
   - Research: What are the existing RR-V3 node types, storage patterns, and plugin registration mechanisms?
   - Deliverable: RR-V3 node catalog + custom node development guide

3. **EverMemOS API Contract**
   - Research: What are the EMOS API endpoints for `addMemory`, `searchMemory`, and idempotent upsert?
   - Deliverable: EMOS API contract with request/response schemas

4. **IndexedDB Schema Design**
   - Research: What is the optimal schema for `ruminer.ingestion_ledger` (indexes, sharding, migration strategy)?
   - Deliverable: IndexedDB schema with migration plan

### Research Execution

> **PHASE 0 BLOCKED** — Requires external research tasks.
>
> The above research tasks will be executed via the `/speckit.plan` workflow's research phase.
> Each task will be dispatched to research agents to gather findings, which will be consolidated in `research.md`.

**Expected Output**: `research.md` containing:

- Decision: What was chosen for each unknown
- Rationale: Why chosen
- Alternatives considered: What else was evaluated

---

## Phase 1: Design & Contracts

> **PREREQUISITE**: `research.md` must be completed before Phase 1 begins.

### Phase 1.1: Data Model

**Extract entities from feature spec** → `data-model.md`:

Entities to define:

1. **Canonical Raw Item** — Platform-agnostic message representation
2. **Ingestion Ledger Entry** — Idempotency tracking
3. **Flow** — RR-V3 workflow definition (fixed tools, rate limit policies)
4. **Trigger** — Schedule/event configuration (includes conversation filters)
5. **Run** — Execution instance
6. **Tool Group** — Capability boundary
7. **Cursor/Checkpoint** — Persistent variable state
8. **EMOS Message** — EverMemOS message mapping

For each entity:

- Fields and types
- Validation rules (from requirements)
- Relationships (foreign keys, references)
- State transitions (if applicable)
- IndexedDB schema (if persisted)

### Phase 1.2: Interface Contracts

Define interface contracts → `/contracts/`:

1. **`contracts/gateway-websocket.md`**
   - Gateway WS connection protocol
   - Node registration (role, caps, auth)
   - `node.invoke` message format
   - `browser.proxy` dispatch protocol
   - `chat.*` methods (send, receive, history)
   - Reconnection strategy

2. **`contracts/browser-proxy-routes.md`**
   - Standard routes (snapshot, act, navigate, tabs, screenshot, console, dialog)
   - Extension routes (bookmarks, history, network, flows, ledger, element-selection)
   - Request/response format: `{ method, path, query, body }`
   - Route-to-tool-group mapping
   - Error responses

3. **`contracts/emos-api.md`**
   - `addMemory` endpoint (request/response, idempotent upsert)
   - `searchMemory` endpoint (query format, results)
   - Authentication (API key header)
   - Error handling
   - Retry strategy

4. **`contracts/tool-groups.md`**
   - Tool group definitions (Observe, Navigate, Interact, Execute, Workflow)
   - Capability list per group
   - Prompt-layer injection format
   - Runtime-layer rejection rules
   - Default states

5. **`contracts/rr-v3-runtime.md`**
   - Custom node types (ruminer.extract_conversations, ruminer.extract_messages, ruminer.normalize_and_hash, ruminer.ledger_upsert, ruminer.emos_ingest)
   - Node input/output schemas
   - DAG validation rules
   - Persistent variable schema (cursors)
   - Event log format
   - Trigger types: interval, cron, url, dom, command, contextMenu, once, manual
   - Cron configuration per workflow (enable/disable, period)
   - Rate limiting and anti-bot delay policies
   - Conversation filtering parameters (date range, length)

### Phase 1.3: Quickstart Guide

Generate `quickstart.md`:

- Prerequisites (Node.js, pnpm, Chrome, OpenClaw Gateway, EverMemOS instance)
- Development setup (install, build, watch mode)
- First-time configuration (Gateway connection, EMOS connection)
- Running the extension (load unpacked, sidepanel open)
- Testing chat (send message, verify memory search)
- Testing workflow (run ChatGPT ingestion, verify Memory tab)
- Debugging tips (DevTools, logs, event timeline)

### Phase 1.4: Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh claude` to update agent-specific context file with new technologies from this plan.

---

## Phase 2: Implementation Tasks

> **NOTE**: Phase 2 is executed by the `/speckit.tasks` command, NOT by `/speckit.plan`.
>
> After Phase 1 is complete, run `/speckit.tasks` to generate `tasks.md` with dependency-ordered implementation tasks.

---

## Re-evaluation: Constitution Check (Post-Design)

> **GATE**: Must pass before Phase 2 task generation.

After Phase 1 design is complete, re-evaluate constitution check with additional considerations:

- **Data Model**: Are entity relationships and state transitions well-defined?
- **Contracts**: Are interface contracts complete with error handling?
- **Performance**: Do design choices meet performance goals (500ms search, 2s setup, 2s stop)?
- **Security**: Are security boundaries properly enforced (tool groups, content script validation)?
- **Modularity**: Does the design support independent development and testing?

**Expected Result**: ✅ **PASS — Proceed to Phase 2 task generation**

---

## Appendix: Architecture Diagrams

### System Architecture

```text
+----------------------------------------------+
| OpenClaw Gateway (ws://127.0.0.1:18789)      |
|                                               |
| ┌──────────────┐  ┌────────────────────────┐  |
| │ evermemos     │  │ browser-ext plugin      │  |
| │ plugin        │  │ - registers 1 tool:     │  |
| │ - addMemory   │  │   "browser-ext" (extra  │  |
| │ - searchMemory│  │   actions: bookmarks,   │  |
| │ - auto-ingest │  │   history, network,     │  |
| │   OC convos   │  │   flows, ledger,        │  |
| └──────────────┘  │   element selection)     │  |
|                    │ - routes actions to      │  |
|                    │   extension node via     │  |
|                    │   browser.request        │  |
|                    └────────────────────────┘  |
|                                               |
| Built-in browser tool (standard automation)   |
| Agent runtime (calls registered tools)        |
|                                               |
| Connected nodes:                              |
|   Chrome Extension SW (role: "node",          |
|     caps: ["browser"])                        |
+-------------------+---------------------------+
                    |
                    | Gateway WebSocket
                    |
+-------------------v----------------------------------------------+
| Chrome Extension (Manifest V3)                                   |
| - UI: sidepanel (chat + memory + workflows) / options            |
| - Background SW:                                                 |
|   - Gateway WS client (role: "node", caps: ["browser"])          |
|   - browser.proxy handler (superset dispatcher):                 |
|     - Standard routes: /snapshot, /act, /navigate, /tabs, ...    |
|     - Extension routes: /bookmarks/*, /history, /network/*,      |
|       /flow/*, /ledger/*, /element-selection                     |
|   - Tool group enforcement (prompt + runtime layers)             |
|   - Sidepanel chat via chat.* methods                            |
|   - RR-V3 runtime + Ruminer services                             |
|   - EMOS client (direct API for autonomous ingestion)            |
| - Content scripts: DOM read/write + record/observe               |
| - Offscreen doc (optional): heavy compute / parsing              |
+------------------------------------------------------------------+
          |
          | Direct EMOS API (for autonomous ingestion)
          v
+-------------------+
| EverMemOS         |
+-------------------+
```

### Data Flow: Sidepanel Chat

```text
User types in sidepanel
    ↓
Debounced EMOS search (via OpenClaw → EMOS plugin)
    ↓
User presses Enter
    ↓
Extension sends chat.send to Gateway (with tool group prompt injection)
    ↓
Gateway routes to agent
    ↓
Agent uses built-in browser tool + browser-ext tool
    ↓
Gateway sends browser.request to extension node
    ↓
Extension dispatcher handles browser.proxy routes
    ↓
Extension returns results to Gateway
    ↓
Agent responds, Gateway sends chat.message to extension
    ↓
Extension displays response in sidepanel
    ↓
OpenClaw EMOS plugin auto-ingests conversation
```

### Data Flow: Autonomous Ingestion Workflow

```text
[Workflow Development - AI-authored]
User requests agent to develop/modify workflow
    ↓
Agent uses browser tools to explore platform DOM
    ↓
Agent records actions → converts to RR-V3 flow
    ↓
Agent generalizes flow (stable selectors, parameters, extraction schemas)
    ↓
User tests flow, agent iterates until stable
    ↓
Flow saved as to workflow manager

[Scheduled Execution - cron-enabled]
User enables cron for workflow in Workflows tab (sets period)
    ↓
RR-V3 trigger enqueues flow run on schedule
    ↓
[Same execution as manual trigger below]

[Manual Execution - user-triggered]
User clicks "Run" in Workflows tab
    ↓
RR-V3 enqueues flow run
    ↓
Run executes: ruminer.extract_conversations
    ↓
Navigate to platform, extract conversation list
    ↓
Run executes: ruminer.extract_messages (per conversation)
    ↓
Open conversation, extract messages as canonical raw items
    ↓
Run executes: ruminer.normalize_and_hash
    ↓
Compute item_key, content_hash for each message
    ↓
Run executes: ruminer.ledger_upsert
    ↓
Check local IndexedDB ledger for duplicates
    ↓
Run executes: ruminer.emos_ingest (for new/changed items)
    ↓
Extension EMOS client calls EMOS API directly
    ↓
Update cursor (persistent vars) after each processed item
    ↓
If more conversations remain, enqueue continuation run
```

### Tool Group Enforcement Layers

```text
Layer 1: Prompt Layer (extension → OpenClaw)
┌─────────────────────────────────────────────┐
│ When extension sends chat.send to Gateway:   │
│   Prepend system instruction:                │
│   "DISABLED TOOLS: Interact, Execute"        │
│   (lists disabled tool groups)               │
└─────────────────────────────────────────────┘
                    ↓
Layer 2: Runtime Layer (extension route dispatcher)
┌─────────────────────────────────────────────┐
│ When extension receives browser.proxy:       │
│   Check route's tool group mapping           │
│   If route in disabled group → reject error  │
│   Otherwise → dispatch to handler            │
└─────────────────────────────────────────────┘
```

---

**End of Implementation Plan**
