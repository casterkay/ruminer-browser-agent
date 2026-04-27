# Memory Conversation Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align conversation export/import, local Markdown memory, future memory backends, and native sessions around one general memory-store abstraction and the canonical `{platform}:{conversation_id}:{index}` message identity.

**Architecture:** The extension writes all conversational memory through native-server `/agent/memory/*`; EverMemOS becomes one backend behind the general memory service, not the defining abstraction. Conversation identity is `${platform}:${conversation_id}`, message identity is `${platform}:${conversation_id}:${index}`, and native Ruminer-created sessions use `platform = "ruminer"` with native `session_id` as `conversation_id`. Local Markdown exports are conversation documents named from conversation titles, with final visible chat turns only.

**Tech Stack:** TypeScript, Vue 3/WXT extension, native-server Fastify routes, SQLite, IndexedDB, Vitest, Prettier.

---

## Corrected Target Conventions

- Memory backend abstraction:
  - Use “memory” naming in extension/native code.
  - EverMemOS remains only one backend implementation, alongside local Markdown/QMD and future backends.
  - Keep `/agent/memory/*` as canonical native API.

- Conversation/session identity:
  - Imported platform conversation id: `${platform}:${conversationId}`.
  - Native Ruminer conversation id: `ruminer:${nativeSessionId}`.
  - Do not prefix native session messages with another `ruminer:` layer.

- Message identity:
  - Canonical `message_id`: `${platform}:${conversation_id}:${index}`.
  - For native Ruminer sessions: `ruminer:${session_id}:${index}`.
  - Do not use, require, or store platform-provided message ids.

- No `message_id` requirement for extracted raw platform messages:
  - Raw extractors should output `{ role, content, createTime? }`.
  - Normalization assigns canonical ids.

- Markdown files:
  - Path: `conversations/<platform>/<conversation-title-slug>--<short-conversation-id>.md`.
  - If title is absent: `conversations/<platform>/<platform>-conversation--<short-conversation-id>.md`.
  - File names must not be derived from message ids.
  - Frontmatter uses `session_id: "${platform}:${conversationId}"`.

- Document ids:
  - Remove the confusing `conversation:` prefix from memory document ids.
  - Use `document:${platform}:${conversationId}` or another clear DB-only id.
  - Do not leak DB document ids into file names.

- Digest:
  - Keep conversation digest as `sha256(stableJson([{ role, content }...]))`.
  - Continue ignoring `createTime` because most platforms do not expose it reliably.

- Ledger:
  - Remove the old per-message IndexedDB ledger.
  - Keep a single conversation-level ledger for scan state and digest checks.
  - Abandon old identity/file conventions by forcing reimport/rewrite for all existing conversation ledger entries once.

- Cleanup:
  - Reimporting a shorter or edited conversation must remove stale native session messages and stale memory rows/files.
  - Deletions/shrinkage must be part of normal upsert, not a manual cleanup step.

- Exported Markdown content:
  - Do not store hidden thinking.
  - Do not store tool calls or tool results.
  - Markdown memory contains final visible user/assistant chat turns only.
  - Ignore attachment/file export depth for this plan.

---

## Files To Modify

- `packages/shared/src/memory-identity.ts`
  - New canonical identity helpers.

- `packages/shared/src/index.ts`
  - Export memory identity helpers.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
  - Rename EMOS-specific local terms to memory terms.
  - Build `message_id = ${platform}:${conversationId}:${index}`.
  - Send `source_platform`, `conversation_id`, and `metadata.message_index`.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-client.ts`
  - Replace with or wrap a generic `memory-client.ts`.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ingestion-ledger.ts`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-policy.ts`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-ingest.ts`
- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/normalize-and-hash.ts`
  - Remove if no longer referenced by active flows, or keep only if generic workflows still need them. The default target is deletion of old per-message ledger machinery.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/conversation-ledger.ts`
  - Keep as sole ingestion ledger, add convention reset fields if needed.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/scan-and-ingest-all.ts`
  - Use one conversation-level ledger.
  - Treat missing/new convention marker as requiring full reimport/rewrite.

- `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/ingest-conversation.ts`
  - Use canonical ids and memory/session result terms.

- `app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`
  - Rename autosave helpers from EMOS to memory.
  - For native Ruminer sessions, use `ruminer:${session.id}:${index}` when writing memory.
  - Exclude tool/thinking messages from Markdown-targeted memory.

- `app/native-server/src/agent/session-service.ts`
  - Native imported session message ids become `${platform}:${conversationId}:${index}`.
  - Delete/reconcile stale rows on full upsert.

- `app/native-server/src/agent/memory/service.ts`
  - Title-based Markdown file naming.
  - Clear document id convention.
  - Upsert should delete stale memory rows when a full conversation rewrite is provided.
  - Ordering uses `metadata.message_index` or trailing `:${index}`.

- `app/native-server/src/agent/memory/markchat.ts`
  - Keep Markdown format but ensure only visible chat turns are rendered.

- Docs:
  - `specs/001-ruminer-browser-agent/spec.md`
  - `specs/001-ruminer-browser-agent/data-model.md`
  - `docs/ARCHITECTURE.md` if present
  - `docs/ISSUES.md`

---

## Task 1: Add Canonical Memory Identity Helpers

**Files:**

- Create: `packages/shared/src/memory-identity.ts`
- Modify: `packages/shared/src/index.ts`
- Test through extension/native tests in later tasks.

- [ ] **Step 1: Add helper module**

```ts
export function buildMemoryConversationId(platform: string, conversationId: string): string {
  const p = platform.trim().toLowerCase();
  const c = conversationId.trim();
  if (!p) throw new Error('platform is required');
  if (!c) throw new Error('conversationId is required');
  return `${p}:${c}`;
}

export function buildMemoryMessageId(
  platform: string,
  conversationId: string,
  index: number,
): string {
  const p = platform.trim().toLowerCase();
  const c = conversationId.trim();
  if (!p) throw new Error('platform is required');
  if (!c) throw new Error('conversationId is required');
  if (!Number.isFinite(index) || index < 0) throw new Error('index must be non-negative');
  return `${p}:${c}:${Math.floor(index)}`;
}

export function parseMemoryMessageIndex(messageId: string): number | null {
  const match = /^([^:]+):(.+):(\d+)$/.exec(messageId.trim());
  if (!match) return null;
  const parsed = Number(match[3]);
  return Number.isFinite(parsed) ? parsed : null;
}
```

- [ ] **Step 2: Export helpers**

Add:

```ts
export * from './memory-identity';
```

to `packages/shared/src/index.ts`.

- [ ] **Step 3: Verify**

Run:

```bash
pnpm typecheck
```

Expected: typecheck passes or only unrelated pre-existing issues remain.

---

## Task 2: Canonicalize Extension Ingestion Payloads

**Files:**

- Modify: `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc.ts`
- Test: `app/chrome-extension/tests/record-replay-v3/chatgpt-ingest-rpc.test.ts`

- [ ] **Step 1: Write failing test**

In the happy path test, pass a normal extracted message with no message id:

```ts
messages: [{ role: 'user', content: 'hi' }],
```

Then assert `/agent/memory/upsert` receives:

```ts
expect(body.message).toMatchObject({
  message_id: 'chatgpt:c1:0',
  group_id: 'chatgpt:c1',
  source_platform: 'chatgpt',
  conversation_id: 'c1',
  metadata: {
    message_index: 0,
  },
});
```

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter ruminer-browser-agent test -- app/chrome-extension/tests/record-replay-v3/chatgpt-ingest-rpc.test.ts
```

Expected: current code fails if it prefers any platform-provided id path or omits canonical metadata.

- [ ] **Step 3: Implement canonical ids**

In `ingest-workflow-rpc.ts`, replace platform-message-id identity logic with:

```ts
function buildMemoryMessageId(platform: string, conversationId: string, index: number): string {
  return `${platform}:${conversationId}:${index}`;
}
```

When constructing the memory message:

```ts
message_id: buildMemoryMessageId(platform, conversationId, index),
source_platform: platform,
conversation_id: conversationId,
metadata: {
  message_index: index,
},
```

- [ ] **Step 4: Verify**

Run the same focused test. Expected: PASS.

---

## Task 3: Rename EMOS Client Surface To Generic Memory Client

**Files:**

- Create: `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/memory-client.ts`
- Modify imports in ingestion and sidepanel code.
- Keep `emos-client.ts` only as a temporary compatibility shim if needed.

- [ ] **Step 1: Create generic client**

Move the generic `/agent/memory/*` code into `memory-client.ts` with names:

```ts
export interface MemorySingleMessage { ... }
export type MemoryRequestContext = { kind: 'native_memory' };
export async function memoryUpsertMessage(...)
export async function memorySearch(...)
export async function memoryDelete(...)
export async function memoryRead(...)
export async function getMemoryStatus(...)
```

- [ ] **Step 2: Keep compatibility shim**

