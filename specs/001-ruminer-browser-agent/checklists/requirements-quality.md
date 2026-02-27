# Requirements-Quality Checklist: Ruminer Browser Agent

**Purpose**: Unit-test the written requirements for clarity, completeness, and measurability (focus: OpenClaw Gateway chat + ingestion pipeline).  
**Created**: 2026-02-27  
**Feature**: [spec.md](../spec.md)

## Requirement Completeness

- [ ] CHK001 Are all required user-configurable connection fields specified for OpenClaw Gateway (WS URL, auth token, “test connection” behavior)? [Completeness, Spec FR-014]
- [ ] CHK002 Are all required user-configurable connection fields specified for extension-direct EMOS (base URL, API key, tenant/space IDs, “test connection” behavior)? [Completeness, Spec FR-014, FR-015]
- [ ] CHK003 Are requirements specified for first-time Gateway node pairing approval (“pairing required” state and user next steps)? [Gap, Spec FR-014, FR-030]
- [ ] CHK004 Is the sidepanel chat session routing strategy specified (what `sessionKey` is used, whether it’s user-visible, and whether it is stable across restarts)? [Clarity, Spec US1]
- [ ] CHK005 Are the required Gateway chat capabilities explicitly listed (history, send, abort, streaming events) in requirements (not just in design docs)? [Gap, Spec FR-003, FR-014]
- [ ] CHK006 Are the tool-call inline rendering requirements complete (what statuses exist, what fields must be displayed, truncation rules for large tool payloads)? [Completeness, Spec US1]
- [ ] CHK007 Are ingestion workflow prerequisites explicitly specified (must be logged in; what constitutes “authenticated”; what is “action required”)? [Completeness, Spec FR-023, Edge Cases]
- [ ] CHK008 Are ingestion workflow batch bounds fully specified (default size, configurability, continuation triggers, maximum run duration constraints)? [Completeness, Spec FR-021, US2]
- [ ] CHK009 Are cursor/checkpoint keys and cursor advancement rules specified in requirements (not only in blueprint)? [Gap, Spec FR-021, Edge Cases]
- [ ] CHK010 Are requirements specified for conversation filtering inputs (date range / length): required fields, validation rules, and how filters affect idempotency/cursors? [Completeness, Spec FR-027]

## Requirement Clarity

- [ ] CHK011 Is “memory search results appear within 500ms (debounced)” defined with a clear measurement point (from keystroke to UI update) and clear debounce parameters? [Clarity, Spec US1, SC-001]
- [ ] CHK012 Is “OpenClaw Gateway connection verified” defined with clear success/failure criteria and user-facing next steps (token invalid vs Gateway unreachable vs pairing required)? [Clarity, Spec FR-014, US2]
- [ ] CHK013 Is “tool group toggles restricted immediately” defined precisely (which requests are blocked, how errors are surfaced, and whether in-flight runs are affected)? [Clarity, Spec FR-007, SC-005]
- [ ] CHK014 Is “idempotent ingestion” defined with explicit identity rules for `message_index` ordering and how edits/insertions in the source conversation are handled? [Clarity, Spec FR-017, FR-020]
- [ ] CHK015 Is the **standard EMOS message JSON** fully constrained (required vs optional fields, acceptable nullability, and how missing timestamps are handled)? [Clarity, Spec FR-016]
- [ ] CHK016 Is the EverMemOS mapping specified clearly (what exact content goes into `content`, whether metadata prefixes are allowed, and how `refer_list` is derived)? [Clarity, Spec FR-019]
- [ ] CHK017 Is “workflow stoppable” defined in terms of user-perceived latency and state guarantees (what is preserved on stop, what is rolled back)? [Clarity, Spec FR-013, SC-004]
- [ ] CHK018 Is “best-effort cron scheduling (only while browser running)” written as a user-facing requirement (not just a design note), including what UI messaging is required? [Clarity, Spec FR-024]

## Requirement Consistency

