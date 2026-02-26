# Ruminer Browser Agent Blueprint

## 1. Document Metadata

- Version: `v0.8`
- Status: `Draft for implementation`
- Last updated: `2026-02-26`

## 2. Executive Summary

Ruminer Browser Agent is a fork of `mcp-chrome` that turns the user's everyday Chrome into a **browser agent with centralized AI chat history**. Its single mission: integrate all of a user's conversations on various AI chat platforms (ChatGPT, Gemini, Claude, DeepSeek) into a central long-term memory system, **EverMemOS (EMOS)**.

The user interacts with Ruminer through a **sidepanel** that provides:

1. A **chat interface** with OpenClaw (the LLM orchestrator), with live EMOS memory search while typing.
2. A **memory browser** for viewing and managing EMOS content.
3. A **workflow manager** for monitoring and triggering ingestion workflows.

## 3. Goals and Non-Goals

### 3.1 Goals (In Scope)

1. **Sidepanel UI** with three tabs: Chat, Memory, Workflows.
2. **Chat with memory search**: live EMOS search as user types; press Enter to send to OpenClaw; chat messages saved to EMOS.
3. **Tool group toggles**: browser tools divided into groups by effects so users can quickly enable/disable categories (e.g., allow DOM manipulation vs. read-only).
4. **Adopt RR-V3 as the automation runtime** (queue + leasing + crash recovery) for MV3 reliability.
5. **AI chat history ingestion**: build workflows that extract conversations from ChatGPT, Gemini, Claude, and DeepSeek into EMOS.

### 3.2 Non-Goals (Out of Scope)

1. Cloud multi-tenant backend (no Supabase/FastAPI “Ruminer backend” for MVP).
2. Remote headless browser runners.
3. Marketplace/sharing hub for workflows (can be added later).

### 3.3 Design Principles

1. Reliability over breadth: fewer platforms first, but high success rate.
2. Idempotent ingestion: every workflow rerun is safe.
3. Reusable automation: workflows are parameterized, versioned, and reproducible.
4. Human control: user can approve / take over at authentication and sensitive steps.

## 4. Architecture Overview

### 4.1 System Diagram

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
|   - Tool group enforcement (both layers, see §4.3)               |
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

**Key architectural principles**:

1. **One protocol: `browser.proxy`.** The Chrome extension connects to the OpenClaw Gateway via WebSocket as a **node** (role: `"node"`, caps: `["browser"]`). It implements a **superset** of OpenClaw's browser route dispatcher — standard routes (snapshot, act, navigate, tabs) are handled by OpenClaw's built-in `browser` tool; extension-specific routes (bookmarks, history, network, flows, ledger, element selection) are registered by a thin `browser-ext` plugin. All routes use the same `{ method, path, query, body }` protocol. No separate MCP server, Native Messaging, or MCP authentication.
2. **Dual EMOS integration paths.** OpenClaw's `evermemos` plugin auto-ingests OpenClaw conversations and exposes `addMemory`/`searchMemory` to the agent. The Chrome extension has its own **direct EMOS client** for autonomous ingestion workflows (RR-V3 triggers extraction and writes to EMOS without OpenClaw involvement).
3. **Extension owns tool group enforcement.** Both prompt-layer restriction (injected when the extension sends `chat.send` to OpenClaw) and runtime-layer rejection (dispatcher rejects disabled routes) live entirely in the extension. The `browser-ext` plugin has no knowledge of tool groups.

### 4.2 Responsibility Boundaries

1. **OpenClaw Gateway + Plugins**
   - Primary LLM orchestrator. The extension connects via Gateway WebSocket.
   - **Built-in `browser` tool**: OpenClaw ships with a `browser` tool that translates agent actions (snapshot, act, navigate, tabs, etc.) into `browser.proxy` commands routed to the extension node. No plugin needed for standard browser automation.
   - **`evermemos` plugin**: auto-ingests all OpenClaw conversations into EMOS; exposes `evermemos.addMemory` and `evermemos.searchMemory` as gateway methods callable by the agent. Persistent queue with retry for reliability.
   - **`browser-ext` plugin**: registers one additional tool (`browser-ext`) that maps extension-specific actions (bookmarks, history, network requests, flow management, ledger queries, element selection) to `browser.request` gateway calls, which route to the extension node as `browser.proxy` commands. The plugin is a pure action→route mapping with no logic, no hooks, and no knowledge of tool groups.
   - The agent can also orchestrate ingestion on-demand: user asks "ingest my ChatGPT history" → agent uses browser tools to extract, then `evermemos.addMemory` to store.
   - Responds to user commands from the sidepanel chat.