If migration would be too broad for one commit, make `emos-client.ts` re-export generic names:

```ts
export {
  type MemorySingleMessage as EmosSingleMessage,
  type MemoryRequestContext as EmosRequestContext,
  memoryUpsertMessage as emosUpsertMemory,
  memorySearch as emosSearchMemories,
  memoryDelete as emosDeleteMemory,
  memoryRead as emosGetMemories,
  getMemoryStatus,
} from './memory-client';
```

- [ ] **Step 3: Migrate active imports**

Update active ingestion and UI code to generic names. Do not update deleted legacy files.

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
```

---

## Task 4: Remove Old Per-Message Ledger Machinery

**Files:**

- Delete if unused after migration:
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ingestion-ledger.ts`
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-policy.ts`
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/ledger-upsert.ts`
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-ingest.ts`
  - `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/normalize-and-hash.ts`
- Modify: `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/index.ts`
- Modify any node registry files importing these nodes.

- [ ] **Step 1: Find imports**

Run:

```bash
rg -n "ingestion-ledger|ledger-upsert|ledger-policy|emos-ingest|normalize-and-hash|ruminer\\.ledger_upsert|ruminer\\.emos_ingest|ruminer\\.normalize_and_hash" app packages
```

- [ ] **Step 2: Remove active registrations**

Delete registrations for:

```ts
ruminer.normalize_and_hash;
ruminer.ledger_upsert;
ruminer.emos_ingest;
```

from the plugin registry if no active builtin flow uses them.

- [ ] **Step 3: Delete legacy files**

Delete the old per-message ledger files listed above.

- [ ] **Step 4: Verify no references**

Run the same `rg` command. Expected: no references except docs/history if intentionally retained.

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

---

## Task 5: Abandon Old Conversation Ledger Conventions

**Files:**

- Modify: `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/conversation-ledger.ts`
- Modify: `app/chrome-extension/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/scan-and-ingest-all.ts`
- Test: `app/chrome-extension/tests/record-replay-v3/memory-ingest-identity.test.ts`

- [ ] **Step 1: Add convention version**

Add:

```ts
export const CURRENT_CONVERSATION_MEMORY_CONVENTION_VERSION = 2;
```

and field:

```ts
memory_convention_version?: number;
```

to `ConversationLedgerEntry`.

- [ ] **Step 2: Force one-time rewrite**

In scan decision logic:

```ts
const needsConventionRewrite =
  existing?.memory_convention_version !== CURRENT_CONVERSATION_MEMORY_CONVENTION_VERSION;
```

Treat `needsConventionRewrite` as requiring full reimport even when digest matches.

- [ ] **Step 3: Persist version**

Set `memory_convention_version: CURRENT_CONVERSATION_MEMORY_CONVENTION_VERSION` when building successful ledger entries.

- [ ] **Step 4: Test**

Create a test where an existing ledger entry has matching digest but missing version. Expected: ingestion still runs and the new ledger version is persisted.

---

## Task 6: Fix Native Imported Session Upsert And Shrinkage

**Files:**

- Modify: `app/native-server/src/agent/session-service.ts`
- Test: create `app/native-server/src/agent/session-service.test.ts`

- [ ] **Step 1: Write failing test**

Test:

```ts
await upsertIngestedConversationSession({
  platform: 'chatgpt',
  conversationId: 'c1',
  conversationTitle: 'Title One',
  conversationUrl: 'https://chatgpt.com/c/c1',
  messages: [
    { role: 'user', content: 'hello', createTime: '2024-01-01T00:00:00Z' },
    { role: 'assistant', content: 'hi', createTime: '2024-01-01T00:01:00Z' },
  ],
});

await upsertIngestedConversationSession({
  platform: 'chatgpt',
  conversationId: 'c1',
  conversationTitle: 'Title One',
  conversationUrl: 'https://chatgpt.com/c/c1',
  messages: [{ role: 'user', content: 'shorter', createTime: '2024-01-01T00:00:00Z' }],
});

