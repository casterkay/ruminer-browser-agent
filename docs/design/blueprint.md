# Ruminer Browser Agent Blueprint

## 1. Document Metadata

- Version: `v0.4`
- Status: `Draft for implementation`
- Last updated: `2026-02-25`

## 2. Executive Summary

Ruminer Browser Agent is a fork of `mcp-chrome` that turns the user’s everyday Chrome into:

1. A **personal content collector** that can ingest the user’s content across platforms into EverMemOS (EMOS).
2. A **workflow runtime** for reliable, versioned browser automation using **Record-and-Replay V3 (RR‑V3)**.
3. A **personalized digest reader** that periodically monitors subscribed sources and surfaces high-signal information according to the user’s EMOS memory (without storing subscribed-source content into EMOS).

## 3. Goals and Non-Goals

### 3.1 Goals (In Scope)

1. **Upgrade extension UI** to support:
   - In-page assistant (animated FAB + command bar) for text queries
   - Live related-memory suggestions while typing (grounded in EMOS)
   - Sidepanel control center: workflow runs + knowledge base management + digests
   - Permissioned “agent mode” to allow DOM manipulation on the current page
2. **Adopt RR‑V3 as the automation runtime** (queue + leasing + crash recovery) for MV3 reliability.
3. **Create reusable, AI-assisted workflows** that ingest personal content from multiple platforms into EMOS.
4. **Create periodic monitoring workflows** that read new content from subscribed sources and produce high-signal digests for the user.

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
+-------------------------------+          MCP (HTTP/SSE)           +------------------------------+
| MCP-capable LLM client        | <-------------------------------> | Native Server (Node.js)      |
| (Claude Code / Codex / etc.)  |                                   | mcp-chrome-bridge (MCP srv)  |
| - author workflows            |                                   | - tool registry              |
| - invoke tools                |                                   | - native messaging bridge    |
| - chat                        |                                   +---------------+--------------+
+---------------+---------------+                                                   |
                |                                                                   | Chrome Native Messaging
                |                                                                   v
                |                                   +-------------------------------+------------------------------+
                |                                   | Chrome Extension (Manifest V3)                               |
                |                                   | - UI: in-page assistant / sidepanel / builder / options      |
                |                                   | - Background SW: RR-V3 runtime + Ruminer services            |
                |                                   | - Content scripts: DOM read/act + record/observe             |
                |                                   | - Offscreen doc (optional): heavy compute / parsing          |
                |                                   +-------------------------------+------------------------------+
                |                                                                   |
                |                                                                   | HTTPS (server-to-server style)
                |                                                                   v
                |                                   +-------------------------------+------------------------------+
                +---------------------------------> | EverMemOS API (EMOS)                                         |
                                                    | - /api/v1/memories (ingest)                                  |
                                                    | - /api/v1/memories/search (retrieve)                         |
                                                    | - /api/v3/agentic/* (optional, higher-level retrieval)       |
                                                    +--------------------------------------------------------------+
```

### 4.2 Responsibility Boundaries

1. **Native host (`mcp-chrome-bridge`)**
   - Presents an MCP server (HTTP/SSE) to external LLM clients, e.g. OpenClaw.
   - Proxies tool calls to the extension via native messaging.
   - (Optional) Holds local config and secrets if we choose not to store them in the extension.

2. **Extension background service worker**
   - Owns the **RR‑V3 runtime** (queue, leasing, triggers, crash recovery, event log).
   - Owns Ruminer domain services:
     - EverMemOS connector
     - Ingestion normalization + idempotency ledger
     - Digest generator (high-signal selection)
   - Emits events to UI and to the MCP tool layer for observability.

3. **Content scripts**
   - Perform DOM interaction and extraction.
   - Render in-page assistant UI (FAB + command bar) as a page overlay.
   - Capture recording events (until a V3-native recorder exists).

4. **EverMemOS**
   - Source-of-truth for long-term memory.
   - Provides hybrid retrieval and (optionally) agentic retrieval to ground “high-signal” selection.

### 4.3 Trust Boundaries and Capabilities (Recommended)

Ruminer should treat “who is asking the browser to do things” as a first-class concept:

1. **MCP client is not inherently trusted**
   - Any process that can reach the MCP endpoint can potentially request powerful actions.
   - Ruminer must gate sensitive tools behind explicit user approval and capability grants.
2. **Flows are executable code**
   - A saved flow is an executable artifact; runs must always show the exact flow version/hash that was executed.
   - Flow permissions/capabilities should be declared and enforced at runtime (not just in UI copy).
3. **Per-origin + per-capability enforcement**
   - “Read DOM” vs “click/type/navigate” vs “download/export” should be separate capabilities.
   - Host permissions and runtime capabilities should align (progressive permissions).

## 5. EverMemOS Integration Model

### 5.1 Configuration

EverMemOS requests require an API key:

- `X-API-Key` (or deployment-specific auth header)

Ruminer stores this in the **native host** (MVP), and never embeds it in workflow definitions.

### 5.2 Ruminer Identity Conventions (Single-User Local)

Ruminer runs as a single local user, and uses simple, human-readable sender IDs.

- `sender` (EverMemOS `user_id`):
  - User-authored content: `me`
  - Ruminer agent replies (optional): `assistant`
  - Followed/external author (optional): `{platform}:{author_id}`
  - External agents/models (optional): `anthropic/claude-sonnet-4`, `openai/gpt-4.1`, etc.
- `group_id`: `{platform}:{thread_id}`
  - `thread_id` is a platform-native thread/conversation/post ID.
  - For feeds without a thread, use a synthetic thread like `feed:{source_id}`.

### 5.3 Canonical Raw Item Schema

All workflows normalize extracted content into a canonical raw item (before hashing/dedup):

```json
{
  "source": "x|reddit|youtube|chatgpt|...",
  "source_kind": "authored|bookmarked|subscribed",
  "content_type": "post|comment|message|video|article|...",
  "account_id": "my_handle_or_user_id",
  "source_item_id": "platform_immutable_id",
  "thread_id": "platform_thread_or_post_id",
  "timestamp": "2026-02-25T01:23:45Z",
  "updated_at": "2026-02-25T01:23:45Z",
  "author_id": "platform_author_id",
  "author_name": "Display Name",
  "title": "Optional title",
  "content_text": "Plain text content",
  "content_html": "<p>Optional HTML</p>",
  "language": "en",
  "media": [{ "type": "image|video|link|file", "url": "https://..." }],
  "canonical_url": "https://...",
  "reply_to_item_id": "optional_parent_item_id",
  "debug_fingerprint": {
    "extraction_schema_version": 1,
    "sentinels": ["optional anchor text / aria label / testid"],
    "page_kind": "optional"
  },
  "raw_payload": {}
}
```

Notes on `source_kind`:

- `authored`: user-authored content. Primary signal for EMOS memory.
  - Conversations on ChatGPT, Gemini, Claude, DeepSeek
  - X/Twitter, Reddit, YouTube, Threads, Tiktok/Douyin, RedNote, Bilibili, Zhihu posts/comments
  - Google Keep Notes, Apple Notes (in browser)
- `bookmarked`: user-saved content. Secondary signal for EMOS memory.
  - Browser bookmarks
  - GitHub stars
  - X/Twitter, Reddit, YouTube, Threads, Tiktok/Douyin, RedNote, Bilibili, Zhihu bookmarks/collections
  - Readwise highlights & articles (https://readwise.io/everything)
- `subscribed`: user-subscribed content stream. Digested into a single high-signal feed.
  - X/Twitter, Reddit, YouTube, Threads, Tiktok/Douyin, RedNote, Bilibili, Zhihu subscriptions/follows
  - (later) RSS feeds, newsletters

Notes on granularity:

- For “chat” sources (ChatGPT/Gemini/Claude/etc.), prefer **one canonical raw item per message/turn** (sender = `me` or `assistant`) with `group_id = {source}:{thread_id}` so EMOS can preserve conversational structure.
- For “threaded” sources (Reddit/X/Threads), prefer one item per post/comment with `reply_to_item_id` populated when available.

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
  "group_id": "reddit:t3_abc",
  "group_name": "reddit thread t3_abc",
  "scene": "group_chat"
}
```

Notes:

1. Prefer `message_id = ruminer:{event_id}` for strict idempotency.
2. Use `refer_list` for reply chains when available.
3. Use `group_id` to preserve thread context for EMOS boundary detection and episodic extraction.
4. For subscribed/external content, set `sender = {platform}:{author_id}` and `sender_name = author_name` so EMOS can retain author attribution; keep `group_id` scoped to the thread/feed.
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
  "group_id": "{platform}:{thread_id}",
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

1. If `event_id` is new → ingest.
2. If `event_id` exists and `content_hash` changed → ingest update (same message_id).
3. Cursor updates happen only after `status=ingested`.

## 6. Workflow Runtime: Record-and-Replay V3 (RR‑V3)

Ruminer standardizes on RR‑V3 as the execution runtime because MV3 service workers can be restarted at any time.

RR‑V3 provides:

1. **Flows** (`FlowV3`) as a DAG with explicit `entryNodeId`.
2. **Triggers** (`TriggerSpec`) for `interval`, `cron`, `url`, `dom`, `command`, `contextMenu`, `once`, `manual`.
3. A **queue + leasing** scheduler so runs survive SW restarts.
4. **Crash recovery** to re-queue interrupted runs.
5. **Run events** persisted as an append-only event log for UI debugging and auditing.
6. **Persistent variables** (keys like `$cursor.*`) for checkpoints across runs.

Operational note:

- Scheduled triggers are **best-effort** and only run while the browser is running (MV3 cannot wake a fully closed Chrome reliably). Ruminer should communicate this clearly in the UI and provide “Run now” actions.

### 6.1 RR‑V3 Constraints (Important)

RR‑V3 validates that flows are **acyclic** (DAG only). This means:

- No graph-level loops / cycles.
- No `foreach` / `while` / `subflows` support today (conversion rejects them).

Ruminer’s approach:

1. Keep the graph DAG-shaped.
2. Implement pagination/scrolling/iteration as **composite Ruminer nodes** that loop internally but still return a single node result.

### 6.2 Ruminer Node Strategy

RR‑V3 can execute nodes via a plugin registry (Zod-validated configs). Ruminer adds nodes like:

- `ruminer.extract_list` (scroll/paginate and return item links + minimal metadata)
- `ruminer.extract_detail` (open an item and extract canonical raw item)
- `ruminer.normalize_and_hash` (compute `event_id`, `content_hash`, validate required fields)
- `ruminer.ledger_upsert` (idempotency ledger)
- `ruminer.evermemos_ingest` (call EMOS `/api/v1/memories`)
- `ruminer.digest_build` (select high-signal items and write digest entries)

These nodes allow high reliability without requiring RR‑V3 graph loops.

### 6.3 Checkpoints via Persistent Vars

We store run-to-run cursors in RR‑V3 persistent vars (IndexedDB store `persistent_vars`):

- `$cursor.{workflow_id}.last_seen_time`
- `$cursor.{workflow_id}.last_seen_item_key`

Cursor update happens only after successful ingestion + ledger update.

### 6.4 Chunked Iteration + Continuations (MV3-Friendly)

Because MV3 service workers can restart mid-run, any “scroll/paginate over many items” work should be designed as a sequence of small, resumable chunks:

1. Process a bounded batch (e.g., 20–100 items max) per run.
2. Persist progress (`$cursor.*`, plus any continuation token) after each successful ingest.
3. If more work remains, enqueue a follow-up run (“continuation”) rather than looping for minutes inside a single composite node.

## 7. Workflow Types (Ruminer)

### 7.1 Ingestion Workflows (User Content)

Goal: reliably ingest a user’s own content into EMOS.

Examples:

- ChatGPT: conversation list → conversation thread → messages.
- Reddit: profile posts/comments.

Characteristics:

- Runs on demand (manual trigger) and optionally scheduled for backfill.
- Prioritizes correctness, idempotency, and stable IDs.

### 7.2 Watch Workflows (Followed Sources)

Goal: periodically check subscribed channels/accounts/feeds, ingest only new items, update cursor.

Characteristics:

- Scheduled triggers (interval/cron).
- Strict stop conditions and rate limits.
- Uses persistent cursor vars to avoid rescanning entire history.
- Stores subscribed-source items locally (for digesting and history) and uses EMOS only as personalization context (user’s `authored`/`bookmarked` memory), not as a store for subscribed content.
- Subscribed sources are discovered by the workflow itself (e.g., read “Subscriptions/Following” lists in YouTube/X/Reddit/Threads).
- Watch workflows should run in an **isolated session mode** to reduce cross-site leakage and surprise side effects:
  - **Default (MVP)**: run in a new normal window in the current profile (reuses login), with strong capability gating and clear UI that automation is active.
  - **Optional**: run in Incognito _only if the user explicitly enables “Allow in Incognito” for Ruminer_ (may require re-auth).
  - **Future**: support a dedicated “Ruminer Profile” (separate Chrome profile) as the best isolation-with-login compromise.

### 7.3 Digest Workflows (High Signal)

Goal: produce “what matters” cards for the user.

Inputs:

- Subscribed items since last digest.
- User memory context from EMOS (primarily `authored`, secondarily `bookmarked`).

Outputs:

- `digest_entries[]` stored locally for fast UI rendering.
- A periodic “digest report” generated by the same AI model the user chats with (after deterministic significance filtering).
- Optional push notification.

## 8. High-Signal Digest Design

### 8.1 Digest Data Model (Local Cache)

Ruminer stores digest cards locally in a separate IndexedDB database (`rumen`) to keep RR‑V3’s runtime stores (`rr_v3`) focused on orchestration state.

In addition, watch workflows should store _subscribed-source items_ locally (also in `rumen`) so digests can be regenerated/debugged without ingesting those items into EMOS.

```json
{
  "digest_id": "digest_2026-02-25T00:00:00Z",
  "created_at": "2026-02-25T00:05:00Z",
  "items": [
    {
      "event_id": "sha256...",
      "title": "Optional",
      "summary": "Short summary",
      "why_it_matters": "Grounded reason (links to memory IDs if available)",
      "canonical_url": "https://...",
      "source": "youtube",
      "score": 0.87,
      "cited_memory_ids": ["..."]
    }
  ]
}
```

Retention (MVP recommendation):

- Keep subscribed-source items for a bounded window (e.g., 30–90 days) and keep digest reports indefinitely (small).
- Always retain the minimal fields needed for grounding and traceability: `canonical_url`, `source`, `timestamp`, `title/content snippet`, and the `event_id`/hashes.

### 8.2 Scoring Heuristic (MVP)

MVP score is deterministic and debuggable:

1. **Freshness**: newer items score higher.
2. **Importance proxy**: engagement signals when available (likes/replies) + content length threshold.
3. **Personal relevance**: Calculated from EMOS embeddings - weighted combination of `authored` (primary) and `bookmarked` (secondary) memories, and the embeddings of these new items.
4. **Novelty**: down-rank items too similar to recent digest items (hash + similarity check via EMOS).
5. **User preferences**: down-rank muted sources/keywords and up-rank “more like this” signals (local prefs).

This yields useful results even without a separate summarization model.

### 8.3 Optional: Agentic Retrieval

If available, a digest workflow may call EMOS `/api/v3/agentic/*` to:

- generate a better “why it matters”
- cite supporting memories
- propose follow-up queries

This is optional and should be feature-flagged.

### 8.3b Digest Report Generation (MVP)

After significance filtering (and preference adjustments), Ruminer uses the same AI model the user chats with to:

1. aggregate key information into a digest report
2. produce concise “why it matters” text with links to underlying items

Ruminer should provide structured, citeable inputs to the model:

- list of selected items (title/text snippet, canonical_url, source, timestamp, engagement proxy)
- top matched EMOS memories for each item (IDs + short excerpts)
- user prefs signals (mute/more/less like this)

To stay local-first and backend-free, the “report generation” call should be initiated by the MCP-capable LLM client (or whichever model runtime the user is already using).

### 8.4 Feedback Loop (Recommended)

Digest cards should support lightweight, local preference learning:

- “More like this” / “Less like this”
- “Mute source” / “Mute keyword”

These preferences are stored locally and applied deterministically in scoring, so the digest improves without requiring a separate model.

## 9. UI/UX (Extension)

Ruminer UI is in-page-first (FAB + command bar) while browsing, with a sidepanel for workflows and knowledge-base management.

### 9.1 Surfaces

1. **In-page assistant (primary)**
   - Floating action button (FAB) anchored to a screen corner (Ruminer logo; animated).
   - Hover expands into a command bar (text input).
   - Text input + live related-memory suggestions; press Enter to ask AI.
   - “Agent mode” toggle (permissioned) for allowing the assistant to manipulate the current DOM.
2. **Sidepanel (opens on extension button click)**
   - One-click run saved workflows (e.g., import new AI chat conversations; import new social posts).
   - Browse/search/manage knowledge base (EverMemOS messages/posts/comments).
   - Digest inbox (in scope; may ship after core ask UX).
3. **Builder**
   - RR‑V3 flow editor, trigger editor, variable editor
   - Run timeline (RR‑V3 events)
4. **Options**
   - EverMemOS settings (base URL + connection test; secrets live in native host)
   - Permissions and safety toggles
   - Debug mode / logging level

### 9.2 In-Page Assistant (FAB) Interaction (MVP)

1. **Hover state**
   - FAB expands into a single-line text input bar.
2. **Text input**
   - Click input bar to focus and type.
   - While typing, show a floating list of related EMOS memory items (debounced retrieval).
   - Press Enter to submit the prompt to the assistant (and optionally include selected memories as citations/context).
3. **Agent mode (permissioned)**
   - Default: read-only (assistant can extract/observe DOM for grounding).
   - When enabled by the user, the assistant may run arbitrary DOM mutations/actions on the current page.
   - A persistent, visible indicator + one-click revoke is required while enabled.
   - Agent mode should be expressed as explicit capabilities (at minimum): `read_dom`, `click`, `type`, `navigate`, `download`, `clipboard`, `open_tabs`.
   - Each flow declares its required capabilities and allowed origins; the user approves grants at first run (and can revoke later).

### 9.3 Sidepanel Information Architecture (MVP)

1. **Workflows**
   - Saved workflows list with “Run” (one click), “Schedule”, and recent run status.
2. **Knowledge Base**
   - Browse/search EMOS items (messages/posts/comments) with basic management actions (open, tag, delete, export).
3. **Digests (optional surface)**
   - Digest inbox, if/when enabled.

### 9.4 UX Requirements

1. Every automated action is visible and stoppable (run controls).
2. Digest cards always include:
   - source + time + canonical link
   - a short explanation and (when possible) citations
3. Users can “mute” a source or keyword and persist that preference.
4. For MVP, inject the FAB everywhere (no allowlist), while keeping capability grants per-origin and revocable.

## 10. AI-Assisted Workflow Authoring

The MCP-capable LLM client is the authoring assistant. It can:

1. Start a recording session (capture actions).
2. Ask the user to perform required login steps if needed.
3. Convert/clean the recording into a reusable workflow:
   - parameterize user handles
   - add invariants (URL patterns, required labels)
   - add extraction schemas and validation rules
   - define triggers and checkpoints
4. Run test executions and iterate until stable.

### 10.1 Authoring Loop (Recommended)

1. **Record baseline** (capture the “happy path”).
2. **Generalize**:
   - replace brittle selectors with stable candidates (data-testid/ARIA)
   - turn constants into variables
3. **Stabilize**:
   - add assertions and screenshots on failure
   - add timeouts/retries at node policy level
4. **Schedule + cursor**:
   - add an interval/cron trigger
   - implement cursor update via persistent vars
5. **Publish**:
   - mark as “stable”
   - generate a “flow contract” artifact (capabilities, allowed origins, auth checks, cursor/checkpoint keys, max items per run, extraction schema version, drift sentinels)
   - optionally expose as an MCP callable tool (`flow.<slug>`) subject to capability enforcement

### 10.2 MCP Tool Surface (Planned)

In addition to existing browser tools, Ruminer should expose RR‑V3 management as MCP tools so an external LLM can author and operate workflows without manual UI steps:

1. **Flows**
   - `rr_v3.flow.list`, `rr_v3.flow.get`, `rr_v3.flow.save`, `rr_v3.flow.delete`
2. **Triggers**
   - `rr_v3.trigger.list`, `rr_v3.trigger.get`, `rr_v3.trigger.create`, `rr_v3.trigger.update`, `rr_v3.trigger.enable/disable`, `rr_v3.trigger.delete`, `rr_v3.trigger.fire`
3. **Runs**
   - `rr_v3.run.enqueue`, `rr_v3.run.list`, `rr_v3.run.get`, `rr_v3.run.events`, `rr_v3.run.pause/resume/cancel`
4. **Ruminer**
   - `ruminer.follow.add/remove/list`
   - `ruminer.digest.list/get/mark_read`
   - `ruminer.evermemos.test_connection`

## 11. Reliability and Drift Handling

### 11.1 Execution Reliability (MV3)

RR‑V3 provides:

- run queue + leasing (prevents duplicate concurrent execution)
- crash recovery (SW restart → requeue)
- event log (debuggable failures)

Ruminer adds:

- platform-specific invariant checks
- auth health checks (signed-in detection)
- explicit “action required” states (user must log in / solve CAPTCHA)

### 11.2 Idempotency End-to-End

Idempotency is enforced in three places:

1. `event_id` + ledger (local): prevents duplicate ingest within Ruminer.
2. EverMemOS `message_id = ruminer:{event_id}`: prevents duplicates server-side for items that are ingested into EMOS.
3. Cursor update only on success: prevents “skipping” items.

### 11.3 Drift Repair Workflow

When extraction fails repeatedly:

1. capture screenshot + HTML snippet (bounded) + flow contract details (schema version + sentinels)
2. surface a “needs repair” task in UI with a reproducible “open failing run” action
3. allow the LLM client to open the failing page and patch the workflow
4. (recommended) store a small library of failing HTML snippets for extractor regression tests

## 12. Security, Privacy, and Permissions

1. **Local-first**: all browser control happens locally via the extension.
2. **Minimal permissions**: request host permissions per platform pack; avoid `<all_urls>` unless required.
   - MVP exception: if the FAB is injected everywhere, this may require broad host access for content script injection; Ruminer must still keep **capabilities gated** (read-only by default) and make grants revocable per origin.
3. **Secret handling**:
   - store EMOS credentials in the native host
   - do not embed secrets in flows
   - redact tokens/cookies in logs and UI exports
4. **Safe automation**:
   - default to read-only ingestion (no posting/liking)
   - any write actions require explicit user confirmation (future)
5. **Agent mode (DOM manipulation)**:
   - default off; require explicit user opt-in per tab/origin
   - show a persistent on-page indicator and keep an action log for review
   - provide immediate “revoke” and “panic stop” controls
6. **MCP access control (recommended for MVP)**
   - bind MCP server to localhost only (no LAN exposure)
   - require an explicit user-approved session handshake before granting sensitive tools
   - enforce per-tool/per-origin capability checks (LLM client cannot bypass UI grants)
7. **Flow integrity**
   - display flow version/hash for every run
   - prevent silent mutation: if a flow changes, require re-approval for capabilities/origins that expanded

## 13. Implementation Plan (Phased)

### Phase 1 — RR‑V3 Foundation + EverMemOS Connector

1. Fork `mcp-chrome` and rebrand UI copy/IA for Ruminer.
2. Configure the extension button to open the Sidepanel (Workflows + Knowledge Base).
3. Add the in-page assistant overlay (FAB + expandable command bar) with text input + live memory suggestions.
4. Add Options UI for EverMemOS base URL, agent-mode safety toggles, and debug settings (keep secrets in native host).
5. Implement Ruminer ingestion ledger + hashing utilities.
6. Implement `ruminer.evermemos_ingest` and `ruminer.evermemos_search` services.
7. Implement flow contract artifacts + capability gating for runs (read-only by default).
8. Build one end-to-end workflow pack (read-only) and run it via RR‑V3 using chunked iteration + checkpoints.

### Phase 2 — Watch + Digest

1. Periodic watch workflows (interval/cron triggers) with cursors, using an explicit isolated session mode (default: new normal window; optional: Incognito; future: Ruminer Profile).
2. Digest builder + digest inbox UI.
3. Notifications and “mute” + “more/less like this” controls (stored locally).

### Phase 3 — AI Authoring + Repair

1. Expose RR‑V3 management APIs as MCP tools (flow/trigger/run CRUD).
2. Guided authoring flow in UI (record → generalize → test → schedule → publish).
3. Drift repair workflow + run artifacts viewer.
4. Extractor regression tests from saved HTML snippets for top platform packs.

## 14. MVP Acceptance Criteria

1. User can configure EverMemOS base URL in Options and verify connectivity (native host holds the API key).
2. In-page assistant (FAB) supports text input, shows related memories while typing, and submits on Enter.
3. Sidepanel opens on extension button click and supports one-click workflow runs + knowledge base browsing/management.
4. At least one ingestion workflow runs end-to-end and is idempotent (no duplicates on rerun).
5. At least one watch workflow runs on a schedule and only ingests new items using a cursor, with a clearly communicated session mode.
6. Digest inbox shows high-signal items with stable links and reasons grounded in memory search, and supports “mute” controls.
7. RR‑V3 run history and event timeline is visible in the UI for debugging.
8. Sensitive automation and MCP-exposed actions are gated behind explicit capability grants and are revocable.

## 15. Future Features

### 15.1 Voice Input UI/UX (Future)

Voice input should be introduced as a first-class interaction mode without weakening the trust/safety model.

In-page assistant:

1. **Entry points**
   - Add a microphone affordance on the FAB/command bar (icon button).
   - Add a keyboard shortcut (optional) for push-to-talk / toggle listening.
2. **First-run experience**
   - Explain what will happen before triggering the browser mic permission prompt.
   - Provide a clear “not now” path; voice remains fully optional.
3. **Listening state**
   - Show a highly visible listening indicator (e.g., pulsing ring + “Listening…” text).
   - Provide one-click stop/cancel, plus auto-timeout on prolonged silence.
   - Keep a persistent on-page indicator while the mic is active.
4. **Live transcript**
   - Stream partial transcript into the text input as it arrives (editable).
   - Clearly differentiate interim vs final transcript; allow quick corrections before submit.
5. **Submission**
   - “Stop” finalizes transcript; user can press Enter/click Send to submit.
   - Provide a mode for “auto-submit on stop” (off by default).
6. **Failure handling**
   - If mic permission is denied or speech recognition is unsupported, fall back to text input with a short, actionable message.
7. **Privacy + logging**
   - Do not store raw audio by default.
   - Store only the final transcript in the run event log (if logging is enabled), with clear redaction controls.

Options / settings:

- Default language/locale selection (or “auto”).
- Push-to-talk vs toggle listening preference.
- Whether voice transcript is saved in run artifacts (default: off).

Implementation note:

- Voice capture and speech recognition approach remains flexible (Web Speech API vs native host); the UX should not assume availability of any specific engine.

## 16. Open Questions

1. Digest report generation: what is the minimal “citeable input packet” contract between the extension and the user’s chat model to keep reports grounded and debuggable?
2. Local retention policy: what are the defaults for subscribed-source item retention (days) and maximum on-disk storage, and how should the user control this?
3. MCP authentication: what is the minimal user-friendly handshake that still prevents untrusted local clients from driving the browser?
