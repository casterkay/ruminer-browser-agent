# Feature Specification: Ruminer Browser Agent

**Feature Branch**: `001-ruminer-browser-agent`
**Created**: 2026-02-25
**Updated**: 2026-02-26
**Status**: Draft
**Input**: Blueprint v0.6 — Transform Chrome MCP Server into a unified AI
chat history collector that integrates conversations from ChatGPT,
Gemini, Claude, and DeepSeek into EverMemOS. Sidepanel-only UI with
chat, memory browser, and workflow manager. Chrome MCP is the only MCP
connection; EMOS is integrated into OpenClaw via its plugin system.

## Clarifications

### Session 2026-02-25

- Q: Which platform(s) ship as the first MVP packs? → A: ChatGPT
  conversations as the first platform, followed by Gemini, Claude, and
  DeepSeek. Only AI chat platforms — no social media.
- Q: How should the system behave without EverMemOS? → A: Sidepanel
  chat functions as a plain chat interface with OpenClaw (no memory
  search). Ingestion workflows require EMOS and are disabled without
  it. System is modular — components degrade gracefully.
- Q: What is the separation of concerns between OpenClaw, Chrome MCP,
  and EMOS? → A: OpenClaw is the LLM orchestrator connecting to Chrome
  MCP (browser automation, the only MCP connection) with EMOS
  integrated as a built-in OpenClaw plugin (not MCP). The EMOS plugin
  auto-ingests OpenClaw conversations and exposes addMemory/searchMemory
  as gateway methods. The extension does NOT call EMOS directly.

### Session 2026-02-26

- Q: What happened to the FAB (floating action button)? → A: Removed.
  Sidepanel is the only UI surface. No content script injection for
  in-page overlay.
- Q: What happened to watch workflows and digests? → A: Removed from
  scope. Future features only.
- Q: What about X/Twitter and social media ingestion? → A: Removed
  from scope. Only AI chat platforms (ChatGPT, Gemini, Claude,
  DeepSeek) for MVP.
- Q: How does "agent mode" vs "readonly mode" work? → A: Replaced by
  tool groups. MCP tools are divided into five groups by side-effect
  level (Observe, Navigate, Interact, Execute, Workflow). Users toggle
  groups on/off from the sidepanel. No binary mode switch.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Chat with Memory-Grounded Answers in Sidepanel (Priority: P1)

