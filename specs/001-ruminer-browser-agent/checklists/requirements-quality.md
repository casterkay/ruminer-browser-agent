# Requirements-Quality Checklist: Ruminer Browser Agent

**Purpose**: Unit-test the written requirements for clarity, completeness, and measurability (focus: OpenClaw Gateway chat + ingestion pipeline).
**Created**: 2026-02-27
**Updated**: 2026-02-27
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [x] CHK001 Are all required user-configurable connection fields specified for OpenClaw Gateway (WS URL, auth token, "test connection" behavior)? [Completeness, Spec FR-014]
  - FR-014: "WS URL + auth token … connection tests and clear error messages." data-model.md §1.1: gatewayWsUrl, gatewayAuthToken, deviceId, lastConnectedAt, lastConnectionError.
- [x] CHK002 Are all required user-configurable connection fields specified for extension-direct EMOS (base URL, API key, tenant/space IDs, "test connection" behavior)? [Completeness, Spec FR-014, FR-015]
  - FR-014: "base URL + API key + tenant/space IDs … connection tests." data-model.md §1.2: baseUrl, apiKey, tenantId, spaceId, lastTestOkAt, lastTestError.
- [x] CHK003 Are requirements specified for first-time Gateway node pairing approval ("pairing required" state and user next steps)? [Gap, Spec FR-014, FR-030]
  - FR-014a: "auto-pair silently (no explicit pairing approval step). Since the Gateway is localhost-only, the localhost trust boundary is sufficient." Clarification Session 2026-02-27 confirms. **Note**: contracts/gateway-ws.md §3.3 still mentions "Pairing required" state — the contract predates the clarification and should be updated for consistency.
