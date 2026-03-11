# RR‑V3 Ingestion Workflows v1 (8 workflows, conversation-ledger only)

## Summary

Implement **8 RR‑V3 built‑in ingestion workflows**:

- **Import All Conversations** (scanner) × 4 platforms
- **Import Current Conversation** (ingest) × 4 platforms
  - Platforms: **ChatGPT, Gemini, Claude, DeepSeek**

These workflows run as normal RR‑V3 DAGs (multiple nodes allowed). Page extraction happens in `script` nodes, while
**ledger + EMOS** access remains in the background service worker behind a **workflow RPC bridge**
(`chrome.runtime.sendMessage`).

Key changes vs prior plan:

- **Remove the message ledger completely.**
- Add a **conversation ledger** only (per conversation ID) storing the full ordered list of message content hashes.
- Scanner behavior:
  - **Always enqueue all un‑ingested conversations** (excluding skipped) during initial backfill.
  - For already-ingested conversations: scan **top → bottom**, enqueue ingestion for those that changed, and **stop at
    the first conversation detected as unchanged**.
- Failure behavior: if a conversation ingestion previously **failed**, the next ingest run **re‑ingests the whole
  conversation**.
- Fork/truncation behavior: if a conversation becomes shorter (tail dropped), we **accept stale tail in EMOS as
  historical** (no deletions / tombstones).

Queue persistence must survive MV3 service worker restarts (RR‑V3 queue is already IndexedDB‑backed).

---

## Key Changes (Decision‑Complete)

### 1) Conversation ledger (new; replaces message ledger)

Create a new IndexedDB store for conversation bookkeeping (local-only; future migration target: native host SQLite).

**Key**

- `group_id = ${platform}:${conversationId}` (also used as the primary key)

**Record shape**

```ts
type ConversationLedgerStatus = 'ingested' | 'skipped' | 'failed';

type ConversationLedgerEntry = {
  group_id: string; // platform:conversationId
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek';
  conversation_id: string;
  conversation_url: string | null;
  conversation_title: string | null;
  status: ConversationLedgerStatus;
  message_hashes: string[]; // ordered; hash(role+content) after normalization
  first_seen_at: string; // ISO
  last_seen_at: string; // ISO
  last_ingested_at: string | null; // ISO
  last_error: string | null;
};
```

**Hash definition (canonical)**

- `hash_i = sha256( stableJson({ role, content }) )`
  - `role ∈ {'user','assistant'}`
  - `content` is the normalized plain text that will be sent to EMOS

**Conversation skip**

- `status = 'skipped'` in the conversation ledger entry (no separate marker entry).

**Query helpers needed by scanners**

- `getConversationStates(groupIds) -> { [groupId]: { status?:..., tailHashes: string[] } }`
  - `tailHashes` must be the last `K` hashes from `message_hashes` (K fixed; see scanner algorithm below).

---

### 2) Platform-agnostic workflow RPC bridge (background SW)

Replace the existing ChatGPT-only workflow RPC handler with a single handler that supports all platforms and the new
conversation ledger.

**RPC messages (chrome.runtime.sendMessage)**

1. `ruminer.ledger.getConversationStates`

- Input: `{ groupIds: string[]; tailSize: number }`
- Output: `{ [groupId]: { exists: boolean; status?: 'ingested'|'skipped'|'failed'; tailHashes?: string[] } }`

2. `ruminer.rr_v3.enqueueRuns`

- Input: `{ items: Array<{ flowId: string; args: object; priority?: number }> }`
- Behavior:
  - Uses in-process RR‑V3 runtime (`getV3Runtime()`) and the shared `enqueueRun()` service.
  - Must **not** enqueue the scanner flowId itself.
  - Best-effort dedupe against active queue (`queued|running|paused`): do not enqueue if there is already an active run
    for `(flowId, args.ruminerConversationId)`.

3. `ruminer.ingest.ingestConversation`

- Input:

```ts
{
  platform: 'chatgpt'|'gemini'|'claude'|'deepseek';
  conversationId: string;
  conversationTitle?: string | null;
  conversationUrl?: string | null;
  messages: Array<{ role: 'user'|'assistant'; content: string; createTime?: string | null }>;
}
```

