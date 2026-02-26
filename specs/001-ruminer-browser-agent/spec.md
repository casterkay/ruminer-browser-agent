# Feature Specification: Ruminer Browser Agent

**Feature Branch**: `001-ruminer-browser-agent`
**Created**: 2026-02-25
**Status**: Draft
**Input**: Blueprint v0.5 — Transform Chrome MCP Server into a personal
content collector, workflow runtime, and personalized digest reader.
Chrome MCP is the only MCP connection; EMOS is integrated into OpenClaw
via its plugin system (auto-ingest + addMemory/searchMemory methods).

## Clarifications

### Session 2026-02-25

- Q: When are digests generated? → A: OpenClaw drives both watch
  scheduling (heartbeat/cron) and digest report generation. After all
  platform watch workflows complete, OpenClaw selects high-signal
  content from the joint collection and produces a digest report. Users
  can also request a digest on demand via FAB/sidepanel.
- Q: Which platform(s) ship as the first MVP packs? → A: ChatGPT
  conversations (authored AI chat history) and X/Twitter posts +
  bookmarks (authored + bookmarked social content).
- Q: How should the system behave without EverMemOS? → A: FAB
  functions as a plain chat interface with OpenClaw (no memory
  suggestions). Ingestion and watch workflows require EMOS and are
  disabled without it. System is modular — components degrade
  gracefully.
- Q: What is the separation of concerns between OpenClaw, Chrome MCP,
  and EMOS? → A: OpenClaw is the LLM orchestrator connecting to Chrome
  MCP (browser automation, the only MCP connection) with EMOS
  integrated as a built-in OpenClaw plugin (not MCP). The EMOS plugin
  auto-ingests OpenClaw conversations and exposes addMemory/searchMemory
  as gateway methods. The extension does NOT call EMOS directly.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - In-Page Assistant with Memory-Grounded Answers (Priority: P1)

A user browsing any webpage wants to ask a question or look something
up without leaving the page. They hover over a small floating button
(the Ruminer FAB) anchored to the corner of the screen. The FAB
expands into a single-line command bar. As they type, a floating list
of related memories from their personal knowledge base (via OpenClaw's
EMOS plugin `searchMemory`) appears below the input, updating live. They can select
memories as additional context or simply press Enter to submit their
prompt to OpenClaw. If EMOS is not configured, the FAB still functions
as a plain chat interface with OpenClaw — no memory suggestions, but
full chat and browser automation capability. An optional "agent mode"
toggle allows OpenClaw to interact with the current page's DOM (click,
type, navigate) — this mode is off by default and requires explicit
per-origin opt-in, with a persistent visible indicator and one-click
revoke.

**Why this priority**: The in-page assistant is the primary daily
touchpoint and the feature that most differentiates Ruminer from a
generic browser automation tool. It turns every page into a
memory-augmented workspace. Without it, Ruminer has no user-facing
identity beyond the sidepanel.

**Independent Test**: Can be fully tested by installing the extension,
hovering the FAB on any webpage, typing a query, seeing memory
suggestions appear, and submitting a prompt. Delivers immediate value
as a memory-aware search/ask interface.

**Acceptance Scenarios**:

1. **Given** the extension is installed and active, **When** the user
   visits any webpage, **Then** a floating action button (FAB) with the
   Ruminer logo appears anchored to a screen corner without causing
   layout shifts or perceptible page load impact.

2. **Given** the FAB is visible, **When** the user hovers over or
   clicks the FAB, **Then** it expands into a single-line text input
   command bar with a smooth transition animation.

3. **Given** the command bar is expanded and focused and EMOS is
   configured, **When** the user types at least 3 characters, **Then**
   a floating list of related memory items (retrieved via OpenClaw's
   EMOS plugin) appears below the input within 500ms (debounced),
   updating as the user continues typing. If EMOS is not configured,
   no memory suggestions appear but the command bar functions normally.

4. **Given** memory suggestions are visible, **When** the user selects
   one or more suggestions and presses Enter, **Then** the prompt is
   submitted to OpenClaw with the selected memories included as
   context.

5. **Given** the user submits a prompt, **When** the assistant is
   processing, **Then** a loading indicator is visible and the user can
   cancel the request at any time.

