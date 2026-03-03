# Feature Specification: Ruminer Browser Agent

**Feature Branch**: `001-ruminer-browser-agent`
**Created**: 2026-02-25
**Updated**: 2026-02-27
**Status**: Draft
**Input**: Blueprint v0.8 — Build a sidepanel-first Chrome extension
that connects to the OpenClaw Gateway via localhost WebSocket as an
**operator/UI client** (sidepanel chat uses `chat.*`), and exposes browser
automation through a **local MCP server** (`app/native-server`).

OpenClaw calls browser tools via the `mcp-client` plugin (OpenClaw → MCP
client → Ruminer MCP server). The native server bridges tool execution to
the extension via Native Messaging (native host ↔ extension background).

Ruminer runs RR-V3 ingestion workflows and ingests AI chat history
(ChatGPT, Gemini, Claude, DeepSeek) into EverMemOS via two independent
paths: OpenClaw's `evermemos` plugin (sidepanel chat) and the extension's
direct EMOS client (autonomous ingestion workflows).

## Clarifications

### Session 2026-02-25

- Q: Which platform(s) ship as the first MVP packs? → A: ChatGPT
  conversations as the first platform, followed by Gemini, Claude, and
  DeepSeek. Only AI chat platforms — no social media.
- Q: How should the system behave without EverMemOS? → A: Sidepanel
  chat functions as a plain chat interface with OpenClaw (no memory
  search). Ingestion workflows require EMOS and are disabled without
  it. System is modular — components degrade gracefully.
- Q: What is the separation of concerns between OpenClaw, the
  extension, and EMOS? → A: OpenClaw is the LLM orchestrator and tool
  runtime. The extension connects to the OpenClaw Gateway (localhost
  WebSocket) as an **operator/UI client** for sidepanel chat (`chat.*`).
  Browser automation tools are exposed via the local MCP server
  (`app/native-server`), and OpenClaw accesses them through the
  `mcp-client` plugin (OpenClaw → MCP client → Ruminer MCP server). The
  native server bridges tool execution to the extension via Native
  Messaging. EMOS is integrated in two independent paths:
  (1) OpenClaw's `evermemos` plugin (memory search + auto-ingest OpenClaw
  chats) and (2) the extension's direct EMOS client (autonomous ingestion
  workflows).

### Session 2026-02-26

- Q: What happened to the FAB (floating action button)? → A: Removed.
  Sidepanel is the primary UI surface. No in-page overlay / content-script UI.
- Q: What happened to watch workflows and digests? → A: Removed from
  scope. Future features only.
- Q: What about X/Twitter and social media ingestion? → A: Removed
  from scope. Only AI chat platforms (ChatGPT, Gemini, Claude,
  DeepSeek) for MVP.
- Q: How are ingestion workflows developed and scheduled? → A: Workflows
  are AI-authored. The user interacts with
  the agent to develop ingestion workflows for platforms, which are
  then shipped as built-in workflows. Users can also request the agent
  to develop additional workflows. In the Workflows tab, users configure
  cron schedules per workflow (enable/disable, set period) and can
  manually trigger workflows for immediate execution. Scheduled runs
  only occur if the user has enabled cron for that workflow.
- Q: How does "agent mode" vs "readonly mode" work? → A: Replaced by
  tool groups. Browser tools are divided into five groups by
  side-effect level (Observe, Navigate, Interact, Execute, Workflow).
  Users toggle groups on/off from the sidepanel. Disabled groups are
  enforced by the extension (prompt restriction + runtime rejection).

### Session 2026-02-27

- Q: What is the concurrent workflow execution policy? → A: Multiple
  different workflows can run simultaneously in parallel tabs, but the
  same workflow cannot have multiple concurrent runs (at most one
  process per workflow at any time).
- Q: What happens on first Gateway connect when the node is not yet
  paired? → A: Auto-pair silently. Since the Gateway is localhost-only,
  no explicit pairing approval is required.
- Q: What happens to in-flight work when the user clicks "Stop" on a
  running workflow? → A: Abandon in-flight items immediately. The stored
  conversation order list is NOT updated. Idempotency guarantees make
  this safe — any items that were mid-flight are deduped on the next run.