2. **Extension background service worker**
   - **Gateway WS client**: connects with `role: "node"`, declares `caps: ["browser"]`. Handles `browser.proxy` commands by dispatching to a superset route dispatcher and returning results via WS.
   - **Superset route dispatcher**: implements all of OpenClaw's standard browser routes (`/snapshot`, `/act`, `/navigate`, `/tabs`, etc.) plus extension-specific routes (`/bookmarks/*`, `/history`, `/network/*`, `/flow/*`, `/ledger/*`, `/element-selection`). All routes use the same `{ method, path, query, body }` protocol.
   - **Sidepanel chat**: sends/receives messages via Gateway WS `chat.*` methods. Injects tool group restrictions into the system prompt when sending `chat.send` (prompt-layer enforcement).
   - **EMOS client (direct)**: calls the EverMemOS API directly for autonomous ingestion workflows. EMOS credentials are configured in the extension's Options page.
   - Owns the **RR-V3 runtime** (queue, leasing, triggers, crash recovery, event log).
   - Owns Ruminer local services: ingestion normalization + idempotency ledger.
   - **Tool group enforcement (both layers)**: (1) prompt layer — when sending chat messages to OpenClaw, the extension prepends instructions listing disabled tools/actions; (2) runtime layer — the route dispatcher rejects `browser.proxy` requests for routes in disabled groups.
   - Emits events to UI for observability.

3. **Content scripts**
   - Perform DOM interaction and extraction on AI chat platforms.
   - Capture recording events (until a V3-native recorder exists).

4. **EverMemOS (dual integration)**
   - Source-of-truth for long-term memory — the central memory system for all of a human's conversations with any AI chatbot (OpenClaw, ChatGPT, Gemini, etc.).
   - **Path A — OpenClaw plugin**: the `evermemos` plugin auto-ingests OpenClaw conversations and exposes `addMemory`/`searchMemory` to the agent.
   - **Path B — Extension direct**: the extension's EMOS client calls the EMOS API directly during autonomous ingestion workflows (RR-V3 triggered). This path does not require OpenClaw to be running.

5. **Modular degradation**
   - Without OpenClaw Gateway running: autonomous ingestion workflows still work (extension → EMOS direct). Sidepanel chat is unavailable; Memory tab can still function if EMOS credentials are configured in the extension.
   - Without EMOS credentials in the extension: sidepanel chat works (via OpenClaw), but autonomous ingestion workflows cannot write to EMOS.
   - Without both: extension UI renders but clearly indicates no AI assistant or memory system is available.

### 4.3 Trust Boundaries and Capabilities

Ruminer treats "who is asking the browser to do things" as a first-class concept:

1. **Gateway WS is the only external interface**
   - The extension connects to the OpenClaw Gateway via WebSocket (localhost). The Gateway authenticates the connection with a WS auth token. No separate MCP endpoint, no Native Messaging, no additional auth mechanism.
   - Tool calls arrive only via authenticated `node.invoke` from the Gateway.
2. **Tool groups enforced at two layers — both in the extension**
   - **Prompt layer (extension chat client)**: when the extension sends a message to OpenClaw via `chat.send`, it prepends a system instruction listing disabled tools/actions. This tells the LLM not to call them.
   - **Runtime layer (extension dispatcher)**: the `browser.proxy` route dispatcher rejects requests for routes in disabled groups. This is the hard enforcement — even if the LLM ignores the prompt restriction, the extension refuses.
   - The `browser-ext` plugin has no knowledge of tool groups. All enforcement logic is self-contained in the extension.
3. **Flows are executable code**
   - A saved flow is an executable artifact; runs must always show the exact flow version/hash that was executed.
   - Flow permissions/capabilities should be declared and enforced at runtime.