const messages = await getMessagesBySessionId('chatgpt:c1');
expect(messages.map((m) => m.id)).toEqual(['chatgpt:c1:0']);
expect(messages).toHaveLength(1);
```

- [ ] **Step 2: Run test**

Expected current failure: stale second message remains and ids are not canonical if old convention is still present.

- [ ] **Step 3: Implement full reconciliation**

Before inserting messages for imported conversations:

```ts
await deleteMessagesBySessionId(sessionId);
```

Then insert with:

```ts
id: `${platform}:${conversationId}:${i}`,
conversationId: sessionId,
metadata: {
  source: 'ruminer_ingest',
  platform,
  conversationId,
  conversationTitle: title || null,
  conversationUrl: url,
  index: i,
  message_index: i,
},
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter chrome-mcp-server test -- app/native-server/src/agent/session-service.test.ts
```

---

## Task 7: Fix Markdown File Naming, Document IDs, And Stale Memory Rows

**Files:**

- Modify: `app/native-server/src/agent/memory/service.ts`
- Test: create `app/native-server/src/agent/memory/service.test.ts`

- [ ] **Step 1: Add title filename helpers**

```ts
function shortConversationSuffix(conversationId: string): string {
  const normalized = slugSegment(conversationId, 'conversation');
  return normalized.length <= 12 ? normalized : normalized.slice(0, 12);
}