- Q: What are the EMOS retry limits for failed ingestion API calls? →
  A: 3 retries with exponential backoff (1s, 2s, 4s), then fail the
  entire run and stop. EMOS unreachability is a systemic failure, not
  item-level — continuing would just accumulate failures.
- Q: What level of operational logging should the extension provide? →
  A: Structured debug log to IndexedDB with auto-rotation (last 1000
  entries), sensitive fields (auth tokens, API keys) redacted
  automatically, viewable in a debug panel in the extension.

### Session 2026-02-27 (round 2)

- Q: Does EverMemOS expose a delete API for individual memories? → A:
  No. Remove "delete" from FR-010; Memory tab is read-only + open
  canonical URL. EMOS does not support deletion.
- Q: How should the system handle message insertion/reordering in
  source conversations (index shift breaking idempotency)? → A: Not
  applicable. None of the target AI chat platforms (ChatGPT, Gemini,
  Claude, DeepSeek) support message insertion. Message edits are
  handled by content_hash change detection, which triggers an update
  in the ledger. Positional `message_index` is stable.
- Q: How does a workflow resume after platform re-authentication? → A:
  It doesn't. If not authenticated, the workflow fails immediately
  with a notification to the user. No "waiting for user" state. The
  user authenticates manually and the next cron run (or manual trigger)
  picks up where it left off via the stored conversation order list.
- Q: How do conversation filters interact with scanning? → A: Filters
  are workflow configuration parameters (e.g., minimum message count
  in a conversation). They are pre-applied on the conversation list
  before scanning logic. Filtered-out conversations are skipped (not
  ingested). If the user updates filter parameters, the stored
  conversation order list MUST be cleared, forcing a full re-scan.
- Q: Which host permission model should the extension use? → A:
  `<all_urls>` in manifest (granted at install, no per-site prompts).
  Standard for browser automation extensions that must work on
  arbitrary sites.
- Q: How does the workflow know when to stop scanning the conversation
  list (activity-sorted, lazy-loaded, no per-item timestamps in DOM)?
  → A: Store an **ordered list** of all ingested conversation IDs (in
  platform list order). On each run, scan from the top; if 3
  consecutive conversations appear in the **same order** as the stored
  list, consider it past the "new activity" zone and stop. New IDs or
  IDs that moved out of position indicate new activity and must be
  processed. Periodic full scans catch edge cases. On filter parameter
  change, clear the stored list (forces full scan). On stop/failure,
  do not update the stored list (next run rescans from previous state).
- Q: How are ingestion workflows structured per platform? → A: Two
  workflows per platform: (1) a **conversation ingestion workflow**
  that takes a single conversation URL, extracts all messages, and
  ingests them into EMOS via the ledger; and (2) a **conversation list
  scanner workflow** that scans the platform's conversation list,
  applies the heuristic stop and filter logic, identifies conversations
  needing processing, and enqueues a conversation ingestion run for
  each. The scanner is the entry point the user triggers (manually or
  via cron); the conversation ingestion workflow is triggered by the
  scanner (or manually by the user for a specific conversation URL).
- Q: Can conversation ingestion workflows run in parallel? → A: Yes.
  Multiple conversation ingestion runs (same platform, different
  conversation URLs) MAY execute in parallel, each in its own tab,
  bounded by a configurable max parallel tabs limit (default 3).
  Scanner workflows remain single-instance per platform.

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
the user control which browser tools OpenClaw can use.

**Why this priority**: The sidepanel chat is the primary daily
touchpoint and the feature that makes Ruminer more than a browser
automation tool. It turns the sidepanel into a memory-augmented
workspace.

**Independent Test**: Open the sidepanel, type a query, see memory
search results appear, press Enter, see chat messages with tool call
results inline. Toggle tool groups and verify the agent's available
tools are restricted immediately.

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
   the extension updates its enforcement table immediately, the next
   message sent to OpenClaw includes the updated restriction prompt,
   and attempts to use disabled tools fail with a clear
   "disabled by tool group" error.