4. **Tool groups as capability boundaries**
   - Tools are divided into groups by side-effect level (see §8.2).
   - Users can enable/disable entire groups from the sidepanel.
   - Host permissions and runtime capabilities should align (progressive permissions).

## 5. EverMemOS Integration Model

### 5.1 Configuration

EMOS credentials are configured in **two places**, each serving a different integration path:

1. **OpenClaw's `evermemos` plugin** (`openclaw.plugin.json`): EMOS base URL, API key, tenant/space IDs. The plugin auto-ingests all OpenClaw conversations into EMOS (via `message_received` hook) and exposes `evermemos.addMemory` / `evermemos.searchMemory` as gateway methods callable by the agent. Includes a persistent queue with retry for reliability.

2. **Chrome extension Options page**: EMOS base URL, API key, tenant/space IDs (same values, configured separately). Used by the extension's direct EMOS client for autonomous ingestion workflows. Stored in `chrome.storage.local`.

Both paths target the same EMOS instance. The duplication is intentional — it allows autonomous ingestion to work independently of whether OpenClaw is running.

### 5.2 Ruminer Identity Conventions (Single-User Local)

Ruminer runs as a single local user, and uses simple, human-readable sender IDs.

- `sender` (EverMemOS `user_id`):
  - User messages: `me`
  - AI assistant replies: `{platform}` (e.g., `chatgpt`, `gemini`, `claude`, `deepseek`)
  - OpenClaw agent replies (from sidepanel chat): `agent`
- `group_id`: `{platform}:{conversation_id}`
  - `conversation_id` is the platform-native conversation/thread ID.

### 5.3 Canonical Raw Item Schema

All workflows normalize extracted chat messages into a canonical raw item (before hashing/dedup):

```json
{
  "source": "chatgpt|gemini|claude|deepseek",
  "content_type": "message",
  "account_id": "my_handle_or_user_id",
  "source_item_id": "platform_immutable_message_id",
  "conversation_id": "platform_conversation_id",
  "conversation_title": "Optional conversation title",
  "timestamp": "2026-02-25T01:23:45Z",
  "updated_at": "2026-02-25T01:23:45Z",
  "role": "user|assistant|system",
  "model_id": "optional_model_identifier",
  "content_text": "Plain text content",
  "content_html": "<p>Optional HTML</p>",
  "language": "en",
  "media": [{ "type": "image|file", "url": "https://..." }],
  "canonical_url": "https://...",
  "parent_message_id": "optional_parent_message_id",
  "debug_fingerprint": {
    "extraction_schema_version": 1,
    "sentinels": ["optional anchor text / aria label / testid"],
    "page_kind": "optional"
  },
  "raw_payload": {}
}
```

Notes on granularity:

- Prefer **one canonical raw item per message/turn** (sender = `me` or the AI model) with `group_id = {source}:{conversation_id}` so EMOS can preserve conversational structure.
- Each message in a conversation is a separate item with `parent_message_id` linking to the prior turn when available.

### 5.4 Idempotency Keys

Ruminer dedupes at the item level with stable keys:

```text
item_key = one_of(
  source + "|" + account_id + "|" + source_item_id,   # preferred
  source + "|" + account_id + "|" + normalize_url(canonical_url)  # fallback
)

event_id     = sha256(item_key)
content_hash = sha256(normalize(content_text) + "|" + normalize(content_html))
```

Rules:

1. Every workflow **must** produce a stable `item_key`.
2. Re-runs update the same `event_id` when content changes (new `content_hash`).
3. Ruminer maintains an **ingestion ledger** keyed by `event_id` to ensure reruns are safe.

### 5.5 EverMemOS Message Mapping

Each canonical item becomes exactly one EverMemOS message:

```json
{
  "message_id": "ruminer:{event_id}",
  "create_time": "2026-02-25T01:23:45+00:00",
  "sender": "me",
  "sender_name": "Me",
  "content": "content_text (optionally prefixed with minimal metadata)",
  "refer_list": ["ruminer:{parent_event_id}"],
  "group_id": "chatgpt:conv_abc123",
  "group_name": "ChatGPT: My conversation title",
  "scene": "group_chat"
}
```

Notes:

1. Prefer `message_id = ruminer:{event_id}` for strict idempotency.
2. Use `refer_list` for message chains when `parent_message_id` is available.
3. Use `group_id` to preserve conversation context for EMOS boundary detection and episodic extraction.
4. For AI assistant messages, set `sender = {platform}:{model_id}` and `sender_name = model_display_name`.
5. EverMemOS supports **idempotent upsert** by `message_id` (create-or-update). Ruminer should still keep the local ledger as the first line of defense for idempotency and debugging.

### 5.6 Ingestion Ledger (Local)

Ruminer maintains a local idempotency ledger in IndexedDB (`ruminer.ingestion_ledger`) keyed by `event_id`.

Minimum record:

```json
{
  "event_id": "sha256...",
  "item_key": "source|account_id|source_item_id",
  "content_hash": "sha256...",
  "canonical_url": "https://...",
  "group_id": "{platform}:{conversation_id}",
  "sender": "me",
  "evermemos_message_id": "ruminer:{event_id}",
  "first_seen_at": "2026-02-25T01:23:45Z",
  "last_seen_at": "2026-02-25T01:23:45Z",
  "last_ingested_at": "2026-02-25T01:25:00Z",
  "status": "ingested|skipped|failed",
  "last_error": "optional"
}
```

Rules:

1. If `event_id` is new -> ingest.
2. If `event_id` exists and `content_hash` changed -> ingest update (same message_id).
3. Cursor updates happen only after `status=ingested`.

## 6. Workflow Runtime: Record-and-Replay V3 (RR-V3)

Ruminer standardizes on RR-V3 as the execution runtime because MV3 service workers can be restarted at any time.

RR-V3 provides:

1. **Flows** (`FlowV3`) as a DAG with explicit `entryNodeId`.
2. **Triggers** (`TriggerSpec`) for `interval`, `cron`, `url`, `dom`, `command`, `contextMenu`, `once`, `manual`.
3. A **queue + leasing** scheduler so runs survive SW restarts.
4. **Crash recovery** to re-queue interrupted runs.
5. **Run events** persisted as an append-only event log for UI debugging and auditing.
6. **Persistent variables** (keys like `$cursor.*`) for checkpoints across runs.

Operational note:

- Scheduled triggers are **best-effort** and only run while the browser is running (MV3 cannot wake a fully closed Chrome reliably). Ruminer should communicate this clearly in the UI and provide "Run now" actions.

### 6.1 RR-V3 Constraints (Important)

RR-V3 validates that flows are **acyclic** (DAG only). This means:

- No graph-level loops / cycles.
- No `foreach` / `while` / `subflows` support today (conversion rejects them).

Ruminer's approach:

1. Keep the graph DAG-shaped.
2. Implement pagination/scrolling/iteration as **composite Ruminer nodes** that loop internally but still return a single node result.

### 6.2 Ruminer Node Strategy

RR-V3 can execute nodes via a plugin registry (Zod-validated configs). Ruminer adds nodes for **browser-side** extraction and local bookkeeping:

- `ruminer.extract_conversations` (list conversations, paginate, return conversation IDs + metadata)
- `ruminer.extract_messages` (open a conversation and extract messages as canonical raw items)
- `ruminer.normalize_and_hash` (compute `event_id`, `content_hash`, validate required fields)
- `ruminer.ledger_upsert` (idempotency ledger -- local)