A user wants to ask a question or look something up with the help of
their personal knowledge base. They click the Ruminer extension button
to open the sidepanel. The Chat tab shows a text input at the bottom.
As they type, live EMOS memory search results appear in the panel
(retrieved via OpenClaw's EMOS plugin `searchMemory`), showing source,
timestamp, and content snippet. The user presses Enter to submit their
prompt to OpenClaw, which transitions the panel to chat mode showing
the conversation thread with inline tool call results. If EMOS is not
configured, the chat still works as a plain interface with OpenClaw —
no memory search results. Tool group toggles in the chat header let
the user control which browser capabilities OpenClaw can use.

**Why this priority**: The sidepanel chat is the primary daily
touchpoint and the feature that makes Ruminer more than a browser
automation tool. It turns the sidepanel into a memory-augmented
workspace.

**Independent Test**: Open the sidepanel, type a query, see memory
search results appear, press Enter, see chat messages with tool call
results inline. Toggle tool groups and verify the agent's available
tools change.

**Acceptance Scenarios**:

1. **Given** the extension is installed, **When** the user clicks the
   extension button, **Then** the sidepanel opens with the Chat tab
   active showing an empty state with a text input.

2. **Given** the Chat tab is in empty state and EMOS is configured,
   **When** the user types at least 3 characters, **Then** live EMOS
   memory search results appear in the panel within 500ms (debounced),
   updating as the user continues typing. If EMOS is not configured,
   no search results appear but the input functions normally.

3. **Given** the user has typed a query, **When** they press Enter,
   **Then** the message is sent to OpenClaw, the panel transitions to
   chat mode showing the conversation thread, and subsequent messages
   continue in chat mode.

4. **Given** the user is in chat mode, **When** tool calls are made by
   the agent, **Then** tool call results appear inline as expandable
   cards with status indicators (pending/success/error).

5. **Given** the user is in chat mode with EMOS configured, **When**
   messages are exchanged, **Then** the conversation is auto-ingested
   into EMOS via OpenClaw's EMOS plugin.

6. **Given** tool group toggles are visible in the chat header,
   **When** the user disables a tool group (e.g., Interact), **Then**
   the corresponding tools are immediately removed from the MCP tool
   registry and OpenClaw can no longer invoke them.

7. **Given** the user is in chat mode, **When** they click "New chat",
   **Then** the panel returns to empty state / search mode.

---

### User Story 2 - Ingest AI Chat Histories into Knowledge Base (Priority: P2)

A user wants to collect their AI chat conversations from platforms
(ChatGPT, Gemini, Claude, DeepSeek) into their personal knowledge base
(EverMemOS). The user opens the sidepanel Workflows tab and clicks
"Run" on a pre-built ingestion workflow for their target platform.
OpenClaw orchestrates the pipeline: using Chrome MCP tools to navigate
to the platform and extract conversations, then using its EMOS plugin
(`addMemory`) to ingest normalized messages. The extension handles
extraction, normalization, hashing, and local ledger bookkeeping.
OpenClaw handles EMOS ingestion. The user can see progress and stop the
workflow at any time. Re-running the same workflow is always safe — no
duplicates are created.

**Why this priority**: Ingestion is the foundational data pipeline.
Without content flowing into EverMemOS, the memory-grounded chat
(Story 1 search suggestions) has no data to work with. This is the
core "AI chat history collector" value proposition.

**Independent Test**: Verify OpenClaw + EMOS connectivity in Options,
run the ChatGPT ingestion workflow from the sidepanel, verify items
appear in the Memory tab, re-run the workflow, and confirm no
duplicates are created.

**Acceptance Scenarios**:

1. **Given** the user opens the Options page, **When** they verify the
   OpenClaw connection and check EMOS status (read-only, configured in
   OpenClaw), **Then** the system reports connectivity status for both
   services with clear error messages and suggested next steps if
   either is unreachable.

2. **Given** OpenClaw and EMOS are connected, **When** the user opens
   the sidepanel Workflows tab and clicks "Run" on an ingestion
   workflow, **Then** the workflow begins executing with visible
   progress (current step, items processed) and the user can stop at
   any time.

3. **Given** an ingestion workflow is running, **When** it extracts
   messages from the target platform, **Then** each message is
   normalized into the canonical raw item schema (source, content_type,
   account_id, conversation_id, role, timestamp, content_text, etc.)
   and a stable idempotency key is computed from the source item ID.

4. **Given** normalized items are ready for ingestion, **When** the
   system checks the local ingestion ledger, **Then** new items (no
   matching event ID) are ingested into EverMemOS, items with changed
   content (same event ID, different content hash) are updated, and
   unchanged items are skipped.

5. **Given** a workflow run completes, **When** the user re-runs the
   same workflow, **Then** no duplicate entries are created in
   EverMemOS and the ledger accurately reflects the status of every
   item.

6. **Given** the browser's service worker restarts mid-run (MV3
   lifecycle), **When** the run is recovered, **Then** it resumes from
   the last successfully ingested checkpoint without data loss or
   duplication.

---

### User Story 3 - Browse and Manage Knowledge Base in Sidepanel (Priority: P3)

A user wants to see what content they've collected and manage their
personal knowledge base. They click the extension button to open the
sidepanel and switch to the Memory tab. The tab shows a search/browse
interface for EMOS items (messages from ChatGPT, Gemini, Claude,
DeepSeek, and OpenClaw conversations). The user can filter by source
platform, date range, or keyword. They can open any item's canonical
URL, view its full content with conversation context, or delete items.

**Why this priority**: The Memory tab provides visibility into what's
been collected and gives users confidence that the system is working.
Without it, ingestion workflows run blindly with no way to verify
results.

**Independent Test**: Open the sidepanel Memory tab, browse items
(requires at least one ingested conversation), search for items, and
perform management actions (open, delete).

**Acceptance Scenarios**:

1. **Given** the user opens the sidepanel, **When** they switch to the
   Memory tab, **Then** it displays a search/browse interface showing
   EMOS items with source platform, timestamp, and content snippet.

2. **Given** the Memory tab is open, **When** the user enters a search
   query, **Then** matching EverMemOS items are displayed with source,
   timestamp, title/snippet, and a link to the canonical URL.

3. **Given** the user filters by source platform (e.g., "ChatGPT"),
   **When** results are displayed, **Then** only items from that
   platform appear.