7. **Given** the user is in chat mode, **When** they click "New chat",
   **Then** the panel returns to empty state / search mode.

---

### User Story 2 - Ingest AI Chat Histories into Knowledge Base (Priority: P2)

A user wants to collect their AI chat conversations from platforms
(ChatGPT, Gemini, Claude, DeepSeek) into their personal knowledge base
(EverMemOS). The user opens the sidepanel Workflows tab and clicks
"Run" on the scanner workflow for their target platform. Ruminer runs
the pipeline locally using RR-V3: the scanner navigates to the
platform's conversation list, identifies conversations needing
processing (using the heuristic stop and filter logic), and enqueues
a conversation ingestion run for each. Each conversation ingestion run
navigates to the conversation, extracts messages, normalizes and hashes
them, checks the local ingestion ledger, and ingests items into EMOS
via its direct EMOS client. The user can also trigger the conversation
ingestion workflow directly for a specific conversation URL. OpenClaw
is not required for ingestion runs, but can be used for agent-driven
ingestion and workflow authoring/repair. The user can see progress and
stop the workflow at any time. Re-running is always safe — no
duplicates are created.

**Why this priority**: Ingestion is the foundational data pipeline.
Without content flowing into EverMemOS, the memory-grounded chat
(Story 1 search suggestions) has no data to work with. This is the
core "AI chat history collector" value proposition.

**Independent Test**: Verify OpenClaw Gateway connectivity (for chat)
and EMOS connectivity (for ingestion) in Options, run the ChatGPT
scanner workflow from the sidepanel (which enqueues conversation
ingestion runs), verify items appear in the Memory tab, re-run the
scanner, and confirm no duplicates are created. Also test triggering
the conversation ingestion workflow directly with a specific
conversation URL.

**Acceptance Scenarios**:

1. **Given** the user opens the Options page, **When** they verify the
   OpenClaw Gateway connection and EMOS connection, **Then** the system
   reports connectivity status for both services with clear error
   messages and suggested next steps if either is unreachable, using
   one of three error classes:
   - "Cannot reach Gateway": explain that OpenClaw is not running on
     `127.0.0.1:18789` and direct the user to start OpenClaw locally.
   - "Invalid token or credentials": explain that the provided token or
     API key is invalid or expired and direct the user to re-enter
     credentials.
   - "Cannot reach EverMemOS": explain that EMOS is unreachable or
     misconfigured and direct the user to check the EMOS URL and server
     health.

2. **Given** OpenClaw and EMOS are connected, **When** the user opens
   the sidepanel Workflows tab and clicks "Run" on a scanner workflow,
   **Then** the scanner scans the conversation list (using heuristic
   stop), enqueues conversation ingestion runs for conversations
   needing processing, and the run queue dispatches them up to the
   max parallel tabs limit (default 3). The user sees visible progress
   (scanner: conversations found; ingestion: messages processed per
   conversation) and can stop at any time.

3. **Given** a conversation ingestion workflow is running, **When** it
   extracts messages from the target conversation, **Then** each
   message is normalized into the Standard EMOS Message JSON schema
   (`message_id`, `create_time`, `sender`, `content`, `group_id`, plus
   optional fields) and a stable idempotency key is computed using the
   format `platform:conversation_id:message_index`.

4. **Given** normalized items are ready for ingestion, **When** the
   system checks the local ingestion ledger, **Then** new items (no
   matching item_key) are ingested into EverMemOS, items with changed
   content (same item_key, different content_hash) are updated, and
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
URL or view its full content with conversation context.

**Why this priority**: The Memory tab provides visibility into what's
been collected and gives users confidence that the system is working.
Without it, ingestion workflows run blindly with no way to verify
results.

**Independent Test**: Open the sidepanel Memory tab, browse items
(requires at least one ingested conversation), search for items, and
perform actions (open item, open canonical URL).

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
   (success/failed/never run), timestamp, cron enable/disable toggle,
   and cron period configuration.

2. **Given** a workflow is listed, **When** the user clicks "Run"
   (manual trigger), **Then** the workflow begins executing and its
   status updates in real time (items processed, current step, errors).