- `ruminer.emos_ingest` (write canonical items to EMOS via the extension's direct EMOS client)

For autonomous ingestion workflows (RR-V3 triggered), the full pipeline runs inside the extension: extract → normalize → ledger check → EMOS ingest → cursor update. OpenClaw is not involved. When the user explicitly asks OpenClaw to ingest ("ingest my ChatGPT history"), the agent can orchestrate the same steps via browser tools + `evermemos.addMemory`.

### 6.3 Checkpoints via Persistent Vars

We store run-to-run cursors in RR-V3 persistent vars (IndexedDB store `persistent_vars`):

- `$cursor.{workflow_id}.last_seen_time`
- `$cursor.{workflow_id}.last_seen_conversation_id`

Cursor update happens only after successful ingestion + ledger update.

### 6.4 Chunked Iteration + Continuations (MV3-Friendly)

Because MV3 service workers can restart mid-run, any "scroll/paginate over many conversations" work should be designed as a sequence of small, resumable chunks:

1. Process a bounded batch (e.g., 20-50 conversations max) per run.
2. Persist progress (`$cursor.*`, plus any continuation token) after each successful ingest.
3. If more work remains, enqueue a follow-up run ("continuation") rather than looping for minutes inside a single composite node.

## 7. Ingestion Workflows

### 7.1 Goal

Reliably ingest a user's AI chat conversations into EMOS, one platform at a time.

### 7.2 MVP Platform Packs

- **ChatGPT**: conversation list -> conversation thread -> messages.
- **Gemini**: conversation list -> conversation thread -> messages.
- **Claude**: conversation list -> conversation thread -> messages.
- **DeepSeek**: conversation list -> conversation thread -> messages.

Additional AI platforms can be added iteratively post-MVP.

### 7.3 Characteristics

- **Primary path (autonomous)**: RR-V3 triggers the workflow inside the extension. The extension performs browser automation (Chrome APIs), extracts content, normalizes it, checks the ledger, and writes to EMOS directly via its own EMOS client. OpenClaw is not involved.
- **Alternative path (agent-driven)**: user asks OpenClaw to ingest. The agent uses browser tools (built-in `browser` tool + `browser-ext` tool) routed to the extension node to extract, then `evermemos.addMemory` to store. This path requires OpenClaw to be running.
- Runs on demand (user clicks "Run" in sidepanel Workflows tab) and optionally on a schedule for backfill.
- Prioritizes correctness, idempotency, and stable IDs.
- Each platform workflow follows the same pattern:
  1. Navigate to the platform's conversation list.
  2. Extract conversation metadata (IDs, titles, timestamps).
  3. For each conversation (or new conversations since last cursor), open and extract messages.
  4. Normalize each message into the canonical raw item schema.
  5. Check ledger, ingest new/changed items to EMOS (direct API call from extension).
  6. Update cursor on success.

### 7.4 Platform-Specific Notes

- **Authentication**: All platforms require the user to be logged in. Workflows detect auth state and pause with an "action required: please log in" notification if not authenticated.
- **Rate limiting**: Workflows should include configurable and randomized delays between page loads to avoid triggering platform rate limits or anti-bot mechanisms.
- **Conversation selection**: Users can optionally filter which conversations to ingest (e.g., conversation length, date range).

## 8. UI/UX (Extension)

The main UI of the Ruminer extension is a sidepanel, which serves as the single interface to OpenClaw -- users chat, browse memory, and manage workflows all within the panel.

### 8.1 Surfaces

1. **Sidepanel (opens on extension button click)** -- the primary and only UI surface.
   - **Chat tab**: text input with live EMOS search, full chat with OpenClaw.
   - **Memory tab**: browse/search/manage EMOS items.
   - **Workflows tab**: run, schedule, and monitor ingestion workflows.
2. **Options page**
   - OpenClaw Gateway connection settings (WS URL + auth token + connection test).
   - EMOS connection settings (base URL, API key, tenant/space IDs + connection test). Used for autonomous ingestion.
   - Tool group default toggles.
   - Debug mode / logging level.

### 8.2 Tool Groups

Browser tools are divided into groups by side-effect level. Users can toggle entire groups on/off from the sidepanel chat UI. This replaces the binary "readonly mode vs agent mode" with more granular control.

| Group        | Side Effects                      | Tools                                                                                                                                                                                                                           | Default |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Observe**  | None (read-only)                  | `get_windows_and_tabs`, `chrome_read_page`, `chrome_get_web_content`, `chrome_screenshot`, `chrome_computer` (screenshot/zoom), `chrome_history`, `chrome_bookmark_search`, `chrome_console`, `chrome_get_interactive_elements` | On      |
| **Navigate** | Changes active page/tab           | `chrome_navigate`, `chrome_switch_tab`, `chrome_close_tabs`                                                                                                                                                                     | On      |
| **Interact** | DOM manipulation                  | `chrome_click_element`, `chrome_fill_or_select`, `chrome_keyboard`, `chrome_computer` (click/type/drag/scroll), `chrome_handle_dialog`, `chrome_request_element_selection`                                                      | Off     |
| **Execute**  | Code execution, network, file I/O | `chrome_javascript`, `chrome_network_request`, `chrome_network_capture`, `chrome_upload_file`, `chrome_handle_download`                                                                                                         | Off     |
| **Workflow** | Record and replay                 | `flow_record_start`, `flow_record_stop`, `flow_save`, `flow_list`, `flow_run`                                                                                                                                                   | On      |

Notes:

- When a tool group is disabled, two enforcement layers activate (both in the extension):
  1. **Prompt layer**: when the extension sends a chat message to OpenClaw via `chat.send`, it prepends a system instruction listing disabled tools/actions. The LLM sees these restrictions as part of the conversation context.
  2. **Runtime layer**: the extension's `browser.proxy` route dispatcher rejects requests for routes in disabled groups, returning an error to the agent.
- The `browser-ext` plugin has no knowledge of tool groups. All enforcement is self-contained in the extension — no callback or sync needed.
- Ingestion workflows may temporarily require **Interact** and **Navigate** groups to function. The workflow runner can request elevation, and the user approves from the sidepanel.
- Tool group state is persisted in `chrome.storage.local`.

### 8.3 Sidepanel Chat Tab (MVP)

The Chat tab is the primary interaction surface.

1. **Empty state (search mode)**
   - Text input at the bottom.
   - As user types (debounced, minimum 3 characters), live EMOS memory search results appear in the panel (via OpenClaw -> EMOS plugin `searchMemory`).
   - Results show source, timestamp, and content snippet.
   - If EMOS plugin is not enabled, no search results appear.

2. **Send message (transition to chat mode)**
   - User presses Enter to send their input to OpenClaw.
   - The panel transitions to chat mode, showing the conversation thread.
   - Subsequent messages continue in chat mode.
   - Chat messages (user + assistant) are auto-ingested into EMOS via OpenClaw's EMOS plugin.

3. **Chat mode**
   - Standard chat UI: messages from user and assistant, with tool call results shown inline (expandable, with status indicators).
   - Tool group toggles accessible from the chat header or a toolbar.
   - "New chat" button to return to empty state / search mode.

4. **Tool group controls**
   - Compact toggle UI (e.g., icon buttons or chips) in the chat header.
   - Visual indicator of which groups are active.
   - Toggling a group immediately updates the extension's enforcement table. The next `chat.send` will include the updated restriction prompt.

### 8.4 Sidepanel Memory Tab (MVP)

1. Search/browse EMOS items (messages from all AI platforms + OpenClaw conversations).
2. Filter by source platform, date range, keyword.
3. View item details: full content, conversation context, canonical URL.
4. Basic management: open canonical URL in new tab, delete items.

### 8.5 Sidepanel Workflows Tab (MVP)

1. List of saved ingestion workflows with:
   - Platform name and icon.
   - Last run status (success/failed/never run) and timestamp.
   - One-click "Run" button.
2. Active run progress: current step, items processed, errors.
3. Run history with RR-V3 event timeline for debugging.
4. "Stop" control for active runs.

### 8.6 UX Requirements

1. Every automated action is visible and stoppable (run controls).
2. Tool group toggles are always accessible during chat.
3. Clear visual feedback when the agent uses tools (inline tool call cards with status).
4. Smooth transition between search mode and chat mode.

## 9. AI-Assisted Workflow Authoring

OpenClaw is the authoring assistant. It can:

1. Start a recording session (capture actions).
2. Ask the user to perform required login steps if needed.
3. Convert/clean the recording into a reusable workflow:
   - parameterize user handles
   - add invariants (URL patterns, required labels)
   - add extraction schemas and validation rules
   - define triggers and checkpoints
4. Run test executions and iterate until stable.

### 9.1 Authoring Loop (Recommended)

1. **Record baseline** (capture the "happy path").
2. **Generalize**:
   - replace brittle selectors with stable candidates (data-testid/ARIA)
   - turn constants into variables
3. **Stabilize**:
   - add assertions and screenshots on failure
   - add timeouts/retries at node policy level
4. **Schedule + cursor**:
   - add a manual or interval trigger
   - implement cursor update via persistent vars
5. **Publish**:
   - mark as "stable"
   - generate a "flow contract" artifact (capabilities, allowed origins, auth checks, cursor/checkpoint keys, max items per run, extraction schema version, drift sentinels)

### 9.2 Tool Surface

OpenClaw's built-in `browser` tool covers standard automation (snapshot, act, navigate, tabs, screenshot, console, dialog, file upload). The `browser-ext` plugin registers one additional tool (`browser-ext`) for extension-specific capabilities, routed to the extension node as `browser.proxy` requests:

1. **Flows**
   - `rr_v3.flow.list`, `rr_v3.flow.get`, `rr_v3.flow.save`, `rr_v3.flow.delete`
2. **Triggers**
   - `rr_v3.trigger.list`, `rr_v3.trigger.get`, `rr_v3.trigger.create`, `rr_v3.trigger.update`, `rr_v3.trigger.enable/disable`, `rr_v3.trigger.delete`, `rr_v3.trigger.fire`
3. **Runs**
   - `rr_v3.run.enqueue`, `rr_v3.run.list`, `rr_v3.run.get`, `rr_v3.run.events`, `rr_v3.run.pause/resume/cancel`
4. **Ruminer**
   - `ruminer.ledger.status/query`

## 10. Reliability and Drift Handling

### 10.1 Execution Reliability (MV3)

RR-V3 provides:

- run queue + leasing (prevents duplicate concurrent execution)
- crash recovery (SW restart -> requeue)
- event log (debuggable failures)

Ruminer adds:

- platform-specific invariant checks (e.g., "am I on the conversation list page?")
- auth health checks (signed-in detection)
- explicit "action required" states (user must log in / solve CAPTCHA)

### 10.2 Idempotency End-to-End

Idempotency is enforced in three places:

1. `event_id` + ledger (local): prevents duplicate ingest within Ruminer.
2. EverMemOS `message_id = ruminer:{event_id}`: prevents duplicates server-side.
3. Cursor update only on success: prevents "skipping" items.

### 10.3 Drift Repair Workflow

When extraction fails repeatedly:

1. capture screenshot + HTML snippet (bounded) + flow contract details (schema version + sentinels)
2. surface a "needs repair" task in UI with a reproducible "open failing run" action
3. allow OpenClaw to open the failing page and patch the workflow
4. (recommended) store a small library of failing HTML snippets for extractor regression tests

## 11. Security, Privacy, and Permissions

1. **Local-first**: all browser control happens locally via the extension. Communication with the Gateway is localhost WebSocket only.
2. **Minimal permissions**: request host permissions per platform pack (ChatGPT, Gemini, Claude, DeepSeek domains) plus EMOS API host. No `<all_urls>` needed since there is no FAB injection.
3. **Secret handling**:
   - EMOS credentials are stored in two places: OpenClaw's `evermemos` plugin config and the extension's `chrome.storage.local` (for autonomous ingestion). Both are local-only.
   - Gateway WS auth token is stored in `chrome.storage.local`.
   - Do not embed secrets in flows.
   - Redact tokens/cookies in logs and UI exports.
4. **Safe automation**:
   - Default to read-only tool groups (Observe + Navigate on, Interact + Execute off).
   - Ingestion workflows request tool group elevation when needed; user approves.
5. **Gateway access control**:
   - Gateway binds to localhost only (no LAN exposure).
   - Tool group enforcement at two layers, both in the extension: prompt injection (via `chat.send`) and runtime rejection (route dispatcher). See §4.3. The `browser-ext` plugin has no role in enforcement.
   - WS auth token required for the extension to connect as a node.
6. **Flow integrity**
   - Display flow version/hash for every run.
   - Prevent silent mutation: if a flow changes, require re-approval for capabilities that expanded.

## 12. Implementation Plan (Phased)

### Phase 1 -- Foundation + Sidepanel + First Platform Pack

1. Fork `mcp-chrome` and rebrand UI copy/IA for Ruminer. **Deprecate `app/native-server`** — it is no longer used.
2. Implement **Gateway WS client** in the extension background SW: connect as `role: "node"` with `caps: ["browser"]`, implement `browser.proxy` superset dispatcher (standard routes + extension routes), implement `chat.*` methods for sidepanel.
3. Implement the **`browser-ext` OpenClaw plugin**: register one `browser-ext` tool that maps extension-specific actions to `browser.request` gateway calls. Pure action→route mapping, no hooks, no logic.
4. Configure the extension button to open the Sidepanel with three tabs (Chat, Memory, Workflows).
5. Implement sidepanel Chat tab: text input, live EMOS search (via OpenClaw), send message to OpenClaw (with tool group restriction prompt), chat mode with inline tool call display.
6. Implement tool group system: divide browser tools into groups, add toggle UI in sidepanel, implement dual enforcement in the extension (prompt injection in `chat.send` + runtime rejection in route dispatcher).
7. Add Options UI for OpenClaw Gateway connection (WS URL + token + test), EMOS connection (base URL + API key + test), tool group defaults, and debug settings.
8. Implement **extension EMOS client** for autonomous ingestion (direct API calls).
9. Implement Ruminer ingestion ledger + hashing utilities (local to extension).
10. Build the first platform pack: **ChatGPT conversations**. Run end-to-end via RR-V3 with the extension autonomously extracting and writing to EMOS.

### Phase 2 -- Remaining Platforms + Memory Tab

1. Build platform packs for **Gemini**, **Claude**, and **DeepSeek**.
2. Implement sidepanel Memory tab: search/browse EMOS items, filter by platform/date, view details, delete.
3. Implement sidepanel Workflows tab: list workflows, one-click run, active run progress, run history with event timeline.

### Phase 3 -- AI Authoring + Repair

1. Expose RR-V3 management APIs as extension routes (flow/trigger/run CRUD), accessible via the `browser-ext` plugin's `browser-ext` tool.
2. Guided authoring flow in UI (record -> generalize -> test -> schedule -> publish).
3. Drift repair workflow + run artifacts viewer.
4. Extractor regression tests from saved HTML snippets for platform packs.

## 13. MVP Acceptance Criteria

1. User can configure OpenClaw Gateway connection (WS URL + token) and EMOS connection (base URL + API key) in Options. Both show connection test results.
2. Extension connects to Gateway as a node and handles `node.invoke` for browser tool calls.
3. Sidepanel opens on extension button click with Chat, Memory, and Workflows tabs.
4. Chat tab supports live EMOS search while typing (in empty state), transitions to chat mode on Enter, and shows inline tool call results. Chat messages are ingested into EMOS via OpenClaw's `evermemos` plugin.
5. Tool group toggles are accessible in the chat UI. Disabled groups are enforced at both prompt level (extension injects restriction prompt into `chat.send`) and runtime level (extension route dispatcher rejects disabled routes).
6. ChatGPT ingestion workflow runs end-to-end autonomously (extension extracts via Chrome APIs, writes to EMOS via direct API) and is idempotent (no duplicates on rerun).
7. RR-V3 run history and event timeline is visible in the Workflows tab for debugging.
8. Tool groups default to safe settings (Observe + Navigate on, Interact + Execute off). Workflows can request elevation with user approval.

## 14. Future Features

1. **Additional AI platforms**: expand ingestion to more AI chat services as they emerge.
2. **Social media ingestion**: X/Twitter, Reddit, YouTube posts/bookmarks (broader content types).
3. **Watch workflows**: periodic monitoring of subscribed content feeds.
4. **Digest/feed reader**: high-signal digest generation from watched content.
5. **Voice input**: microphone affordance in sidepanel chat.
6. **In-page FAB**: floating assistant overlay on webpages (reintroduce if needed).

## 15. Open Questions

1. ~~**MCP authentication**~~: **Resolved.** No MCP server exists. The extension authenticates to the Gateway via WS auth token. No additional auth mechanism needed.
2. ~~**OpenClaw <-> Extension communication**~~: **Resolved.** The extension connects to the OpenClaw Gateway via WebSocket as a node (`role: "node"`). Tool calls arrive via `node.invoke`; chat flows via `chat.*` methods. No separate protocol needed.
3. **Tool group granularity**: is the five-group division (Observe/Navigate/Interact/Execute/Workflow) the right granularity, or should some groups be split/merged?
4. **EMOS credential sync**: should the extension auto-discover EMOS credentials from the OpenClaw Gateway (if the `evermemos` plugin is loaded), or always require separate manual configuration in the extension Options?