4. **Given** search results are displayed, **When** the user clicks an
   item, **Then** they can view its full content with conversation
   context and open the canonical URL in a new tab.

---

### User Story 4 - Monitor and Debug Workflow Runs (Priority: P4)

A user wants to understand what happened during a workflow run,
especially if something failed. They open the sidepanel Workflows tab,
which lists saved workflows with their last run status. They can view
run history and drill into the RR-V3 event timeline to see timestamps,
node statuses, and error details.

**Why this priority**: Visibility into workflow execution is essential
for trust and debugging. Without it, users have no way to diagnose
failures or verify correctness.

**Independent Test**: Run an ingestion workflow, view the run history,
and inspect the event timeline for a completed or failed run.

**Acceptance Scenarios**:

1. **Given** the sidepanel Workflows tab is open, **When** workflows
   are listed, **Then** each shows platform name/icon, last run status
   (success/failed/never run), and timestamp.

2. **Given** a workflow is listed, **When** the user clicks "Run",
   **Then** the workflow begins executing and its status updates in
   real time (items processed, current step, errors).

3. **Given** a workflow run has completed, **When** the user views the
   run history, **Then** they can see the RR-V3 event timeline with
   timestamps, node statuses, and any errors for debugging.

4. **Given** a workflow is running, **When** the user clicks "Stop",
   **Then** the run is cancelled and the cursor is preserved at the
   last successfully ingested checkpoint.

---

### User Story 5 - Author and Maintain Workflows with AI Assistance (Priority: P5)

A power user or developer wants to create new workflows for AI
platforms not yet supported, or customize existing ones. Using OpenClaw
(or another MCP-capable AI client), they start a recording session
that captures browser actions. OpenClaw then converts the recording
into a reusable workflow: replacing brittle selectors with stable
alternatives, parameterizing user handles, adding extraction schemas
and validation rules, and defining triggers and checkpoints. When a
workflow starts failing due to platform UI changes (drift), the system
surfaces the failure with a screenshot, HTML snippet, and flow contract
details, allowing OpenClaw to diagnose and patch the workflow.

**Why this priority**: AI authoring and drift repair are power-user
features that expand Ruminer's platform coverage over time.

**Independent Test**: Initiate a recording session via MCP tools,
capture a simple browser action sequence, ask the AI to convert it into
a flow, run the flow, and verify it executes the recorded actions.

**Acceptance Scenarios**:

1. **Given** an MCP-capable AI client is connected, **When** it calls
   the flow management MCP tools (list, get, save, delete), **Then**
   the tools respond with the correct flow data following existing MCP
   tool patterns.

2. **Given** the user initiates a recording session, **When** they
   perform browser actions (click, type, navigate), **Then** the
   actions are captured and stored as a raw recording that can be
   retrieved by the AI.

3. **Given** a raw recording exists, **When** the AI processes it into
   a reusable flow, **Then** the flow uses stable selectors (data-
   testid, ARIA attributes), parameterized variables, and extraction
   schemas.

4. **Given** a flow is running, **When** extraction fails repeatedly
   for a node, **Then** the system captures a bounded screenshot and
   HTML snippet, surfaces a "needs repair" notification in the
   Workflows tab with the flow contract details, and provides a
   reproducible "open failing run" action.

---

### Edge Cases

- What happens when EverMemOS is unreachable during an ingestion run?
  The system MUST retry with exponential backoff, log the failure in
  the ingestion ledger with status "failed" and the error details,
  and NOT advance the cursor past the failed item. The user sees a
  clear "connection failed" status with a "retry" action.

- What happens when a platform requires re-authentication mid-workflow?
  The system MUST pause the workflow, surface an "action required:
  please log in" notification, and wait for the user to complete
  authentication before resuming. The workflow does not fail; it enters
  a "waiting for user" state.

- What happens when the service worker restarts during a long-running
  ingestion? RR-V3 crash recovery re-queues the interrupted run, and
  the ingestion ledger + cursor ensure no items are duplicated or
  skipped upon resumption.

- What happens when the EMOS plugin is not enabled in OpenClaw? The
  sidepanel chat functions as a plain chat interface with OpenClaw —
  full chat and browser automation capability, but no memory search.
  Ingestion workflows are disabled and their "Run" buttons show a
  message directing the user to enable the EMOS plugin.

