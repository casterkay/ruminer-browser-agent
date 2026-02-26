# Data Model — Ruminer Browser Agent

This document extracts the core entities from `specs/001-ruminer-browser-agent/spec.md` and
`docs/design/blueprint.md` and defines the minimum fields and relationships needed for Phase 1/2.

## 1) Settings (chrome.storage.local)

### 1.1 OpenClaw Gateway connection settings

**Entity**: `GatewayConnectionSettings`

- **gatewayWsUrl**: string
  - Default: `ws://127.0.0.1:18789`
- **gatewayAuthToken**: string (sensitive)
- **lastConnectedAt**: ISO string | null
- **lastConnectionError**: string | null
- **deviceId**: string | null
  - Stable device identity used in `connect` handshake for role `node`.

**Notes**

- Stored only in the extension (must not be transmitted to other components).
- UI needs a “Test connection” action.

### 1.2 EverMemOS connection settings (extension direct)

**Entity**: `EmosConnectionSettings`

- **baseUrl**: string
  - Example: `http://localhost:1995`
- **apiKey**: string (sensitive)
- **tenantId**: string | null
- **spaceId**: string | null
- **lastTestOkAt**: ISO string | null
- **lastTestError**: string | null

**Notes**

- This is the autonomous-ingestion path (RR-V3 workflows).
- Separate from OpenClaw’s `evermemos` plugin config (OpenClaw owns that copy).

### 1.3 Tool group settings

**Entity**: `ToolGroupState`

- **observe**: boolean (default true)
- **navigate**: boolean (default true)
- **interact**: boolean (default false)
- **execute**: boolean (default false)
- **workflow**: boolean (default true)
- **updatedAt**: ISO string

**Derived**

- `disabledGroups`: list of group ids where value is false
- `effectivePolicyVersion`: increment or hash used for debugging prompt/runtime mismatches

## 2) Canonical raw item (platform-agnostic extracted message)

**Entity**: `CanonicalRawItem`

From blueprint/spec. One item per message/turn.

- **platform**: `'chatgpt' | 'gemini' | 'claude' | 'deepseek'`
- **content_type**: `'message'`
- **conversation_id**: string
- **message_index**: number (0-based, stable ordering)
- **conversation_title**: string | null
- **timestamp**: ISO string | null
- **updated_at**: ISO string | null
- **role**: `'user' | 'assistant' | 'system'`
- **model_id**: string | null
- **content_text**: string
- **content_html**: string | null
- **language**: string | null
- **media**: array of `{ type: 'image' | 'file'; url: string }`
- **canonical_url**: string | null
- **parent_message_id**: string | null
- **debug_fingerprint**:
  - **extraction_schema_version**: number
  - **sentinels**: string[]
  - **page_kind**: string | null
- **raw_payload**: unknown

**Derived keys**

- **item_key**: `platform:conversation_id:message_index`
- **content_hash**: `sha256(content_bytes)`
- **group_id**: `${platform}:${conversation_id}`

## 3) Ingestion ledger (IndexedDB)

**Entity**: `IngestionLedgerEntry`

Keyed by `item_key` (unique).

- **item_key**: string (PK)
- **content_hash**: string (sha256 hex)
- **canonical_url**: string | null
- **group_id**: string
- **sender**: `'me' | 'agent' | 'chatgpt' | 'gemini' | 'claude' | 'deepseek'`
- **evermemos_message_id**: string
  - For strict idempotency: same as `item_key`
- **first_seen_at**: ISO string
- **last_seen_at**: ISO string
- **last_ingested_at**: ISO string | null
- **status**: `'ingested' | 'skipped' | 'failed'`
- **last_error**: string | null

**Rules**

- New `item_key` → ingest.
- Same `item_key` + changed `content_hash` → ingest update.
- Same `item_key` + same `content_hash` → skip.
- Cursor advances only after ledger commit with `status in {ingested, skipped}`.

## 4) RR‑V3 workflow runtime (IndexedDB via existing RR-V3 stores)

Ruminer uses the existing RR‑V3 stores implemented under
`app/chrome-extension/entrypoints/background/record-replay-v3/storage/`.

### 4.1 Flow

**Entity**: `FlowV3`

- **id**: string
- **name**: string
- **version/hash**: string (must be displayed on each run)
- **entryNodeId**: string
- **nodes/edges**: DAG only (no cycles)
- **declaredTools**: array of tool identifiers (fixed at authoring time)
- **allowedOrigins**: array of origin patterns (recommended defaults per platform)
- **extraction_schema_version**: number
- **drift_sentinels**: string[]
- **maxItemsPerRun**: number (20–50 recommended)

### 4.2 Trigger

**Entity**: `TriggerSpec`

- **id**: string
- **flowId**: string (FK)
- **type**: `interval | cron | url | dom | command | contextMenu | once | manual`
- **enabled**: boolean
- **config**: type-specific payload (cron string / interval ms / etc.)

### 4.3 Run

**Entity**: `RunRecord`

- **id**: string
- **flowId**: string (FK)
- **flowVersionHash**: string
- **status**: `queued | running | succeeded | failed | cancelled`
- **startedAt**: unix ms | null
- **finishedAt**: unix ms | null
- **tookMs**: number | null
- **error**: structured RR-V3 error | null
- **tabId**: number | null
- **attempt** / **maxAttempts**: number
- **args**: object

### 4.4 Persistent vars (cursors / checkpoints)

**Entity**: `PersistentVar`

- **key**: string (PK)
- **value**: JSON
- **updatedAt**: unix ms

**Cursor convention**

- `$cursor.{workflow_id}.last_seen_time`
- `$cursor.{workflow_id}.last_seen_conversation_id`

## 5) UI state (sidepanel)

UI state is ephemeral but worth naming for implementation tasks.

### 5.1 Chat view state

- **sessionKey**: string (MVP: `"main"`)
- **messages**: array (streaming updates)
- **pendingRunIds**: set
- **toolCallCards**: derived from `agent` events
- **memorySearchQuery**: string
- **memorySearchResults**: array (from `evermemos.searchMemory`)

### 5.2 Workflows view state

- **flows**: list of available ingestion workflows (FlowV3 metadata)
- **selectedFlowId**: string | null
- **activeRun**: run summary + progress counters
- **runHistory**: list of recent runs + event timeline