6. **Given** agent mode is off (default), **When** the user enables
   agent mode, **Then** they are prompted to approve specific
   capabilities (read DOM, click, type, navigate, etc.) for the
   current origin, a persistent on-page indicator appears, and a
   one-click revoke control is available.

7. **Given** agent mode is enabled for an origin, **When** the user
   clicks the revoke control or disables agent mode, **Then** all
   granted capabilities for that origin are immediately revoked and the
   indicator disappears.

---

### User Story 2 - Ingest Personal Content into Knowledge Base (Priority: P2)

A user wants to collect their own content from platforms into their
personal knowledge base (EverMemOS). For MVP, two platform packs are
supported: **ChatGPT conversations** (authored AI chat history) and
**X/Twitter posts + bookmarks** (authored + bookmarked social content).
The user opens the sidepanel and runs a pre-built ingestion workflow
with one click. OpenClaw orchestrates the pipeline: using Chrome MCP
tools to navigate to the platform and extract content, then using its
EMOS plugin (`addMemory`) to ingest normalized items. The extension
handles extraction,
normalization, hashing, and local ledger bookkeeping. OpenClaw handles
EMOS ingestion. The user can see progress and stop the workflow at any
time. Re-running the same workflow is always safe — no duplicates are
created.

**Why this priority**: Ingestion is the foundational data pipeline.
Without content flowing into EverMemOS, the memory-grounded features
(Story 1 suggestions, Story 5 digests) have no data to work with. This
is the core "content collector" value proposition.

**Independent Test**: Can be fully tested by verifying OpenClaw + EMOS
connectivity in Options, running the ChatGPT or X/Twitter ingestion
workflow from the sidepanel, verifying items appear in the knowledge
base, re-running the workflow, and confirming no duplicates are created.

**Acceptance Scenarios**:

1. **Given** the user opens the Options page, **When** they verify the
   OpenClaw connection and check EMOS status (read-only, configured in
   OpenClaw), **Then** the system reports connectivity status for both
   services with clear error messages and suggested next steps if
   either is unreachable.

2. **Given** OpenClaw and EMOS are connected, **When** the user opens
   the sidepanel and clicks "Run" on a saved ingestion workflow,
   **Then** the workflow begins executing with visible progress and the
   user can pause or cancel at any time.

3. **Given** an ingestion workflow is running, **When** it extracts
   content from the target platform, **Then** each item is normalized
   into the canonical raw item schema (source, content type, account
   ID, timestamp, content text, etc.) and a stable idempotency key is
   computed from the source item ID.

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
sidepanel. The sidepanel shows two primary sections: Workflows (saved
workflows with one-click run and recent run status) and Knowledge Base
(browse/search EverMemOS items by keyword, source, or date). The user
can open any item's canonical URL, view its details, or delete items
they no longer want.

**Why this priority**: The sidepanel is the control center for all
Ruminer operations. It provides visibility into what's been collected
and gives users confidence that the system is working. Without it,
ingestion workflows run blindly with no way to verify results.

**Independent Test**: Can be fully tested by opening the sidepanel,
browsing the knowledge base (requires at least one ingested item),
searching for items, and performing management actions (open, delete).

**Acceptance Scenarios**:

1. **Given** the user clicks the extension button, **When** the
   sidepanel opens, **Then** it displays a Workflows section with saved
   workflows (name, last run status, one-click Run button) and a
   Knowledge Base section with a search/browse interface.

2. **Given** the sidepanel is open on the Knowledge Base section,
   **When** the user enters a search query, **Then** matching EverMemOS
   items are displayed with source, timestamp, title/snippet, and a
   link to the canonical URL.

3. **Given** search results are displayed, **When** the user clicks an
   item, **Then** they can view its full content and open the canonical
   URL in a new tab.

4. **Given** a workflow is listed in the Workflows section, **When**
   the user clicks "Run", **Then** the workflow begins executing and
   its status updates in real time (queued, running, completed, failed).

5. **Given** a workflow run has completed, **When** the user views the
   run history, **Then** they can see the RR-V3 event timeline with
   timestamps, node statuses, and any errors for debugging.

---

### User Story 4 - Monitor Subscribed Sources Automatically (Priority: P4)