- Behavior (conversation-ledger only):
  - Validates EMOS settings; returns `{ ok:false,error }` if missing.
  - Loads conversation ledger entry (if any).
  - If existing status is `failed`: **re‑ingest the whole conversation** (upsert all indices `0..n-1`).
  - Else:
    - Compute `newHashes[]` for all messages.
    - Compute `lcp = longestCommonPrefixLen(oldHashes, newHashes)`.
    - Upsert messages for indices `lcp..n-1` only.
  - Writes/updates the conversation ledger entry with:
    - `status = 'ingested'` on success
    - `message_hashes = newHashes`
    - timestamps + `last_error`
  - On error:
    - `status = 'failed'`
    - `last_error = <message>`
    - Do **not** modify `message_hashes` (keeps last known-good)

**Message IDs in EMOS**

- `message_id = ${platform}:${conversationId}:${index}`
- Re-ingest / forked tails simply overwrite the same `message_id`s for changed indices.
- If conversation becomes shorter, old higher indices remain in EMOS (accepted as historical).

---

### 3) Workflow definitions (8 built-ins; multi-node)

We keep exactly **8 user-visible workflows** (scanner + ingest per platform). The scanner enqueues the ingest workflow
for per-conversation ingestion runs.

**Shared conventions**

- Flow IDs:
  - Scanner: `ruminer.<platform>.scanner.v1`
  - Ingest: `ruminer.<platform>.conversation_ingest.v1`
- Bindings:
  - ChatGPT: `chatgpt.com`, `chat.openai.com`
  - Gemini: `gemini.google.com`
  - Claude: `claude.ai`
  - DeepSeek: `chat.deepseek.com`
- Required tools: `BROWSER.NAVIGATE`, `BROWSER.JAVASCRIPT`
- Tab policy: workflows run in **inactive background tabs** and close them when done.

#### 3.1 Scanner (Import All Conversations) algorithm

Scanner runs on a platform home page, extracts the sidebar conversation list, and processes conversations **top → bottom**:

1. Collect sidebar items as `{ conversationId, conversationUrl, conversationTitle? }` in displayed order (newest first).
2. Batch query conversation ledger states:
   - `tailSize = K` (fixed; **K = 6**).
3. For each conversation in order:
   - If ledger status is `skipped`: continue.
   - If ledger does not exist: **enqueue ingest**.
   - If ledger status is `failed`: **enqueue ingest** (forces re-ingest whole conversation).
   - If ledger status is `ingested`:
     - Navigate to that conversation URL in the scanner tab.
     - Extract the **last K messages** (role+content) without loading full history.
     - Ask background to hash these K messages and compare with ledger `tailHashes`.
     - If tails match: **stop scanning** (do not enqueue further conversations).
     - If tails do not match (or cannot extract K): **enqueue ingest**, continue.

Important: scanner must never enqueue itself.

#### 3.2 Ingest (Import Current Conversation) behavior

Ingest flow operates on a single conversation URL:

- If launched from scanner: it is passed args `{ ruminerConversationId, ruminerConversationUrl, ruminerConversationTitle? }`
  and opens that URL in a background tab.
- If launched manually (“Import Current Conversation”):
  - Sidepanel passes the current active tab URL as `ruminerConversationUrl`.
  - Ingest flow opens that URL in a background tab (does not disturb the current tab).

Then the script:

1. Loads the full conversation content (scroll-to-load until stable).
2. Extracts **all messages** as ordered `{ role, content, createTime? }`.
3. Calls `ruminer.ingest.ingestConversation` once with the full message list.

---

## Test Plan

### Automated (Vitest)

- Add/adjust unit tests for the new conversation ledger + ingest RPC:
  - missing EMOS settings fails fast
  - successful ingest creates conversation ledger entry with `message_hashes`
  - incremental ingest only upserts from the first changed index (LCP logic)
  - failed ingest marks conversation status `failed` and next ingest forces full re-ingest
- Unit test enqueue dedupe: active queue contains `(flowId, ruminerConversationId)` → enqueueRuns skips it.

### Manual acceptance (per platform)

For each platform (ChatGPT/Gemini/Claude/DeepSeek):

1. Run **Import All Conversations**:
   - First run enqueues all conversations (ledger empty → all “un-ingested”).
2. Run **Import All Conversations** again:
   - Stops at the first unchanged conversation (tail hash matches).
