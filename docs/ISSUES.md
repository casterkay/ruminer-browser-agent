# Ruminer Browser Agent — Issues Tracker

This file consolidates the currently reported problems (from user feedback) plus a recent code review of:

- `app/chrome-extension/inject-scripts/ruminer.*`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/*`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/*`

Each issue includes: **symptom**, **impact**, **suspected cause**, and **fix direction**.

---

## Misc Issues

- [x] ChatGPT scan workflow progress is stuck at 0%.
- [ ] Gemini scan workflow hangs for a long time (>1min) after it has scrolled to the top of the first conversation in the ingest phase.
- [ ] Gemini ingested conversations have cross-session corruption (it appends messages from other conversations after messages in the current conversation).
- [ ] Filenames like `README.md` are rendered as links to `http://{filename}` in the message cards.
- [ ] Ingested DeepSeek conversations have duplicated messages.
- [ ] Gemini scan workflow does not scroll the conversation list to its end - it stops at the first lazy loading.
- [x] DeepSeek ingestion is not scrolling. (Test https://chat.deepseek.com/a/chat/s/32114b00-cb2e-4147-abd6-47b8f10c2b02)
- [ ] The engine of the conversation imported from an AI chat platform does not match the selected agent engine in the tooltip menu.
- [ ] Gemini user message needs to be expanded to get full content.
- [ ] Use openclaw workspace as project dir for openclaw engine.
- [ ] Attached images are not read by agent.
- [ ] Add a new tool for agent to freely modify the DOM.
- [ ] No saved or published flows are available to the agent.
- [ ] Design and implement the system for agent-driven workflow development.

---

What’s actually happening in the pipeline (why “scan
flow” fails the way it does)

- The built-in flow node is
  ruminer.scan_and_ingest_conversations in app/chrome-
  extension/entrypoints/background/record-replay-v3/
  engine/plugins/ruminer-ingest/nodes/scan-and-ingest-
  all.ts.
- For non-ChatGPT platforms (Gemini/Claude/DeepSeek),
  scan iterates through the conversation list and, for
  conversations that already exist in the ledger, it
  calls getConversationMessages() and then hard-fails
  the entire run if normalizeConversationMessages(...)
  returns an empty array (“Conversation has no
  extractable messages…”).
- For ChatGPT, there’s an extra prefetch list phase
  where it fetches all conversations first, but progress
  reporting is still based on scanned.length (which
  stays 0 during the whole list prefetch).

———

## ChatGPT: “stuck with no scan progress”

Root cause: progress semantics, not necessarily a hang.

- In scan-and-ingest-all.ts, ChatGPT does:
  1. List all conversations into allConversations
     (pagination loop)
  2. Only afterwards starts “scan phase” where
     scanned.push(...) happens
- Progress (percent/total/finished) is computed from
  scanned.length, so during step (1) the UI/logs will
  show total=0, percent=0 repeatedly even though real
  work is happening. That matches your log spam of
  ruminer.scan_and_ingest.progress while looking
  “stuck”.

About the React error #418 you saw in the page console

- The scan script injection happens after
  waitForTabComplete(...) (so after load completes), and
  the scan script itself doesn’t mutate the DOM (it
  mostly fetches /backend-api/...). On that evidence
  alone, the React hydration error is not well-explained
  by ruminer.chatgpt.js specifically, and could be
  incidental or caused by other extension behavior on
  ChatGPT pages. I can’t prove causality from the code +
  log snippet you provided.

———

## Claude: ends with “Conversation has no extractable

messages”, diagnostics show href=https://claude.ai/new

This one has a stronger smoking gun than Gemini: you’re
not even on the conversation page when extraction runs.

### Primary root cause: navigation via synthetic click

is unreliable

- In app/chrome-extension/inject-scripts/ruminer.claude.js,
  openConversationInPlace() prefers a.click()
  when it finds a matching sidebar link, and only does
  location.assign(url) if no anchor is found.
- Many apps (and Claude can be one) ignore non-user-
  initiated clicks (event.isTrusted === false) for
  navigation. If so:
  - a.click() does nothing
  - openConversationInPlace() times out after 15s and
    returns { ok: false, error: 'navigation_timeout' }
  - extraction runs on whatever route you were on
    (often /new)
- That matches your diagnostics: conversationUrl was /
  chat/<id>, but the tab href is still /new.

### Secondary root cause: the “API first” strategy

silently degrades into a broken DOM fallback

- getConversationMessages() tries API fetch via /api/
  organizations/.../chat_conversations/.... If that
  fails (CORS, auth, org resolution, endpoint drift), it
  catches and falls back to DOM extraction.
- The DOM extractor (extractMessagesFromDom) relies on
  [data-message-author-role] or fuzzy [data-
  testid*="assistant"]-style queries which may not match
  Claude’s current DOM reliably, so even if navigation
  worked you can still get [].

### Another subtle contributor: extra headers can make

API fetch more fragile

- Your fetchJson() in Claude scan adds headers like x-
  requested-with and x-csrf-token. If the fetch is
  treated as cross-origin in the extension execution
  context, those headers can force preflight/CORS paths
  that a simpler Accept: application/json fetch (like
  the reference exporter) might avoid.

(Reference you pointed to: /Users/tcai/Projects/Ruminer/
\_ref/\_browser_agent_refs/claude-exporter/chrome/
content.js uses a much simpler fetch pattern and avoids
click-navigation entirely.)

———

## DeepSeek: ends with error (likely same two classes of problems)

From app/chrome-extension/inject-scripts/ruminer.deepseek.js:

### Likely cause A: brittle selectors

- Older versions depended on hashed classnames like
  .fbb737a4 for user turns, which are inherently
  unstable across releases.
- The extractor should instead iterate stable
  structural blocks (`.ds-message`) and classify turns
  by the presence of assistant markdown that is not
  under `.ds-think-content`.

### Likely cause B: same synthetic-click navigation

failure mode as Claude

- openConversationInPlace() also prefers a.click() when
  it finds a matching anchor, and should fail with
  `navigation_timeout` on timeout (not succeed).
- If DeepSeek’s router ignores untrusted clicks, you’ll
  extract from the wrong page and get 0 messages.

(Your reference exporter at /Users/tcai/Projects/
Ruminer/\_ref/\_browser_agent_refs/deepseek-chat-exporter/
content.js doesn’t solve “scan all conversations”; it
mainly extracts from the current conversation page, so
it sidesteps the hardest part: reliable cross-
conversation navigation + readiness.)

———

## Cross-cutting design issues (shared root causes)

1. Click-based SPA navigation is not reliable (a.click()
   can be ignored)
   - Claude failure strongly indicates this. Gemini/
     DeepSeek are exposed to the same risk.
2. “Timeout == success” in openConversationInPlace()
   - This is a pure footgun: if navigation fails, the
     extractor must return `{ ok: false, error:
'navigation_timeout' }` so the caller can retry or
     fail with the true root cause.
3. Hard-fail on empty messages in scan-and-ingest-all.ts
   - Any empty chat, transient load race, DOM drift, or
     nav failure immediately kills the entire scan.
4. Non-platform-specific DOM diagnostics
   - collectDomDiagnostics() is basically Gemini-
     flavored (#chat-history), so Claude/DeepSeek
     readiness booleans are misleading.
5. ISOLATED-world fetch/origin/CORS uncertainty
   - Your own comment in ingest-conversation.ts
     acknowledges some platforms may need MAIN-world
     fetch semantics or an ISOLATED↔MAIN bridge. Claude
     API fetch is the most likely to be impacted.

---

## P0 — Broken / Data-loss / Duplicates

### P0.1 — All `conversation_scan` workflows fail: `Scan listConversations failed: listConversations failed`

- **Symptom**
  - Running any `*.conversation_scan.v1` fails with: `Scan listConversations failed: listConversations failed`.
- **Impact**
  - “Import All” is unusable across platforms.
- **Most likely root causes (to verify)**
  - The injected scan script is present but `chrome.scripting.executeScript(... func ...)` returns a non-record/empty result (so the wrapper throws the generic `listConversations failed`).
  - Scan script `listConversations()` throws (DOM assumptions, URL parsing, unexpected `href`s), and `executeScript` yields an empty/undefined `result` rather than a thrown error surfacing cleanly.
  - The scan tab is in an unexpected state (e.g., not logged in / blocked / redirected to an interstitial), so the scan script never successfully defines `window.__RUMINER_SCAN__`.
- **Relevant code**
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/scan-and-enqueue.ts`
    - `callListConversations()` throws `new Error(err || 'listConversations failed')` when the return isn’t a record.
  - Injected scripts: `app/chrome-extension/inject-scripts/ruminer.*-scan.js`
- **Fix direction**
  - Add structured diagnostics to distinguish:
    - injection failure vs. missing API vs. exception inside `listConversations`
    - “tab redirected to login/interstitial” vs. “DOM changed”
  - Make scan scripts robust to “unexpected anchors” (wrap `new URL(...)` in `try/catch` for every anchor).
  - Consider switching scan scripts to return `{ ok: true, items, nextOffset }` consistently and have the caller require that shape (no silent/ambiguous “non-record”).

---

### P0.2 — Dedup does not work (same conversation ingested into EMOS multiple times)

- **Symptom**
  - Re-ingesting can create duplicate entries in EMOS for the same conversation.
- **Impact**
  - Pollutes memory, increases cost, breaks search relevance.
- **Most likely root causes (to verify)**
  - Conversation identity instability:
    - conversationId parsing differs across platforms or fails intermittently → different `groupId/message_id` → duplicates.
  - Ledger doesn’t advance to “ingested” (or hashes don’t persist as expected) so ingestion repeatedly replays.
  - EMOS “upsert” is not actually idempotent on `message_id` (or uses different key).
  - Index shifts:
    - message ids are `platform:conversationId:index`; if extracted message order differs run-to-run, the same semantic message can land on a different index and produce a different `message_id`.
- **Relevant code**
  - Message ids + ledger:
    - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
      - `messageId()` and `longestCommonPrefixLen()`
  - Ledger state store:
    - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/conversation-ledger.ts`
- **Fix direction**
  - Confirm EMOS upsert semantics: ensure `message_id` is the unique key and true upsert.
  - Make message identity more stable than “index”:
    - e.g. incorporate a content hash into message_id, or store a stable per-message “turn id” when the platform provides one.
  - Ensure ledger updates occur even when session saving is delayed (see P1.3) while keeping retry semantics.

---

### P0.3 — Claude ingest saves account header (“USERNAME Free plan…”) and misses assistant messages

- **Symptom**
  - Extracted content includes account / plan UI strings.
  - Assistant messages are missing (user messages only, or partial).
- **Impact**
  - Corrupt / incomplete ingested conversations.
- **Most likely root causes (to verify)**
  - Over-broad DOM selection in `extractMessagesFromDom()`:
    - Using `textContent` on container nodes that include sidebar/header/account elements.
    - Fallback selectors (`[data-testid*="assistant"], [data-testid*="claude"]`) likely match non-message UI (branding, headers).
  - Message ordering strategy mixes unrelated nodes and sorts by document position without scoping to the chat transcript container.
- **Relevant code**
  - `app/chrome-extension/inject-scripts/ruminer.claude.js`
- **Fix direction**
  - Scope extraction to the chat transcript root element (known stable container), then select per-message nodes within it.
  - Prefer semantic attributes for messages if available; otherwise build a stricter heuristic (role + message bubble container).
  - Exclude nav/sidebar/header regions explicitly.

---

### P0.4 — Investigate ingestion reliability + freshness (EMOS + sessions)

- **Symptom**
  - Ingestion “sometimes works, sometimes doesn’t”, and even successful ingests can take minutes to appear in:
    - EMOS memory list
    - local session list / `AgentSessionsView`
- **Impact**
  - Users can’t trust the system; “Import” feels flaky and slow.
- **Most likely root causes (to verify)**
  - Eventual consistency / delayed refresh:
    - UI caches lists without invalidation on ingest completion.
    - backend (native-server / EMOS) write succeeds but read paths are delayed or throttled.
  - Intermittent native-server connectivity / stale port discovery:
    - session saving depends on a stored “server status/port” object and may fail or retry later.
  - Extraction variability:
    - DOM-based extractors sometimes return zero or partial messages; ingestion then fails with `No messages to ingest` or “succeeds” with incomplete content.
  - Ledger / dedup semantics:
    - ingestion may re-run due to ledger not updating promptly or index instability, creating duplicates.
- **Relevant code**
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
    - `getNativeServerPort()` + session save request to `/agent/session/ingest`
  - UI:
    - `app/chrome-extension/entrypoints/sidepanel/components/agent-chat/AgentSessionsView.vue`
- **Fix direction**
  - Add an explicit “ingest completed” signal that triggers immediate UI refresh for:
    - sessions list
    - EMOS list
  - Improve observability:
    - distinguish extractor failure vs EMOS failure vs session-save failure vs UI refresh delay.
  - Consider stronger delivery semantics:
    - queue + retry for session save when native server is down
    - structured progress events per stage (extract → emos → session save → UI refresh)

---

## P1 — Major UX / Incorrect behavior

### P1.1 — “Filter by active tab domain” shows wrong platform workflows (e.g., Gemini/DeepSeek tab shows Claude workflows)

- **Symptom**
  - On a Gemini or DeepSeek page, enabling the filter shows Claude workflows.
- **Impact**
  - Confusing and prevents quick access to correct workflows.
- **Most likely root cause**
  - `activeHostname` is only read once on sidepanel mount and never refreshed when the active tab changes or navigates.
- **Relevant code**
  - `app/chrome-extension/entrypoints/sidepanel/App.vue`
    - `onMounted()` sets `activeHostname` once.
    - `displayFlows` uses `activeHostname` substring matching against bindings.
- **Fix direction**
  - Update `activeHostname` reactively:
    - poll active tab URL while workflows tab is visible, or
    - subscribe to `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` (for active tab), or
    - refresh hostname on filter toggle click.

---

### P1.2 — Filter shows duplicated scan+ingest workflow pairs (4 workflows instead of 2)

- **Symptom**
  - With domain filter on, a duplicated pair of scan+ingest workflows appears.
- **Impact**
  - UI clutter; users may run the wrong flow.
- **Most likely root causes (to verify)**
  - Old/legacy flows in storage (user-created or previously shipped) share the same tags/names/bindings.
  - Builtins refreshed but old variants not cleaned up (ids differ).
- **Relevant code**
  - Builtin definitions:
    - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/*.ts`
  - Builtin refresh:
    - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/index.ts`
- **Fix direction**
  - Add a “Builtin” badge and/or filter to hide non-builtin duplicates.
  - Optionally add a one-time migration that archives older shipped flows by tag/id prefix.

---

### P1.3 — After “Open in Chat”, workflow results modal should close

- **Symptom**
  - Clicking “Open in Chat” leaves the workflow results modal open.
- **Impact**
  - UX friction; it feels like the action didn’t complete.
- **Relevant code**
  - `app/chrome-extension/entrypoints/sidepanel/components/workflows/WorkflowsView.vue`
  - `app/chrome-extension/entrypoints/sidepanel/App.vue` (`openChatSession()` dispatches navigation event)
- **Fix direction**
  - When “Open in Chat” is clicked:
    - collapse/close the open run panel (`openRunId = null`) and/or emit `manualRunHandled`.

---

### P1.4 — AgentSessionsView doesn’t show ingested sessions immediately; appears minutes later

- **Symptom**
  - Ingest succeeds and “Open in Chat” works, but sessions don’t appear in AgentSessionsView for minutes.
- **Impact**
  - Users think ingest failed.
- **Most likely root causes (to verify)**
  - Sessions are saved via native server asynchronously and UI refresh interval is slow.
  - AgentSessions list uses caching without invalidation on “session saved” event.
  - Native server persists quickly but UI fetch is throttled/backoff.
- **Relevant code**
  - Session save path:
    - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
      - POST `/agent/session/ingest`
  - UI:
    - `app/chrome-extension/entrypoints/sidepanel/components/agent-chat/AgentSessionsView.vue`
- **Fix direction**
  - On successful session save, emit a UI event to refresh sessions immediately.
  - Add “Just imported” optimistic insertion until backend confirms.

---

### P1.5 — Record and surface conversation source URL (Session Info: Platform + link)

- **Symptom**
  - Imported sessions don’t clearly show where they came from, and the source URL isn’t consistently recorded/surfaced.
- **Impact**
  - Hard to audit imports and jump back to the original conversation.
- **Fix direction**
  - Persist source URL in the saved session object:
    - `source_url` (source conversation URL)
  - In UI, show a new row in “Session Info”:
    - `Platform: {platform_icon} {platform_name} {external-link icon → opens source_url}`

---

## P2 — Correctness / Robustness issues from code review

### P2.2 — Scan scripts use `history.pushState` fallback for navigation (often doesn’t load conversation)

- **Symptom**
  - Tail-hash fetch may operate on a stale conversation after “navigation”.
- **Impact**
  - False “unchanged” detection or incorrect enqueue behavior.
- **Relevant code**
  - `app/chrome-extension/inject-scripts/ruminer.claude.js`
  - `app/chrome-extension/inject-scripts/ruminer.gemini.js`
  - `app/chrome-extension/inject-scripts/ruminer.deepseek.js`
- **Fix direction**
  - Prefer clicking the anchor; if missing, do `location.assign(url)` and wait for a conversation-specific DOM marker.
  - Throw on timeout (don’t silently continue).

---

### P2.3 — Scan/enqueue logic stops checking updates after any missing conversation

- **Symptom**
  - Once `sawMissing` is true, later items are never tail-hash checked/enqueued for updates.
- **Impact**
  - Updated older conversations can be missed indefinitely.
- **Relevant code**
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/scan-and-enqueue.ts`
    - `if (!sawMissing) { ... tail hash ... enqueue ... }`
- **Fix direction**
  - Decouple “missing conversations should be enqueued” from “changed conversations should be enqueued”.
  - If you need an early stop optimization, use it independently (e.g., stop when you hit the first unchanged _after_ a run of already-ingested items).

---

### P2.4 — Gemini ingest scrolls the conversation list

- **Symptom**
  - Gemini ingest workflow scrolls sidebar/history list instead of only the chat transcript.
- **Impact**
  - Confusing UX; may fail to materialize messages; may disturb scan assumptions.
- **Likely cause**
  - `findScroller()` candidates include broad containers like `mat-sidenav-content` / `main`, which can be the sidebar scroller.
- **Relevant code**
  - `app/chrome-extension/inject-scripts/ruminer.gemini.js`
- **Fix direction**
  - Read `_ref/gemini-export/src/content/content_script.js` to see how it implements conversation export.

---

### P2.5 — Timestamps often fallback to “now” (especially ChatGPT)

- **Symptom**
  - Message `create_time` in EMOS may be incorrect (current time) when platform provides epoch seconds or non-ISO strings.
- **Impact**
  - Incorrect chronology, worse search and timeline UX.
- **Relevant code**
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
    - `isoOrNow()`
  - ChatGPT extractor captures `create_time` as string, possibly epoch-like:
    - `app/chrome-extension/inject-scripts/ruminer.chatgpt.js`
- **Fix direction**
  - Support epoch seconds/millis and numeric strings in `isoOrNow()`.

---

## Notes / Follow-ups

- Consider unifying shared utilities (hashing, tab-wait) to avoid divergence:
  - `waitForTabComplete()` is duplicated in two nodes.