A user follows specific accounts, channels, or feeds on platforms like
YouTube, X, Reddit, and Threads. They want Ruminer to periodically
check these subscriptions and collect new content without manual
intervention. OpenClaw's heartbeat/cron scheduler drives watch
workflows — one predefined workflow per platform, checking each
user-followed account for new posts via Chrome MCP tools. The system
opens the platform in a dedicated window, reads the
subscription/following list, identifies new items since the last check
using a persistent cursor, extracts them in bounded batches, and stores
them locally for digest processing. The system clearly communicates
that scheduled checks only run while the browser is open.

**Why this priority**: Watch workflows are the "set it and forget it"
feature that turns Ruminer from a manual tool into a passive
information assistant. They depend on the ingestion pipeline (Story 2)
being stable first.

**Independent Test**: Can be fully tested by configuring a watch
workflow for one platform, setting a short interval, verifying it runs
on schedule, checking that only new items are collected, and confirming
cursor advancement.

**Acceptance Scenarios**:

1. **Given** a watch workflow is configured and OpenClaw's cron
   schedule fires, **When** OpenClaw invokes the workflow via Chrome
   MCP, **Then** the workflow runs in a new browser window (isolated
   from the user's active tabs) and processes only items newer than
   the last cursor position.

2. **Given** a watch workflow is running, **When** it encounters more
   items than the batch limit (e.g., 50 items), **Then** it processes
   the current batch, persists the cursor, and enqueues a continuation
   run for the remaining items rather than looping indefinitely.

3. **Given** a watch workflow completes a batch, **When** the cursor
   is updated, **Then** the next run starts from exactly where the
   previous run left off with no gaps or overlaps.

4. **Given** the browser was closed when a scheduled trigger was
   supposed to fire, **When** the browser reopens, **Then** the missed
   run is executed promptly and the UI clearly communicates that
   scheduled checks require the browser to be running.

5. **Given** the user wants to stop monitoring, **When** they disable
   or delete a watch workflow's trigger, **Then** no further scheduled
   runs execute and existing cursors are preserved for potential
   re-enablement.

---

### User Story 5 - Receive Personalized High-Signal Digests (Priority: P5)

A user receives a large volume of content from their subscribed
sources. They want Ruminer to surface only the items that matter to
them, based on their personal interests and knowledge base. After all
platform watch workflows complete, OpenClaw selects high-signal content
from the joint collection: it queries the extension for candidate items
(via Chrome MCP) and queries EMOS for personal relevance context (via
its built-in EMOS plugin), then scores items on freshness, engagement
signals, personal
relevance (similarity to authored/bookmarked memories), and novelty.
OpenClaw produces a digest report and stores the results back in the
extension for sidepanel rendering. Users can also request a digest on
demand via the FAB or sidepanel. Results are presented as digest cards
in a dedicated inbox, each showing source, time, a canonical link, a
short summary, and a reason explaining why the item matters. Users can
provide feedback ("more like this", "less like this", "mute source",
"mute keyword") to improve future digests deterministically.

**Why this priority**: Digests are the highest-value output of the
watch pipeline but depend on both subscribed content (Story 4) and
user memory (Story 2) being available for scoring.

**Independent Test**: Can be fully tested by having at least one
completed watch run with collected items, triggering a digest build,
and verifying that the digest inbox shows scored cards with
explanations. Feedback controls can be tested by muting a source and
confirming subsequent digests exclude it.

**Acceptance Scenarios**:

1. **Given** subscribed-source items have been collected by a watch
   workflow, **When** a digest is generated, **Then** items are scored
   using freshness, engagement proxies, personal relevance (EverMemOS
   similarity to authored/bookmarked memories), and novelty, and the
   top-scoring items are presented as digest cards.

2. **Given** a digest is generated, **When** the user opens the digest
   inbox in the sidepanel, **Then** each card shows source, timestamp,
   canonical link, a short summary, and a "why it matters" explanation
   grounded in the user's memories (with cited memory IDs when
   available).

3. **Given** a digest card is displayed, **When** the user taps
   "more like this" or "less like this", **Then** the preference is
   stored locally and applied deterministically in subsequent digest
   scoring.

4. **Given** the user mutes a source or keyword, **When** the next
   digest is generated, **Then** items matching the muted criteria are
   excluded or heavily down-ranked.