3. Update a conversation (new message) and run scanner:
   - Enqueues ingest for updated conversations above the first unchanged.
4. Force a failure (network / EMOS invalid key), rerun ingest:
   - Next run re-ingests the whole conversation.
5. Restart service worker mid-queue:
   - Queue remains and continues executing (RR‑V3 IDB queue persistence).

---

## Assumptions / Defaults

- Platforms do not support true mid-history edits; changes manifest as tail fork/truncation + new continuation.
- Gemini target is `gemini.google.com` only (AI Studio excluded).
- DeepSeek target is `chat.deepseek.com`.
- Stale tail in EMOS is accepted as historical when a conversation becomes shorter.
- Future: migrate conversation ledger storage from IndexedDB to native host SQLite without changing workflow scripts
  (background RPC remains the abstraction boundary).

---

## TODO (Implementation Checklist)

### Core plumbing

- [x] Add a conversation ledger module (IndexedDB) with:
  - [x] `getConversationEntry(groupId)`
  - [x] `upsertConversationEntry(entry)`
  - [x] `getConversationStates(groupIds, tailSize)` returning `{ exists, status, tailHashes }`
- [x] Keep message-ledger code intact for now, but remove all runtime dependencies from ingestion workflows.
- [x] Cleanup: remove/retire the legacy ChatGPT-only workflow RPC (`chatgpt-workflow-rpc.ts`) once no longer needed.

### Workflow RPC bridge (background SW)

- [x] Replace `initChatgptWorkflowRpc()` with `initIngestWorkflowRpc()` that handles:
  - [x] `ruminer.ledger.getConversationStates`
  - [x] `ruminer.rr_v3.enqueueRuns` (must call RR‑V3 `enqueueRun`, must not enqueue scanner itself, best-effort dedupe)
  - [x] `ruminer.ingest.ingestConversation` (conversation-ledger only; LCP incremental upsert; failed => full reingest)
- [x] Ensure all EMOS calls remain in background (page scripts never see API keys).

### Built-in flows (8 total)

- [x] Update ChatGPT built-ins:
  - [x] Scanner: list conversations (API), initial backfill enqueues missing; steady-state does tail check and stops at first unchanged
  - [x] Ingest: fetch full conversation (API) and call `ruminer.ingest.ingestConversation`
- [x] Add Gemini built-ins:
  - [x] Scanner (DOM): extract sidebar conversation URLs/IDs top→bottom; missing/failed => enqueue; ingested => tail check by opening conversation; stop at first unchanged
  - [x] Ingest (DOM): scroll-to-load (best-effort); extract turns using `_ref/gemini-export`-style selectors; ingest
- [x] Add Claude built-ins:
  - [x] Scanner (DOM): sidebar URLs/IDs; same stop-at-first-unchanged behavior
  - [x] Ingest (DOM): extract turns via selector ladder; ingest
- [x] Add DeepSeek built-ins:
  - [x] Scanner (DOM): sidebar URLs/IDs; same stop behavior
  - [x] Ingest (DOM): extract messages using `_ref/deepseek-chat-exporter` selectors (dialog only; ignores CoT)
- [ ] Hardening: verify selectors + add fallbacks on Gemini/Claude/DeepSeek (sidebar discovery, conversationId parsing, message extraction).
- [ ] Hardening: make “scroll-to-load full history” reliable (virtualization, lazy-loading, “load more” buttons) per platform.

### Sidepanel wiring

- [x] When running any `*.conversation_ingest.v1` flow from sidepanel, auto-pass `args.ruminerConversationUrl = activeTab.url`.
- [x] Fail fast with a user-visible error when the active tab URL is missing or does not match the flow bindings.

### Tests

- [x] Add Vitest coverage for conversation ledger + ingest RPC:
  - [x] New conversation => ledger created, EMOS upserts called
  - [x] Incremental update => only indices from LCP are upserted
  - [x] Failure => ledger `failed`, next run forces full reingest
- [x] Add Vitest coverage for enqueue dedupe against active queue items.

### Manual validation

- [ ] Per platform: run scanner twice; confirm second run stops at first unchanged.
- [ ] Append new message to newest conversation; scanner enqueues ingest; ledger updates.
- [ ] Simulate SW restart mid-queue; ensure queued runs continue (IDB persistence).