- What happens when the user has EMOS configured but no memories yet?
  The chat input functions normally but shows no memory search results.
  The system prompts the user to run their first ingestion workflow to
  populate their knowledge base.

## Requirements _(mandatory)_

### Functional Requirements

**Sidepanel Chat**

- **FR-001**: Extension button click MUST open the sidepanel with Chat,
  Memory, and Workflows tabs.
- **FR-002**: Chat tab MUST display a text input in empty state. As the
  user types (debounced, minimum 3 characters), live EMOS memory search
  results MUST appear in the panel (via OpenClaw querying EMOS). If
  EMOS is not configured, the input MUST function without search
  results.
- **FR-003**: User MUST be able to submit prompts to OpenClaw by
  pressing Enter. The panel MUST transition to chat mode showing the
  conversation thread with inline tool call results.
- **FR-004**: Chat messages (user + assistant) MUST be auto-ingested
  into EMOS via OpenClaw's EMOS plugin when EMOS is configured.
- **FR-005**: Chat tab MUST provide a "New chat" action to return to
  empty state / search mode.

**Tool Groups**

- **FR-006**: MCP browser tools MUST be divided into groups by
  side-effect level: Observe (read-only), Navigate (page/tab changes),
  Interact (DOM manipulation), Execute (code/network/file I/O),
  Workflow (record/replay).
- **FR-007**: Users MUST be able to toggle tool groups on/off from the
  sidepanel chat header. When a group is disabled, its tools MUST NOT
  be advertised to the MCP client.
- **FR-008**: Tool group defaults MUST be safe: Observe and Navigate on,
  Interact and Execute off, Workflow on.
- **FR-009**: Tool group state MUST be persisted locally and synced to
  the MCP tool registry on change.

**Sidepanel Memory & Workflows**

- **FR-010**: Memory tab MUST support searching and browsing EverMemOS
  items by keyword, source platform, and date, with the ability to
  open canonical URLs and delete items.
- **FR-011**: Workflows tab MUST list saved workflows with platform
  name, last run status, and a one-click "Run" action.
- **FR-012**: Workflows tab MUST display real-time run progress and
  provide access to the RR-V3 event timeline for debugging.
- **FR-013**: Every automated action MUST be visible to the user and
  stoppable (pause, cancel) at any point during execution.

**EverMemOS Integration**

- **FR-014**: System MUST allow configuring the OpenClaw connection in
  the Options page with a connection test. EMOS plugin status MUST be
  displayed as read-only. Both statuses MUST report clear errors with
  suggested next steps when unreachable.
- **FR-015**: EMOS credentials are managed by the OpenClaw EMOS plugin.
  The extension MUST NOT store or transmit EMOS secrets.
- **FR-016**: System MUST normalize extracted chat messages into the
  canonical raw item schema (source, content_type, account_id,
  conversation_id, role, timestamp, content_text, model_id,
  parent_message_id, etc.).
- **FR-017**: System MUST compute stable idempotency keys using
  source + account_id + source_item_id (preferred) or normalized
  canonical_url (fallback), and derive event_id and content_hash via
  hashing.
- **FR-018**: System MUST maintain a local ingestion ledger keyed by
  event_id that tracks ingestion status, content hashes, and timestamps
  to prevent duplicate ingestion.
- **FR-019**: The extension MUST expose normalized canonical raw items
  via Chrome MCP tools so that OpenClaw can map them to EverMemOS
  messages using the identity conventions (sender = "me" for user
  messages, sender = "{platform}:{model_id}" for AI replies,
  group_id = "{platform}:{conversation_id}") and ingest via its
  EMOS plugin (`addMemory`). The extension does NOT call EMOS directly.

**Workflow Execution**

- **FR-020**: Ingestion workflows MUST be idempotent: re-runs MUST NOT
  create duplicate entries. New items are ingested, changed items are
  updated, unchanged items are skipped.
- **FR-021**: Ingestion workflows MUST process items in bounded,
  resumable batches and enqueue continuation runs when more items
  remain, rather than looping within a single service worker activation.
- **FR-022**: All four MVP platform packs (ChatGPT, Gemini, Claude,
  DeepSeek) MUST follow the same workflow pattern: conversation list ->
  conversation thread -> messages.
- **FR-023**: Workflows MUST detect authentication state and pause with
  an "action required: please log in" notification if the user is not
  authenticated on the target platform.

**AI Authoring & Drift Repair**