5. **Given** a digest has been generated, **When** the user views the
   digest report, **Then** the report (produced by OpenClaw from
   structured inputs: selected items, EMOS-matched memories, and user
   preferences) is rendered in the sidepanel with citeable sources and
   grounded explanations.

---

### User Story 6 - Author and Maintain Workflows with AI Assistance (Priority: P6)

A power user or developer wants to create new workflows for platforms
not yet supported, or customize existing ones. Using OpenClaw (or
another MCP-capable AI client), they start a recording session that
captures browser actions. OpenClaw then converts the recording into a
reusable workflow: replacing brittle selectors with stable alternatives,
parameterizing user handles, adding extraction schemas and validation
rules, and defining triggers and checkpoints. When a workflow starts
failing due to platform UI changes (drift), the system surfaces the
failure with a screenshot, HTML snippet, and flow contract details,
allowing OpenClaw to diagnose and patch the workflow.

**Why this priority**: AI authoring and drift repair are power-user
features that expand Ruminer's platform coverage over time. They depend
on the full pipeline (Stories 1-5) being functional.

**Independent Test**: Can be fully tested by initiating a recording
session via MCP tools, capturing a simple browser action sequence,
asking the AI to convert it into a flow, running the flow, and
verifying it executes the recorded actions. Drift repair can be tested
by manually breaking a selector and confirming the failure is surfaced
with actionable repair data.

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
   testid, ARIA attributes), parameterized variables, extraction
   schemas, and declares its required capabilities and allowed origins.

4. **Given** a published flow is running, **When** extraction fails
   repeatedly for a node, **Then** the system captures a bounded
   screenshot and HTML snippet, surfaces a "needs repair" notification
   in the UI with the flow contract details (schema version, sentinel
   values), and provides a reproducible "open failing run" action.

5. **Given** a flow declares required capabilities, **When** the user
   runs it for the first time, **Then** they are prompted to approve
   the capability grants. If the flow is later modified to require
   additional capabilities or origins, re-approval is required.

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
  in-page FAB functions as a plain chat interface with OpenClaw — full
  chat and browser automation capability, but no memory suggestions.
  Ingestion and watch workflows are disabled and their "Run" buttons
  show a message directing the user to enable the EMOS plugin.

- What happens when the user has EMOS configured but no memories yet?
  The command bar functions normally but shows no memory suggestions.
  The system prompts the user to run their first ingestion workflow to
  populate their knowledge base.

- What happens when a digest has no items above the relevance
  threshold? The system skips generating an empty digest and
  communicates "no new high-signal items" in the digest inbox rather
  than showing an empty list.

- What happens when two watch workflows try to ingest the same item
  from different sources? The idempotency key (source + account_id +
  source_item_id) distinguishes items by source, so the same logical
  content from different platforms creates separate entries. If the
  same item is extracted twice by the same workflow, the ledger dedupes
  it.

## Requirements _(mandatory)_

### Functional Requirements

**In-Page Assistant**

- **FR-001**: System MUST display a floating action button (FAB) on
  every webpage the user visits, without causing layout shifts or
  perceptible page load degradation.
- **FR-002**: FAB MUST expand into a text input command bar on
  hover/click with a smooth animation transition.
- **FR-003**: Command bar MUST display live related-memory suggestions
  (retrieved via OpenClaw querying EMOS) while the user types
  (debounced, minimum 3 characters). If EMOS is not configured, the
  command bar MUST function without memory suggestions.
- **FR-004**: User MUST be able to submit prompts to OpenClaw via the
  command bar, optionally including selected memory suggestions as
  context.
- **FR-005**: System MUST support an "agent mode" toggle with explicit
  per-origin capability grants (read DOM, click, type, navigate,
  download, clipboard, open tabs), a persistent on-page indicator, and
  one-click revoke.

**Sidepanel & Knowledge Base**

- **FR-006**: Extension button click MUST open the sidepanel with
  Workflows and Knowledge Base sections.
- **FR-007**: Workflows section MUST list saved workflows with name,
  last run status, and a one-click "Run" action.
- **FR-008**: Knowledge Base section MUST support searching and browsing
  EverMemOS items by keyword, source, and date, with the ability to
  open canonical URLs and delete items.
- **FR-009**: Sidepanel MUST display real-time workflow run status and
  provide access to the RR-V3 event timeline for debugging.