3. **Given** a workflow has cron enabled, **When** the configured
   cron period elapses, **Then** RR-V3 automatically enqueues a flow
   run (best-effort, only while browser is running).

4. **Given** a workflow run has completed, **When** the user views the
   run history, **Then** they can see the RR-V3 event timeline with
   timestamps, node statuses, and any errors for debugging.

5. **Given** a workflow is running, **When** the user clicks "Stop",
   **Then** in-flight items are abandoned immediately (within 2 seconds),
   the stored conversation order list is NOT updated (preserving
   previous scan state), and any mid-flight items are safely deduped
   on the next run via the ingestion ledger.

---

### User Story 5 - Author and Maintain Workflows with AI Assistance (Priority: P5)

A power user or developer wants to create new workflows for AI
platforms not yet supported, or customize existing ones. Using OpenClaw
(or another OpenClaw Gateway client), they start a recording session
that captures browser actions. OpenClaw then converts the recording
into a reusable workflow: replacing brittle selectors with stable
alternatives, parameterizing user handles, adding extraction schemas
and validation rules, and defining triggers and checkpoints. When a
workflow starts failing due to platform UI changes (drift), the system
surfaces the failure with a screenshot, HTML snippet, and flow contract
details, allowing OpenClaw to diagnose and patch the workflow.

**Why this priority**: AI authoring and drift repair are power-user
features that expand Ruminer's platform coverage over time.

**Independent Test**: Initiate a recording session via browser tools,
capture a simple browser action sequence, ask the AI to convert it into
a flow, run the flow, and verify it executes the recorded actions.

**Acceptance Scenarios**:

1. **Given** OpenClaw (or another Gateway client) is connected,
   **When** it calls the flow management APIs (list, get, save,
   delete), **Then** the tools respond with the correct flow data
   following existing tool patterns.

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
  The system MUST retry with exponential backoff (3 attempts: 1s, 2s,
  4s delays), log the failure in the ingestion ledger with status
  "failed" and the error details, NOT update the stored conversation
  order list, and **fail the entire run** after exhausting retries
  (EMOS unreachability is systemic — continuing is wasteful). The user
  sees a "connection failed" status with a "retry" action. The next
  run rescans from the previous conversation order state.

- What happens when the idempotency key format changes? The system
  MUST use the stable format `platform:conversation_id:message_index`
  where `message_index` is the 0-based position in the conversation.
  Re-runs with the same item_key keep the same identity; content edits
  are detected by content_hash. Note: none of the target AI chat
  platforms support message insertion, so positional `message_index`
  is stable. Message edits are detected via content_hash and trigger
  an update (not a duplicate).