function buildConversationFileSlug(args: {
  platform: string;
  conversationId: string;
  title: string | null;
}): string {
  const titleSlug = slugSegment(args.title || `${args.platform}-conversation`, 'conversation');
  return `${titleSlug}--${shortConversationSuffix(args.conversationId)}`;
}
```

- [ ] **Step 2: Use title file path and clear document id**

In document location:

```ts
const title = trimOrNull(message.group_name) ?? conversationId;
const fileSlug = buildConversationFileSlug({
  platform: sourcePlatform,
  conversationId,
  title,
});
const relativePath = path.join(MEMORY_COLLECTION_NAME, platformSlug, `${fileSlug}.md`);
const documentId = `document:${sourcePlatform}:${conversationId}`;
```

- [ ] **Step 3: Write file naming test**

Assert:

```ts
expect(result.file_path).toContain('conversations/chatgpt/my-research-chat--conv-123.md');
expect(result.document_id).toBe('document:chatgpt:conv-123');
```

for message:

```ts
{
  message_id: 'chatgpt:conv-123:0',
  group_id: 'chatgpt:conv-123',
  group_name: 'My Research Chat',
  source_platform: 'chatgpt',
  conversation_id: 'conv-123',
  metadata: { message_index: 0 },
}
```

- [ ] **Step 4: Add stale-row cleanup for full conversation rewrite**

When a full conversation import is performed, delete existing memory rows for the document/session before reinserting the current message list. If the current API only upserts one message at a time, add a native batch endpoint or a `replaceConversationMemory` service function used by ingestion.

Required behavior:

```ts
replaceConversationMemory({
  platform: 'chatgpt',
  conversationId: 'c1',
  title: 'Title',
  sourceUrl: 'https://chatgpt.com/c/c1',
  messages: [{ role: 'user', content: 'only current message', createTime: null }],
});
```

removes prior `chatgpt:c1:1` memory row and rewrites the Markdown file without that stale message.

- [ ] **Step 5: Verify ordering**

Ensure `extractMessageIndex` supports canonical ids:

```ts
const match = /^[^:]+:.+:(\d+)$/.exec(normalizeString(message.message_id));
```

and metadata `message_index` remains the first preference.

---

## Task 8: Exclude Thinking And Tool Calls From Markdown Memory

**Files:**

- Modify: `app/native-server/src/agent/memory/service.ts`
- Modify: `app/native-server/src/agent/memory/markchat.ts` only if filtering belongs at renderer boundary.
- Test: `app/native-server/src/agent/memory/service.test.ts`

- [ ] **Step 1: Add filter**

Before writing Markdown, filter rows:

```ts
function isExportedMarkdownChatMessage(row: MemoryMessageRow): boolean {
  const role = String(row.role || '').trim();
  if (role !== 'user' && role !== 'assistant') return false;
  const metadata = parseJsonObject(row.metadata);
  const messageType = typeof metadata?.message_type === 'string' ? metadata.message_type : '';
  if (messageType === 'tool_use' || messageType === 'tool_result') return false;
  if (metadata?.contains_hidden_thinking === true) return false;
  return true;
}
```

- [ ] **Step 2: Apply filter in Markdown persistence**

In `persistLocalDocument`, render only filtered rows:

```ts
const messages = (await getLocalMessagesByDocumentId(documentId)).filter(
  isExportedMarkdownChatMessage,
);
```

- [ ] **Step 3: Test**

Insert one user row, one assistant row, one tool row, and one assistant row marked `contains_hidden_thinking: true`. Assert Markdown contains only user + normal assistant content.

---

## Task 9: Rename Sidepanel Autosave To Memory And Use Native IDs

**Files:**

- Modify: `app/chrome-extension/entrypoints/sidepanel/components/AgentChat.vue`

- [ ] **Step 1: Rename helpers**

Rename local symbols:

```ts
isEmosAutosaveEnabled -> isMemoryAutosaveEnabled
queuedEmosMessageIds -> queuedMemoryMessageIds
pendingEmosMessageIds -> pendingMemoryMessageIds
emosAutosaveQueue -> memoryAutosaveQueue
toEmosMessage -> toMemoryMessage
queueEmosUpsert -> queueMemoryUpsert
enqueueEligibleEmosMessages -> enqueueEligibleMemoryMessages
```

- [ ] **Step 2: Build native memory ids**

For native Ruminer sessions, map the session to:

```ts
platform = 'ruminer';
conversation_id = session.id;
group_id = `ruminer:${session.id}`;
message_id = `ruminer:${session.id}:${index}`;
```

Use stable displayed-message order for `index`. Do not include tool messages in this index.

- [ ] **Step 3: Keep settings compatibility**

Keep `saveConversationToMemory`; treat legacy `saveConversationToEverMemOS` as fallback only.

- [ ] **Step 4: Verify**

```bash
pnpm --filter ruminer-browser-agent typecheck
```

---

## Task 10: Update Specs And Docs

**Files:**

- Modify: `specs/001-ruminer-browser-agent/spec.md`
- Modify: `specs/001-ruminer-browser-agent/data-model.md`
- Modify: `docs/ISSUES.md`
- Modify: `docs/ARCHITECTURE.md` if present.

- [ ] **Step 1: Replace identity spec**

Document:

```md
message_id = `${platform}:${conversation_id}:${message_index}`.
For native Ruminer-created sessions, platform is `ruminer` and conversation_id is the native session id.
Platform-provided message ids are stored only as metadata.
```

- [ ] **Step 2: Replace backend wording**

Document:

```md
The extension writes to the native memory API. The native memory API routes to the configured backend:
local Markdown/QMD, EverMemOS, or future backends.
```

- [ ] **Step 3: Document Markdown export policy**

Document:

```md
Markdown conversation files contain final visible user/assistant turns only. Hidden thinking,
tool_use, and tool_result events are excluded from exported Markdown.
```

- [ ] **Step 4: Remove old-ledger references**

Remove claims that the active ingestion path uses `ruminer.ingestion_ledger` per message. Replace with conversation-level ledger wording.

---

## Task 11: Full Verification

**Files:**

- No new files.

- [ ] **Step 1: Run focused tests**

```bash
pnpm --filter ruminer-browser-agent test -- app/chrome-extension/tests/record-replay-v3/chatgpt-ingest-rpc.test.ts
pnpm --filter chrome-mcp-server test -- app/native-server/src/agent/memory/markchat.test.ts
pnpm --filter chrome-mcp-server test -- app/native-server/src/agent/memory/service.test.ts
pnpm --filter chrome-mcp-server test -- app/native-server/src/agent/session-service.test.ts
```

- [ ] **Step 2: Run repo checks**

```bash
pnpm typecheck
pnpm lint
```

- [ ] **Step 3: Manual acceptance checklist**

Verify one imported ChatGPT conversation produces:

- Conversation id/group id: `chatgpt:<conversationId>`
- Memory message ids: `chatgpt:<conversationId>:0`, `chatgpt:<conversationId>:1`
- Native imported session message ids: same as memory message ids
- Native Ruminer session memory ids: `ruminer:<sessionId>:0`, `ruminer:<sessionId>:1`
- Markdown file: `~/ruminer/memory/conversations/chatgpt/<title-slug>--<short-id>.md`
- Markdown file does not include hidden thinking, tool calls, or tool results
- Reimport with same messages does not duplicate rows
- Reimport with fewer messages removes stale native session rows and stale memory rows
- Digest still ignores `createTime`

---

## Spec Coverage Review

- General memory abstraction: Tasks 3, 9, 10.
- Canonical `{platform}:{conversation_id}:{index}` ids: Tasks 1, 2, 6, 9.
- Native session convention `ruminer:${session_id}:${index}`: Task 9.
- No raw `message_id` requirement: Tasks 2, 10.
- Title-based filenames: Task 7.
- `conversation:` prefix removal: Task 7.
- Old per-message ledger removal: Task 4.
- Deletions/shrinkage cleanup: Tasks 6, 7.
- Digest behavior preserved: target conventions and Task 11.
- No thinking/tool calls in Markdown: Task 8.