- [ ] CHK019 Do requirements for tool groups remain consistent across spec sections (defaults, groups list, enforcement layers, and storage/persistence)? [Consistency, Spec FR-006–FR-009]
- [ ] CHK020 Are workflow permission requirements consistent with chat tool group requirements (workflows independent of chat toggles; declared tools enforced at runtime)? [Consistency, Spec FR-025]
- [ ] CHK021 Are modular degradation requirements consistent across chat vs ingestion (no Gateway, no EMOS plugin, no extension EMOS config)? [Consistency, Spec FR-033, FR-034]
- [ ] CHK022 Are identity conventions consistent across ingestion and chat (sender ids, `group_id` format) and referenced wherever needed (Memory tab, workflows, search filters)? [Consistency, Spec FR-019, Assumptions]

## Acceptance Criteria Quality (Measurable Outcomes)

- [ ] CHK023 Are measurable outcomes mapped to explicit acceptance scenarios (e.g., SC-001 ↔ US1 acceptance #2) without relying on implied behavior? [Measurability, Spec SC-001, US1]
- [ ] CHK024 Is the “setup under 2 minutes” success criterion defined with an unambiguous start/end and what counts as “complete”? [Measurability, Spec SC-002]
- [ ] CHK025 Is “zero duplicates on three consecutive re-runs” defined with an objective method to detect duplicates (by `message_id`, by content hash, by EMOS query)? [Measurability, Spec SC-003, FR-020]
- [ ] CHK026 Is the “stop within 2 seconds” criterion defined with measurement conditions and what UI state must change within that window? [Measurability, Spec SC-004, FR-013]

## Scenario Coverage (Primary / Alternate / Recovery)

- [ ] CHK027 Are requirements specified for the “EMOS configured but empty dataset” scenario (expected UI empty-state messaging and suggested next action)? [Coverage, Spec Edge Cases]
- [ ] CHK028 Are requirements specified for “EMOS unreachable during ingestion” including retry/backoff limits, user feedback, and cursor non-advancement guarantees? [Coverage, Spec Edge Cases]
- [ ] CHK029 Are requirements specified for “service worker restart mid-run” beyond “it resumes” (which step boundaries are valid checkpoints; what can be repeated safely)? [Coverage, Spec FR-021, US2]
- [ ] CHK030 Are requirements specified for “platform re-auth required mid-run” including how long the run waits, what notifications appear, and how the user resumes? [Coverage, Spec Edge Cases, FR-023]

## Edge Case Coverage

- [ ] CHK031 Are requirements specified for schema evolution (what happens if canonical raw item schema version increments; migration expectations for ledger/cursors)? [Gap, Spec FR-016, FR-018]
- [ ] CHK032 Are requirements specified for idempotency-key format changes (explicitly treated as forbidden vs allowed with migration path)? [Coverage, Spec Edge Cases]

## Non-Functional Requirements (Security / Privacy / Reliability)

- [ ] CHK033 Are the “localhost-only” or “auth-token” requirements sufficiently specific (what URLs are allowed, how violations are surfaced, and any exceptions)? [Clarity, Spec FR-030]
- [ ] CHK034 Are requirements specified for secret handling and redaction (where tokens/API keys may appear, what must be redacted in logs/UI exports)? [Gap, Spec FR-030]
- [ ] CHK035 Are requirements specified for host permissions behavior (progressive permission prompts vs defaults) in a way that is user-comprehensible and verifiable? [Clarity, Spec FR-031]

## Dependencies & Assumptions

- [ ] CHK036 Are external dependencies required for the feature explicitly called out (Gateway running, `evermemos` plugin enabled, EMOS reachable) with remediation guidance? [Completeness, Spec Assumptions, FR-014, FR-033]
- [ ] CHK037 Are “standard browser automation routes” assumptions written as requirements (or explicitly deferred), including compatibility expectations for `/snapshot`, `/act`, `/navigate`, `/tabs/*`? [Ambiguity, Spec FR-014]

## Ambiguities & Conflicts

- [ ] CHK038 Are potentially ambiguous UX terms in the spec quantified (“visible progress”, “clear message”, “suggested next steps”, “action required”)? [Ambiguity, Spec US1–US4]
- [ ] CHK039 Are there any conflicts between user stories and functional requirements (e.g., Memory tab delete semantics vs EMOS API capabilities) explicitly resolved in the requirements? [Conflict, Spec FR-010]

## Notes

- Intended audience: PR reviewer
- Depth: standard
- Focus: Gateway chat + ingestion