- What happens when a platform requires re-authentication mid-workflow?
  The workflow MUST fail immediately with a notification ("Not logged
  in to {platform} — please log in and re-run or wait for next
  scheduled run"). No "waiting for user" state. The stored conversation
  order list is NOT updated, so the next run (cron or manual) rescans
  from the previous state. The ledger ensures no duplicates.

- What happens when the service worker restarts during a long-running
  ingestion? RR-V3 crash recovery re-queues the interrupted run. The
  stored conversation order list is NOT updated mid-run (only on
  successful batch completion), so the recovered run rescans from the
  previous state. The ingestion ledger ensures no items are duplicated
  or skipped upon resumption.

- What happens when OpenClaw is connected but the EMOS plugin is not
  enabled? The sidepanel chat functions as a plain chat interface with
  OpenClaw — full chat and browser automation tools, but no memory
  search and no automatic chat ingestion into EMOS. Ingestion workflows
  remain available as long as EMOS is configured in the extension.

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
- **FR-002a**: The memory-search debounce MUST be configurable, with a
  default of **250ms**. The UI should aim to display updated results
  within **500ms** of the user's last keystroke on typical local setups.
- **FR-003**: User MUST be able to submit prompts to OpenClaw by
  pressing Enter. The panel MUST transition to chat mode showing the
  conversation thread with inline tool call results.
- **FR-004**: Chat messages (user + assistant) MUST be auto-ingested
  into EMOS via OpenClaw's EMOS plugin when EMOS is configured.
- **FR-005**: Chat tab MUST provide a "New chat" action to return to
  empty state / search mode.

**Tool Groups**

- **FR-006**: Browser tools MUST be divided into five groups by
  side-effect level: Observe (snapshots, screenshots, tab listing,
  console read, interactive element listing, history read, bookmarks
  read/search, ledger — default On), Navigate (navigation, open/switch/
  close tabs — default On), Interact (click/type/scroll, dialogs,
  element selection — default Off), Execute (cookie-enabled network
  requests, file upload — default Off), Workflow (RR-V3 flow/trigger/
  run management, run queue controls — default On).
- **FR-007**: Users MUST be able to toggle tool groups on/off from the
  sidepanel chat header. When a group is disabled, the extension MUST
  prevent the agent from successfully executing tools in that
  group (prompt restriction + runtime rejection).
- **FR-008**: Tool group defaults MUST be safe: Observe and Navigate on,
  Interact and Execute off, Workflow on.
- **FR-009**: Tool group state MUST be persisted locally and applied
  immediately to both the restriction prompt sent to OpenClaw and the
  runtime enforcement table.

**Sidepanel Memory & Workflows**

- **FR-010**: Memory tab MUST support searching and browsing EverMemOS
  items by keyword, source platform, and date, with the ability to
  open canonical URLs. Memory tab is read-only (no delete); EMOS does
  not expose a delete API.
- **FR-011**: Workflows tab MUST list saved workflows with platform
  name, last run status, and a one-click "Run" action.
- **FR-012**: Workflows tab MUST display real-time run progress and
  provide access to the RR-V3 event timeline for debugging. "Real-time
  run progress" is defined as, for any in-flight run, showing the
  current logical step label (e.g., "Listing conversations",
  "Ingesting messages") and a numeric counter of processed items.
- **FR-013**: Every automated action MUST be visible to the user and
  stoppable (pause, cancel) at any point during execution.

**OpenClaw Integration**

- **FR-014**: System MUST allow configuring the OpenClaw Gateway
  connection (WS URL + auth token) and an EMOS connection (base URL +
  API key + tenant/space IDs) in the Options page, with connection
  tests and clear error messages. The extension MUST connect to the
  Gateway as an **operator/UI client** for sidepanel chat (`chat.*`).
  OpenClaw MUST be able to call Ruminer’s browser automation tools via
  the `mcp-client` plugin (OpenClaw → MCP client → Ruminer MCP server at
  `http://127.0.0.1:12306/mcp`). The MCP server MUST bridge tool
  execution to the extension via Native Messaging.
- **FR-014a**: On first connect to the Gateway, the extension MUST
  auto-pair silently (no explicit pairing approval step). Since the
  Gateway is localhost-only, the localhost trust boundary is sufficient.

**EverMemOS Integration**

- **FR-015**: System MUST support two EMOS integration paths: (1)
  OpenClaw's `evermemos` plugin (configured in `openclaw.plugin.json`,
  provides memory search + auto-ingest OpenClaw chats) and (2) the
  extension's direct EMOS client (configured in extension Options via
  `chrome.storage.local`, provides direct API access for ingestion
  workflows). Both paths target the same EMOS instance with the same
  credentials. The extension MUST NOT transmit its EMOS credentials to
  OpenClaw.
- **FR-016**: System MUST normalize extracted chat messages into the
  **standard EverMemOS message JSON** (at minimum: `message_id`,
  `create_time`, `sender`, `content`, `group_id`; optionally `group_name`,
  `sender_name`, `role`, `refer_list`) plus any internal metadata needed
  for debugging and dedupe.
- **FR-017**: System MUST compute stable idempotency keys using the
  format `platform:conversation_id:message_index`, and derive content_hash
  via sha256 of content bytes. The item_key is used as the EverMemOS
  message_id for strict idempotency.
- **FR-018**: System MUST maintain a local ingestion ledger (IndexedDB
  `ruminer.ingestion_ledger`) keyed by item_key that tracks ingestion
  status, content hashes, and timestamps to prevent duplicate ingestion.