**EverMemOS Integration**

- **FR-010**: System MUST allow configuring the OpenClaw connection in
  the Options page with a connection test. EMOS plugin status MUST be
  displayed as read-only (EMOS is configured in OpenClaw's plugin
  settings, not in the extension). Both statuses MUST report clear
  errors with suggested next steps when unreachable.
- **FR-011**: EMOS credentials are managed by the OpenClaw EMOS plugin.
  The extension MUST NOT store or transmit EMOS secrets. Secrets MUST
  never appear in workflow definitions, extension storage, or UI
  exports/logs.
- **FR-012**: System MUST normalize extracted content into the canonical
  raw item schema (source, source_kind, content_type, account_id,
  source_item_id, thread_id, timestamp, author_id, content_text,
  content_html, media, canonical_url, debug_fingerprint).
- **FR-013**: System MUST compute stable idempotency keys using
  source + account_id + source_item_id (preferred) or normalized
  canonical_url (fallback), and derive event_id and content_hash via
  hashing.
- **FR-014**: System MUST maintain a local ingestion ledger keyed by
  event_id that tracks ingestion status, content hashes, and timestamps
  to prevent duplicate ingestion.
- **FR-015**: The extension MUST expose normalized canonical raw items
  via Chrome MCP tools so that OpenClaw can map them to EverMemOS
  messages using the identity conventions (sender = "me" for user
  content, group_id = "{platform}:{thread_id}") and ingest via its
  EMOS plugin (`addMemory`). The extension does NOT call EMOS directly.

**Workflow Execution**

- **FR-016**: Ingestion workflows MUST be idempotent: re-runs MUST NOT
  create duplicate entries. New items are ingested, changed items are
  updated, unchanged items are skipped.
- **FR-017**: Watch workflows MUST be invocable by OpenClaw's
  heartbeat/cron scheduler (one workflow per platform) and MUST use
  persistent cursor variables to avoid rescanning history.
- **FR-018**: Watch workflows MUST process items in bounded, resumable
  batches and enqueue continuation runs when more items remain, rather
  than looping within a single service worker activation.
- **FR-019**: Watch workflows MUST run in an isolated session (new
  browser window in the current profile) to reduce cross-site side
  effects.
- **FR-020**: All automated actions MUST be visible to the user and
  stoppable (pause, cancel) at any point during execution.
- **FR-021**: Flows MUST declare required capabilities and allowed
  origins. Users approve grants at first run, and re-approval is
  required if capabilities or origins expand.

**Digest System**

- **FR-022**: The extension MUST expose digest candidate items via
  Chrome MCP tools. OpenClaw scores these using freshness, engagement
  proxies, personal relevance (EMOS embedding similarity weighted by
  authored > bookmarked via EMOS plugin), and novelty (de-duplicate
  against recent digest items).
- **FR-023**: Digest cards MUST include source, timestamp, canonical
  link, short summary, and a "why it matters" explanation grounded in
  memory search results.
- **FR-024**: Users MUST be able to provide "more like this" / "less
  like this" feedback and mute specific sources or keywords, with
  preferences stored locally and applied deterministically in future
  scoring.
- **FR-025**: The extension MUST provide structured, citeable inputs
  via Chrome MCP tools (selected items with metadata, user preference
  signals) so OpenClaw can enrich them with EMOS context (via its
  plugin `searchMemory`) and produce
  the digest report. OpenClaw stores the completed digest back in the
  extension via Chrome MCP for sidepanel rendering.

**AI Authoring & Drift Repair**

- **FR-026**: System MUST expose RR-V3 management as MCP tools
  (flow/trigger/run CRUD) so external AI clients can author and operate
  workflows programmatically.
- **FR-027**: System MUST support a guided authoring flow: record
  actions, generalize selectors, parameterize variables, add
  assertions/retries, define triggers/checkpoints, and publish as a
  stable workflow with a flow contract artifact.
- **FR-028**: When extraction fails repeatedly, system MUST capture a
  bounded screenshot and HTML snippet, surface a "needs repair"
  notification with flow contract details, and provide a reproducible
  "open failing run" action for AI-assisted diagnosis.

**Security & Privacy**

- **FR-029**: MCP server MUST bind to localhost only. Sensitive tools
  MUST require an explicit user-approved session handshake.