- [x] CHK004 Is the sidepanel chat session routing strategy specified (what `sessionKey` is used, whether it's user-visible, and whether it is stable across restarts)? [Clarity, Spec US1]
  - research.md Decision 3: single deterministic `sessionKey = "main"`. data-model.md §5.1: `sessionKey: string (MVP: "main")`. Stable across restarts (hardcoded constant). Not user-visible (internal). contracts/gateway-ws.md §4.1–4.2 uses `"main"`.
- [x] CHK005 Are the required Gateway chat methods explicitly listed (history, send, abort, streaming events) in requirements (not just in design docs)? [Gap, Spec FR-003, FR-014]
  - contracts/gateway-ws.md §4 formally specifies: `chat.history(sessionKey)`, `chat.send(sessionKey, message, thinking, idempotencyKey, attachments)`, `chat.abort(sessionKey, runId?)`, `chat.inject(sessionKey, message)`, plus `chat`/`agent` event streaming (§2.3). Contracts are spec-level design artifacts.
- [x] CHK006 Are the tool-call inline rendering requirements complete (what statuses exist, what fields must be displayed, truncation rules for large tool payloads)? [Completeness, Spec US1]
  - US1 acceptance #4 specifies statuses (pending/success/error) and rendering (expandable cards). FR-003/FR-012 now require each tool card to show at minimum: tool name, short description (first line of message or normalized title), current status (pending/success/error), and a collapsed payload preview truncated to 4 lines or 512 characters (whichever comes first), with a "View full details" affordance that expands to show the complete payload. Large JSON payloads MUST be pretty-printed in the expanded view and never block the main chat timeline from rendering.
- [x] CHK007 Are ingestion workflow prerequisites explicitly specified (must be logged in; what constitutes "authenticated"; what is "action required")? [Completeness, Spec FR-023, Edge Cases]
  - FR-023: "detect authentication state and pause with an 'action required: please log in' notification." Edge case: "enters a 'waiting for user' state." The detection mechanism (cookies, DOM check) is an implementation detail appropriate for plan/task level.
- [ ] CHK008 Are ingestion workflow batch bounds fully specified (default size, configurability, continuation triggers, maximum run duration constraints)? [Completeness, Spec FR-021, US2]
  - Batch size: 20–50 conversations (US2 acceptance #2, data-model.md FlowV3 `maxItemsPerRun`). Continuation: "enqueue continuation runs if more items remain" (FR-021). **Gap**: no explicit maximum run duration constraint — only implicit bounding via "rather than looping for minutes within a single service worker activation."
- [x] CHK009 Are cursor/checkpoint keys and cursor advancement rules specified in requirements (not only in blueprint)? [Gap, Spec FR-021, Edge Cases]
  - Replaced simple cursor with ordered conversation ID list scanning model. data-model.md §4.4: `$scan.{workflow_id}.conversation_order` (ordered ID list), `$scan.{workflow_id}.last_full_scan_at`, `$scan.{workflow_id}.runs_since_full_scan`. FR-021a: heuristic stop (3 consecutive same-order matches). FR-021b: periodic full scan. List updated only on successful batch completion; NOT updated on stop/failure (preserves previous scan state for next run). Edge cases and US4#5 updated to match.
- [ ] CHK010 Are requirements specified for conversation filtering inputs (date range / length): required fields, validation rules, and how filters affect idempotency/cursors? [Completeness, Spec FR-027]
  - FR-027 uses examples only ("e.g., by date range or conversation length"). **Gap**: no required filter fields, no validation rules, no specification of how filters interact with cursors/idempotency (e.g., does filtering reset the cursor? Does a narrower filter skip items that a broader filter would include?).

## Requirement Clarity

- [x] CHK011 Is "memory search results appear within 500ms (debounced)" defined with a clear measurement point (from keystroke to UI update) and clear debounce parameters? [Clarity, Spec US1, SC-001]
  - FR-002a: "250ms" configurable debounce default, "display updated results within 500ms of the user's last keystroke." SC-001: "on 90% of attempts." Measurement: last keystroke → UI display.
- [ ] CHK012 Is "OpenClaw Gateway connection verified" defined with clear success/failure criteria and user-facing next steps (token invalid vs Gateway unreachable vs pairing required)? [Clarity, Spec FR-014, US2]
  - FR-014: "connection tests and clear error messages." US2 acceptance #1: "clear error messages and suggested next steps if either is unreachable." FR-014a eliminates "pairing required" as a failure state. **Gap**: specific failure mode differentiation (invalid token vs unreachable server) and per-mode user-facing messaging are not enumerated.
- [x] CHK013 Is "tool group toggles restricted immediately" defined precisely (which requests are blocked, how errors are surfaced, and whether in-flight runs are affected)? [Clarity, Spec FR-007, SC-005]
  - FR-007/009: prompt restriction + runtime rejection, applied "immediately." US1 acceptance #6: enforcement table updated, next message includes restriction prompt, disabled tools return "disabled by tool group" error. FR-025: workflows are independent of chat toggles (not affected). contracts/tool-groups.md §3: error code `tool_group_disabled`, message format, debug details.
- [ ] CHK014 Is "idempotent ingestion" defined with explicit identity rules for `message_index` ordering and how edits/insertions in the source conversation are handled? [Clarity, Spec FR-017, FR-020]
  - FR-017: `platform:conversation_id:message_index` (0-based position). FR-020: new → ingest, changed → update, unchanged → skip. **Gap**: if the source platform allows message insertion/deletion mid-conversation, `message_index` shifts for all subsequent messages, causing cascading false "changed" detections. This scenario is not addressed.
- [x] CHK015 Is the **standard EMOS message JSON** fully constrained (required vs optional fields, acceptable nullability, and how missing timestamps are handled)? [Clarity, Spec FR-016]
  - FR-016: required (message_id, create_time, sender, content, group_id), optional (group_name, sender_name, role, refer_list). data-model.md §2: `create_time: ISO string | null`. contracts/emos.md §2: "timestamp if available else ingestion time (ISO)." Sender enum defined.
- [x] CHK016 Is the EverMemOS mapping specified clearly (what exact content goes into `content`, whether metadata prefixes are allowed, and how `refer_list` is derived)? [Clarity, Spec FR-019]
  - contracts/emos.md §2: content = "content_text (optionally prefixed with minimal metadata)," refer_list = "[parent_item_key] when parent_message_id is known," group_name = "${PlatformName}: ${conversation_title}."
- [x] CHK017 Is "workflow stoppable" defined in terms of user-perceived latency and state guarantees (what is preserved on stop, what is rolled back)? [Clarity, Spec FR-013, SC-004]
  - SC-004: "within 2 seconds." US4 acceptance #5 (updated): "in-flight items are abandoned immediately (within 2 seconds), the cursor is preserved at the last committed ledger entry, and any mid-flight items are safely deduped on the next run via idempotency." Session 2026-02-27 clarification confirms.
- [ ] CHK018 Is "best-effort cron scheduling (only while browser running)" written as a user-facing requirement (not just a design note), including what UI messaging is required? [Clarity, Spec FR-024]
  - FR-024: "Scheduled runs are best-effort and only execute while the browser is running." US4 acceptance #3: same. **Gap**: no UI messaging requirement for missed/skipped scheduled runs (e.g., "Last scheduled run was missed because the browser was closed").

## Requirement Consistency

- [x] CHK019 Do requirements for tool groups remain consistent across spec sections (defaults, groups list, enforcement layers, and storage/persistence)? [Consistency, Spec FR-006–FR-009]
  - FR-006 (groups + defaults), FR-007 (enforcement), FR-008 (safe defaults), FR-009 (persistence + immediacy), US1 acceptance #6 (behavior), Key Entities (Tool Group), contracts/tool-groups.md (authoritative mapping). All consistent.
- [x] CHK020 Are workflow permission requirements consistent with chat tool group requirements (workflows independent of chat toggles; declared tools enforced at runtime)? [Consistency, Spec FR-025]
  - FR-025: "independent of the tool groups currently selected in the chat panel." Flow entity: "declared tools (fixed at authoring time, independent of chat tool groups)." contracts/tool-groups.md §5: confirms independence.
- [x] CHK021 Are modular degradation requirements consistent across chat vs ingestion (no Gateway, no EMOS plugin, no extension EMOS config)? [Consistency, Spec FR-033, FR-034]
  - FR-033: no EMOS → chat works (no memory), ingestion disabled. FR-034: no OpenClaw → UI renders, chat unavailable, ingestion still works with EMOS config. Edge case: OpenClaw connected but no EMOS plugin → chat works, no memory search, ingestion via extension EMOS. Internally consistent degradation matrix.
- [x] CHK022 Are identity conventions consistent across ingestion and chat (sender ids, `group_id` format) and referenced wherever needed (Memory tab, workflows, search filters)? [Consistency, Spec FR-019, Assumptions]
  - Assumptions: sender = "me"/"agent"/"{platform}", group_id = "{platform}:{conversation_id}." data-model.md §2: sender enum. contracts/emos.md §1: same conventions. FR-010 (Memory tab) references "source platform" filtering, derivable from group_id/sender.

## Acceptance Criteria Quality (Measurable Outcomes)

- [ ] CHK023 Are measurable outcomes mapped to explicit acceptance scenarios (e.g., SC-001 ↔ US1 acceptance #2) without relying on implied behavior? [Measurability, Spec SC-001, US1]
  - SC-001 ↔ US1#2 (500ms search), SC-002 ↔ US2#1 (setup), SC-003 ↔ US2#5 (no duplicates), SC-004 ↔ US4#5 (stop 2s), SC-005 ↔ US1#6 (toggle immediate), SC-007 ↔ US5#4 (needs repair). **Gap**: SC-006 ("5 consecutive successful test runs before being marked stable") has no corresponding acceptance scenario — no scenario describes the "marked stable" behavior or the 5-run threshold.
- [ ] CHK024 Is the "setup under 2 minutes" success criterion defined with an unambiguous start/end and what counts as "complete"? [Measurability, Spec SC-002]
  - SC-002: "complete first-time setup (verify OpenClaw Gateway connection and EMOS connection) in under 2 minutes." End point: both connections verified. **Gap**: start point is ambiguous — from extension install? From opening Options? From first credential entry?
- [x] CHK025 Is "zero duplicates on three consecutive re-runs" defined with an objective method to detect duplicates (by `message_id`, by content hash, by EMOS query)? [Measurability, Spec SC-003, FR-020]
  - FR-017: `item_key` = EMOS `message_id` for strict idempotency. contracts/emos.md §3: ledger is first defense (skip unchanged), EMOS `message_id=item_key` is second (server-side upsert). Detection: by message_id.
- [ ] CHK026 Is the "stop within 2 seconds" criterion defined with measurement conditions and what UI state must change within that window? [Measurability, Spec SC-004, FR-013]
  - SC-004: "within 2 seconds of clicking stop/cancel." US4#5: in-flight abandoned, cursor preserved. **Gap**: what UI state change is expected within 2s (status → "cancelled"? progress indicator stops? Run button re-enabled?) is not specified.

## Scenario Coverage (Primary / Alternate / Recovery)

- [x] CHK027 Are requirements specified for the "EMOS configured but empty dataset" scenario (expected UI empty-state messaging and suggested next action)? [Coverage, Spec Edge Cases]
  - Edge case: "The chat input functions normally but shows no memory search results. The system prompts the user to run their first ingestion workflow to populate their knowledge base."
- [x] CHK028 Are requirements specified for "EMOS unreachable during ingestion" including retry/backoff limits, user feedback, and cursor non-advancement guarantees? [Coverage, Spec Edge Cases]
  - Edge case (updated): 3 retries, 1s/2s/4s exponential backoff, fail entire run after exhaustion. Ledger entry status = "failed" + error details. Cursor not advanced. User sees "connection failed" + "retry" action. Session 2026-02-27 clarification confirms.
- [x] CHK029 Are requirements specified for "service worker restart mid-run" beyond "it resumes" (which step boundaries are valid checkpoints; what can be repeated safely)? [Coverage, Spec FR-021, US2]
  - Edge case: "RR-V3 crash recovery re-queues the interrupted run, and the ingestion ledger + cursor ensure no items are duplicated or skipped upon resumption." US2#6: "resumes from the last successfully ingested checkpoint." data-model.md §3: cursor advances only after ledger commit. Checkpoint granularity: per-item (each ledger commit). Anything not committed can be safely repeated (idempotent).
- [ ] CHK030 Are requirements specified for "platform re-auth required mid-run" including how long the run waits, what notifications appear, and how the user resumes? [Coverage, Spec Edge Cases, FR-023]
  - Edge case: pause, "action required: please log in," "waiting for user" state. FR-023: same. **Gaps**: (1) No wait timeout specified (indefinite? time-bounded?). (2) Resume mechanism not specified (user clicks "Resume"? workflow auto-detects auth recovery?).

## Edge Case Coverage

- [ ] CHK031 Are requirements specified for schema evolution (what happens if Standard EMOS Message JSON schema version increments; migration expectations for ledger/cursors)? [Gap, Spec FR-016, FR-018]
  - data-model.md FlowV3 has `extraction_schema_version: number` but no migration policy. **Gap**: no requirements for schema version changes — what happens to existing ledger entries, cursors, or EMOS data.
- [ ] CHK032 Are requirements specified for idempotency-key format changes (explicitly treated as forbidden vs allowed with migration path)? [Coverage, Spec Edge Cases]
  - Edge case: "The system MUST use the stable format `platform:conversation_id:message_index`." The word "stable" implies immutability. **Gap**: no explicit statement that format changes are forbidden, nor a migration path if they occur.

## Non-Functional Requirements (Security / Privacy / Reliability)

- [x] CHK033 Are the "localhost-only" or "auth-token" requirements sufficiently specific (what URLs are allowed, how violations are surfaced, and any exceptions)? [Clarity, Spec FR-030]
  - FR-030: "localhost-only (no LAN exposure)" + "authenticated WebSocket with a WS auth token." Assumptions: "Gateway binds to localhost only; no LAN or remote access." data-model.md: default `ws://127.0.0.1:18789`. No exceptions.
- [x] CHK034 Are requirements specified for secret handling and redaction (where tokens/API keys may appear, what must be redacted in logs/UI exports)? [Gap, Spec FR-030]
  - FR-035: "Sensitive fields (auth tokens, API keys) MUST be redacted automatically before logging." FR-015: "The extension MUST NOT transmit its EMOS credentials to OpenClaw." No export features are in scope requiring additional redaction rules.
- [ ] CHK035 Are requirements specified for host permissions behavior (progressive permission prompts vs defaults) in a way that is user-comprehensible and verifiable? [Clarity, Spec FR-031]
  - FR-031: "may use `<all_urls>` or optional host permissions; either is acceptable as long as the user experience and security posture are clear." **Gap**: the spec explicitly defers the choice without specifying the user-facing behavior, making it untestable as written.

## Dependencies & Assumptions

- [x] CHK036 Are external dependencies required for the feature explicitly called out (Gateway running, `evermemos` plugin enabled, EMOS reachable) with remediation guidance? [Completeness, Spec Assumptions, FR-014, FR-033]
  - Assumptions: OpenClaw, EverMemOS, Chrome with host permissions. FR-033/034: degradation behavior. US2#1: "clear error messages and suggested next steps." quickstart.md: concrete setup steps. Edge cases: empty EMOS → prompts first ingestion.
- [x] CHK037 Are "standard browser automation routes" assumptions written as requirements (or explicitly deferred), including compatibility expectations for `/snapshot`, `/act`, `/navigate`, `/tabs/*`? [Ambiguity, Spec FR-014]
  - contracts/browser-proxy.md §4: full route table with routes grouped by tool group (/snapshot, /act, /navigate, /tabs/\*, etc.). Standard routes are explicitly noted as "a compatibility layer implemented during integration (the precise standard route list is owned by OpenClaw)." Extension-specific routes are fully defined.

## Ambiguities & Conflicts

- [x] CHK038 Are potentially ambiguous UX terms in the spec quantified ("visible progress", "clear message", "suggested next steps", "action required")? [Ambiguity, Spec US1–US4]
  - "visible progress": US2#2 specifies "current step, items processed" and the spec now defines this as: Workflows tab MUST show, for any in-flight run, the current logical step label (e.g., "Listing conversations", "Ingesting messages") and a numeric counter of processed items out of total-known items when available (e.g., "23 items processed", "23/100 items processed"). "action required": FR-023 defines the text "Action required: please log in to <platform>" and the spec now requires this banner to remain pinned at the top of the Workflows tab until the run resumes or is cancelled. "clear message" and "suggested next steps": FR-014/FR-033/FR-034/US2#1 now enumerate three error classes (Gateway unreachable, invalid token/credentials, EMOS unreachable) and require each error to include (a) a short title ("Cannot reach Gateway", "Invalid token", "Cannot reach EverMemOS"), (b) a one-sentence description in plain language, and (c) at least one concrete next-step CTA (e.g., "Check that OpenClaw is running on 127.0.0.1:18789", "Re-enter your Gateway token", "Check that EverMemOS is running and your API key is valid").
- [x] CHK039 Are there any conflicts between user stories and functional requirements (e.g., Memory tab delete semantics vs EMOS API support) explicitly resolved in the requirements? [Conflict, Spec FR-010]
  - Spec §Clarifications (Session 2026-02-27 round 2) now states that EverMemOS does **not** expose a delete API for individual memories and explicitly removes "delete" from FR-010. FR-010 has been updated to describe a read-only Memory tab (browse/search + open canonical URL only), resolving the conflict between earlier "delete" semantics and the EMOS contracts.

## Summary

| Section                     | Pass   | Fail   | Total  |
| --------------------------- | ------ | ------ | ------ |
| Requirement Completeness    | 7      | 3      | 10     |
| Requirement Clarity         | 5      | 3      | 8      |
| Requirement Consistency     | 4      | 0      | 4      |
| Acceptance Criteria Quality | 1      | 3      | 4      |
| Scenario Coverage           | 3      | 1      | 4      |
| Edge Case Coverage          | 0      | 2      | 2      |
| Non-Functional Requirements | 2      | 1      | 3      |
| Dependencies & Assumptions  | 2      | 0      | 2      |
| Ambiguities & Conflicts     | 0      | 2      | 2      |
| **Total**                   | **24** | **15** | **39** |

## Notes

- Intended audience: PR reviewer
- Depth: standard
- Focus: Gateway chat + ingestion
- Previous state: 0/39 pass (all unchecked)
- Current state: 24/39 pass after spec clarification session 2026-02-27 and evaluation against spec + data-model + research + contracts + quickstart artifacts
- **Action items for remaining 15 FAIL items**:
  - CHK006 (tool card fields/truncation), CHK038 (vague UX terms), CHK039 (EMOS delete API) — spec gaps that could be addressed with another clarification round
  - CHK008 (max run duration), CHK010 (filter fields), CHK014 (message insertion), CHK031 (schema evolution), CHK032 (key format freeze) — edge-case precision items; may be acceptable to defer to plan/implementation
  - CHK012 (error mode differentiation), CHK018 (missed cron UI), CHK024 (setup start point), CHK026 (stop UI state), CHK030 (re-auth timeout/resume) — UX precision items; resolvable during implementation
  - CHK023 (SC-006 unmapped), CHK035 (host permissions UX) — minor acceptance criteria gaps