- **FR-019**: The extension MUST be able to ingest canonical items into
  EMOS directly (autonomous ingestion workflows). OpenClaw MAY be used
  to _author and repair_ workflows (e.g., generate/iterate on extraction
  JavaScript), but ingestion runs MUST be deterministic inside the
  extension and MUST NOT depend on routing extracted content through
  OpenClaw.

**Workflow Execution**

- **FR-020**: Ingestion workflows MUST be idempotent: re-runs MUST NOT
  create duplicate entries. New items are ingested, changed items are
  updated, unchanged items are skipped.
- **FR-020a**: Concurrency rules differ by workflow type:
  - **Scanner workflows**: At most one concurrent run per platform.
    Triggering an already-running scanner MUST be rejected with a
    clear "already running" message.
  - **Conversation ingestion workflows**: Multiple runs of the same
    workflow MAY execute in parallel (each in its own tab, targeting a
    different conversation URL). Concurrency MUST be bounded by a
    configurable **max parallel tabs** limit (e.g., default 3). The
    RR-V3 run queue manages the concurrency — the scanner enqueues all
    identified conversations, and the queue dispatches up to the max
    in parallel, starting the next as each completes.
  - **Cross-platform**: Different platform scanners MAY run
    simultaneously.
- **FR-021**: Ingestion workflows MUST process items in bounded,
  resumable batches and enqueue continuation runs when more items
  remain, rather than looping within a single service worker activation.
- **FR-021a**: The **scanner workflow** MUST use an **ordered
  conversation ID list** (stored as a persistent var) to determine
  when to stop scanning. The algorithm: scan the platform's
  conversation list from the top (newest activity); if **3 consecutive
  conversations** appear in the **same order** as the stored list,
  consider the scan past the "new activity" zone and stop. New IDs
  (not in stored list) or IDs that moved out of position indicate new
  activity — the scanner enqueues a conversation ingestion run for
  each. The stored list MUST be updated only on successful scanner
  batch completion; on stop or failure, the list MUST NOT be updated
  (next run rescans from previous state).
- **FR-021b**: The scanner workflow MUST perform a **periodic full
  scan** (configurable interval, e.g., every N runs or every N days)
  that ignores the heuristic stop and scans the entire conversation
  list. This catches edge cases where conversations with new activity
  were missed by the heuristic.
- **FR-022**: Each platform MUST have **two workflows**:
  - **Conversation ingestion workflow**: Takes a single conversation
    URL as input, navigates to the conversation, extracts all messages,
    normalizes them into Standard EMOS Message JSON, and ingests via
    the ledger. Can be triggered independently by the user for a
    specific conversation URL.
  - **Conversation list scanner workflow**: Scans the platform's
    conversation list, applies the heuristic stop (FR-021a) and filter
    logic (FR-027), identifies conversations needing processing, and
    enqueues a conversation ingestion run for each. The RR-V3 run
    queue dispatches enqueued runs up to the max parallel tabs limit
    (FR-020a). This is the entry point the user triggers (manually or
    via cron).
    Built-in workflows MUST ship iteratively:
  - **MVP**: ChatGPT (scanner + conversation ingestion)
  - **Later**: Gemini, Claude, DeepSeek (scanner + conversation
    ingestion each)
    All workflows are AI-authored during development.