- **FR-024**: System MUST expose RR-V3 management as MCP tools
  (flow/trigger/run CRUD) so external AI clients can author and operate
  workflows programmatically.
- **FR-025**: When extraction fails repeatedly, system MUST capture a
  bounded screenshot and HTML snippet, surface a "needs repair"
  notification with flow contract details, and provide a reproducible
  "open failing run" action for AI-assisted diagnosis.

**Security & Privacy**

- **FR-026**: MCP server MUST bind to localhost only. Tool group
  toggles MUST enforce which tools are available to the MCP client.
- **FR-027**: Host permissions MUST be limited to AI chat platform
  domains (ChatGPT, Gemini, Claude, DeepSeek). No `<all_urls>` needed.
- **FR-028**: Flow version/hash MUST be displayed for every run.
  Silent mutation of a flow MUST NOT bypass capability re-approval.

**Modular Degradation**

- **FR-029**: Without the EMOS plugin enabled in OpenClaw, the
  sidepanel chat MUST function as a plain chat interface (no memory
  search). Ingestion workflows MUST be disabled with a clear message
  directing the user to enable the EMOS plugin.
- **FR-030**: Without OpenClaw connected, the extension UI MUST render
  but clearly indicate that no AI assistant or workflow orchestration
  is available.

### Key Entities

- **Canonical Raw Item**: A platform-agnostic representation of an
  extracted chat message. Attributes: source, content_type, account_id,
  source_item_id, conversation_id, conversation_title, timestamp, role,
  model_id, content_text, content_html, media, canonical_url,
  parent_message_id, debug_fingerprint.

- **Ingestion Ledger Entry**: A local record tracking the idempotency
  status of each extracted item. Attributes: event_id (hash of
  item_key), item_key, content_hash, canonical_url, group_id, sender,
  evermemos_message_id, first_seen_at, last_seen_at, last_ingested_at,
  status (ingested/skipped/failed), last_error.

- **Flow**: An RR-V3 workflow definition (DAG of nodes). Attributes:
  ID, name, version, node graph, entry node, declared capabilities,
  allowed origins, extraction schema version, drift sentinels.

- **Trigger**: A schedule or event configuration attached to a flow.
  Types: interval, cron, URL, DOM, command, context menu, manual, once.

- **Run**: A single execution instance of a flow. Attributes: run ID,
  flow ID, flow version hash, status, start time, end time, event log,
  cursor state.

- **Tool Group**: A named set of MCP tools grouped by side-effect
  level. Attributes: group name, tools list, enabled state, default
  state.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can type in the sidepanel chat and see related
  memory search results within 500ms of typing on 90% of attempts.
- **SC-002**: Users can complete first-time setup (verify OpenClaw
  connection, confirm EMOS status) in under 2 minutes.
- **SC-003**: An ingestion workflow for one platform runs end-to-end
  and delivers all extracted items to EverMemOS with zero duplicates on
  three consecutive re-runs.
- **SC-004**: Users can stop any running workflow within 2 seconds of
  clicking stop/cancel.
- **SC-005**: Toggling a tool group immediately updates the MCP tool
  registry (verified by listing available tools before and after
  toggle).
- **SC-006**: A flow authored via AI recording completes 5 consecutive
  successful test runs against the target platform before being marked
  stable.
- **SC-007**: When a workflow drifts (extraction fails), the user sees
  a "needs repair" notification with actionable details within the
  same run, not on the next run.

### Assumptions

- **OpenClaw** is the primary LLM orchestrator. Chrome MCP is the
  only MCP connection (browser tools). EMOS is integrated into
  OpenClaw via its plugin system (`evermemos`), not MCP.
- **EverMemOS** is the central memory system for all of a human's
  conversations with any AI chatbot (OpenClaw, ChatGPT, Gemini, etc.).
  Configured in OpenClaw's plugin settings. The extension does not
  manage EMOS credentials or deployment. EMOS plugin is optional —
  the system degrades gracefully without it (chat works as plain
  interface; ingestion disabled).
- The user's Chrome browser is running and the extension is installed
  with appropriate host permissions for AI chat platform domains.
- The Chrome MCP server binds to localhost only; no LAN or remote
  access is supported for MVP.
- Four MVP platform packs ship: **ChatGPT**, **Gemini**, **Claude**,
  and **DeepSeek**. Additional platforms are added iteratively.