- **FR-030**: Agent mode MUST default to off. DOM manipulation
  capabilities require explicit user opt-in per origin, with a
  persistent indicator and action log.
- **FR-031**: Flow version/hash MUST be displayed for every run.
  Silent mutation of a flow MUST NOT bypass capability re-approval.

**Modular Degradation**

- **FR-032**: Without the EMOS plugin enabled in OpenClaw, the FAB
  MUST function as a plain chat interface with OpenClaw (no memory
  suggestions). Ingestion and watch workflows MUST be disabled with
  a clear message directing the user to enable the EMOS plugin.
- **FR-033**: Without OpenClaw connected, the extension UI MUST render
  but clearly indicate that no AI assistant or workflow orchestration
  is available.

### Key Entities

- **Canonical Raw Item**: A platform-agnostic representation of
  extracted content. Attributes: source, source_kind
  (authored/bookmarked/subscribed), content_type, account_id,
  source_item_id, thread_id, timestamp, author_id, content_text,
  content_html, media, canonical_url, debug_fingerprint.

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

- **Digest Entry**: A scored, summarized item surfaced to the user.
  Attributes: digest_id, event_id, title, summary, why_it_matters,
  canonical_url, source, score, cited_memory_ids.

- **Capability Grant**: A user-approved permission for a flow to
  perform specific actions on specific origins. Attributes: flow ID,
  origin, granted capabilities, granted_at, revoked_at.

- **Subscribed Source Item**: A locally cached item from a watched
  source, stored for digest processing without ingestion into EverMemOS.
  Shares the canonical raw item schema plus local retention metadata.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can ask a question via the in-page command bar and
  see related memory suggestions within 500ms of typing on 90% of page
  loads.
- **SC-002**: Users can complete first-time setup (verify OpenClaw
  connection, confirm EMOS status) in under 2 minutes.
- **SC-003**: An ingestion workflow for one platform runs end-to-end
  and delivers all extracted items to EverMemOS with zero duplicates on
  three consecutive re-runs.
- **SC-004**: A watch workflow correctly resumes from its last cursor
  position after a browser restart, processing only new items with no
  gaps or overlaps across 10 consecutive scheduled runs.
- **SC-005**: Digest cards surface items whose "why it matters"
  explanations reference at least one specific user memory in 80% of
  cases when the user has 50+ memories in EverMemOS.
- **SC-006**: Users can stop any running workflow within 2 seconds of
  clicking pause/cancel.
- **SC-007**: The in-page FAB causes zero layout shifts and adds less
  than 50ms to page load time on 95% of pages tested.
- **SC-008**: Muting a source or keyword in the digest controls
  immediately excludes matching items from the next generated digest.
- **SC-009**: A flow authored via AI recording completes 5 consecutive
  successful test runs against the target platform before being marked
  stable.
- **SC-010**: When a workflow drifts (extraction fails), the user sees
  a "needs repair" notification with actionable details within the
  same run, not on the next run.

### Assumptions

- **OpenClaw** is the primary LLM orchestrator. Chrome MCP is the
  only MCP connection (browser tools). EMOS is integrated into
  OpenClaw via its plugin system (`evermemos-sync`), not MCP.
  OpenClaw provides heartbeat/cron for scheduling.
- **EverMemOS** is the central memory system for all of a human's
  conversations with any AI chatbot (OpenClaw, ChatGPT, Gemini, etc.).
  Configured in OpenClaw's plugin settings. The extension does not
  manage EMOS credentials or deployment. EMOS plugin is optional —
  the system degrades gracefully without it (FAB works as plain chat;
  ingestion/watch disabled).
- The user's Chrome browser is running and the extension is installed
  with appropriate host permissions.
- OpenClaw's cron-driven schedules are best-effort and only run while
  both the browser and OpenClaw are active. The UI communicates this.
- Subscribed-source items are retained locally for 30 days by default,
  with digest reports retained indefinitely (small footprint). Users
  can adjust retention in Options.
- The Chrome MCP server binds to localhost only; no LAN or remote
  access is supported for MVP.
- Two MVP platform packs ship: **ChatGPT conversations** and
  **X/Twitter posts + bookmarks**. Additional platforms are added
  iteratively.