- **FR-023**: Workflows MUST detect authentication state. If the user
  is not authenticated on the target platform, the workflow MUST fail
  immediately with a notification ("Not logged in to {platform} —
  please log in and re-run or wait for next scheduled run"). The stored
  conversation order list is NOT updated, so the next cron run or
  manual trigger rescans from the previous state.

- **FR-024**: Users MUST be able to configure cron schedules for each
  workflow in the Workflows tab: enable/disable cron, set cron period
  (e.g., "every 6 hours", "daily at 2am"). Scheduled runs are best-effort
  and only execute while the browser is running. Users MUST also be able
  to manually trigger any workflow for immediate execution regardless of
  cron configuration.
- **FR-025**: Workflows MUST have a fixed set of tools declared at
  authoring time. Workflow execution MUST be independent of the tool groups
  currently selected in the chat panel (no runtime elevation requests).
- **FR-026**: Workflows MUST include configurable and randomized delays
  between page loads and interactions to avoid triggering platform rate
  limits or anti-bot mechanisms. Default delay ranges: **1--3 seconds**
  between page loads, **200--500ms** between interactions.
- **FR-027**: Workflows MUST support configurable filter parameters
  (e.g., minimum message count, date range) defined in the workflow
  configuration. Filters are pre-applied on the conversation list
  before scanning logic; filtered-out conversations are skipped (not
  ingested). If filter parameters are changed, the stored ordered
  conversation ID list (FR-021a) MUST be cleared, forcing a full
  re-scan on the next run. Already-ingested items are still
  deduplicated via the ledger.

**AI Authoring & Drift Repair**

- **FR-028**: System MUST expose RR-V3 management APIs (flow/trigger/run
  CRUD) so OpenClaw can author and operate workflows programmatically.
- **FR-029**: When extraction fails **3 consecutive times for the same
  node within a single run**, system MUST capture a bounded screenshot
  and HTML snippet, surface a "needs repair" notification with flow
  contract details, and provide a reproducible "open failing run"
  action for AI-assisted diagnosis.

**Security & Privacy**

- **FR-030**: OpenClaw Gateway access MUST be localhost-only (no LAN
  exposure). The extension MUST connect via authenticated WebSocket
  with a WS auth token. Tool group enforcement MUST happen at two
  layers in the extension: (1) prompt layer — the extension injects
  disabled tool instructions into the system prompt when sending
  `chat.send` to OpenClaw, and (2) runtime layer — the background
  script's tool executor rejects MCP tool calls for tools in disabled
  groups. All browser tools including RR‑V3 are exposed via MCP on the
  native server; the `browser-ext` plugin has no knowledge of tool
  groups.
- **FR-031**: Host permissions MUST use `<all_urls>` in the manifest,
  granted at install time with no per-site prompts. The extension MUST
  NOT be restricted to a fixed allowlist of AI chat platform domains.
- **FR-032**: Flow version/hash MUST be displayed for every run.
  Silent mutation of a flow MUST NOT bypass tool re-approval: if the
  flow's declared tool set has expanded since the user last approved
  it, a **blocking modal** MUST be shown before execution listing the
  added tools (diff view) and requiring explicit approval. Flows are
  executable code; flow permissions/tools should be declared and
  enforced at runtime.

**Observability**

- **FR-035**: The extension MUST maintain a structured debug log in
  IndexedDB with auto-rotation (last 1000 entries). Sensitive fields
  (auth tokens, API keys) MUST be redacted automatically before
  logging. The log MUST be viewable in a debug panel within the
  extension UI.

**Modular Degradation**

- **FR-033**: Without OpenClaw's EMOS integration available, the
  sidepanel chat MUST function as a plain chat interface (no memory
  search and no automatic chat ingestion). Without EMOS configured in
  the extension Options, ingestion workflows MUST be disabled with a
  clear message directing the user to configure EMOS.
- **FR-034**: Without OpenClaw connected, the extension UI MUST render
  but clearly indicate that chat/openclaw features are unavailable.
  Ingestion workflows remain available as long as EMOS is configured.

### Key Entities

- **Standard EMOS Message JSON**: The normalized message object Ruminer
  writes to EverMemOS. Attributes at minimum: `message_id` (=`item_key`),
  `create_time`, `sender`, `content`, `group_id`. Optional: `group_name`,
  `sender_name`, `role`, `refer_list`.

- **Ingestion Ledger Entry**: A local record tracking the idempotency
  status of each extracted item. Attributes: item_key (platform:conversation_id:message_index),
  content_hash (sha256), canonical_url, group_id ({platform}:{conversation_id}),
  sender (me or platform name), evermemos_message_id, first_seen_at,
  last_seen_at, last_ingested_at, status (ingested/skipped/failed), last_error.

- **Flow**: An RR-V3 workflow definition (DAG of nodes with explicit
  entryNodeId). Two types per platform: **scanner** (scans conversation
  list, enqueues ingestion runs) and **conversation ingestion** (takes
  a conversation URL, extracts and ingests messages). Attributes: ID,
  name, version, node graph, entry node, declared tools (fixed at
  authoring time, independent of chat tool groups), allowed origins,
  auth checks, max parallel runs (scanner: 1, ingestion: configurable,
  default 3), scanning config (scanner only: heuristic stop threshold,
  full scan interval), filter parameters, max items per run, rate limit
  policies, extraction schema version, drift sentinels. Flows must be
  acyclic (no graph-level loops or cycles; pagination/scrolling/
  iteration implemented as composite nodes that loop internally but
  still return a single node result).

- **Trigger**: A schedule or event configuration attached to a flow.
  Types: interval, cron, url, dom, command, contextMenu, once, manual.
  Scheduled triggers are best-effort and only run while the browser is
  running (MV3 cannot wake a fully closed Chrome reliably).

- **Run**: A single execution instance of a flow. Attributes: run ID,
  flow ID, flow version hash, status, start time, end time, event log,
  scan state (conversations processed in this run).

- **Tool Group**: A named set of browser tools grouped by
  side-effect level. Attributes: group name, side-effect description,
  tool list, enabled state, default state. Groups: Observe
  (read-only tools, default On), Navigate (page/tab changes,
  default On), Interact (DOM manipulation, default Off), Execute
  (code/network/file I/O, default Off), Workflow (RR-V3 flow management,
  default On). Tool group state is persisted in `chrome.storage.local`.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can type in the sidepanel chat and see related
  memory search results within 500ms of typing on 90% of attempts.
- **SC-002**: Users can complete first-time setup (verify OpenClaw
  Gateway connection and EMOS connection) in under 2 minutes.
- **SC-003**: An ingestion workflow for one platform runs end-to-end
  and delivers all extracted items to EverMemOS with zero duplicates on
  three consecutive re-runs.
- **SC-004**: Users can stop any running workflow within 2 seconds of
  clicking stop/cancel.
- **SC-005**: Toggling a tool group immediately changes effective
  permissions (verified by a newly-disallowed action being rejected
  after a toggle).
- **SC-006**: A flow authored via AI recording completes 5 consecutive
  successful test runs against the target platform before being marked
  stable.
- **SC-007**: When a workflow drifts (extraction fails), the user sees
  a "needs repair" notification with actionable details within the
  same run, not on the next run.

### Assumptions

- **OpenClaw** is the primary LLM orchestrator. The extension connects
  to the OpenClaw Gateway via localhost WebSocket as an **operator** for
  sidepanel chat (`chat.*`). Browser automation tools are exposed via
  Ruminer’s local MCP server (`app/native-server`), and OpenClaw calls
  them through the `mcp-client` plugin (OpenClaw → MCP client → Ruminer
  MCP server). The MCP server bridges execution to the extension via
  Native Messaging.
- **EverMemOS** is the central memory system for all of a human's
  conversations with any AI chatbot (OpenClaw, ChatGPT, Gemini, etc.).
  EMOS is configured in two places: OpenClaw's `evermemos` plugin
  (`openclaw.plugin.json`) for memory search + auto-ingest OpenClaw
  chats, and the extension Options (`chrome.storage.local`) for
  autonomous ingestion workflows. Both paths target the same EMOS
  instance with the same credentials. The system degrades gracefully
  when one path is unavailable.
- **Ruminer identity conventions** (single-user local): sender =
  "me" for user messages, sender = "{platform}" (e.g., "chatgpt",
  "gemini", "claude", "deepseek") for AI replies, sender = "agent" for
  OpenClaw agent replies, and group_id = "{platform}:{conversation_id}".
- The user's Chrome browser is running and the extension is installed
  with appropriate host permissions for AI chat platform domains.
- The OpenClaw Gateway binds to localhost only; no LAN or remote access
  is supported for MVP.
- MVP platform packs ship iteratively: **ChatGPT** first (Phase 1),
  then **Gemini**, **Claude**, and **DeepSeek** (Phase 2).
