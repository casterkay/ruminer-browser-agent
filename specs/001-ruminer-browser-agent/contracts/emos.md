# Contract — EverMemOS integration (Ruminer)

Ruminer integrates with EverMemOS (EMOS) through two independent paths:

1. **OpenClaw plugin (`app/openclaw-extensions/evermemos/`)**
   - Auto-ingests OpenClaw conversations via hook
   - Exposes Gateway methods: `evermemos.addMemory`, `evermemos.searchMemory`
2. **Extension direct EMOS client (autonomous ingestion workflows)**
   - Used by RR‑V3 ingestion workflows (ChatGPT/Gemini/Claude/DeepSeek)
   - Credentials live in extension Options (`chrome.storage.local`)

This contract defines the canonical message mapping, idempotency rules, and the minimum EMOS HTTP
API expectations for the extension direct client.

## 1) Identity conventions (single-user local)

- **sender**:
  - User messages: `me`
  - AI platform replies: `chatgpt` | `gemini` | `claude` | `deepseek`
  - OpenClaw agent replies (sidepanel chat): `agent`
- **group_id**: `{platform}:{conversation_id}`

## 2) Canonical raw item → EMOS message mapping

Each `CanonicalRawItem` becomes exactly one EMOS message:

- **message_id**: `item_key = platform:conversation_id:message_index`
- **create_time**: `timestamp` if available else ingestion time (ISO)
- **sender**: from identity conventions above
- **sender_name**: human-readable (optional; may equal sender)
- **content**: `content_text` (optionally prefixed with minimal metadata)
- **refer_list**: `[parent_item_key]` when `parent_message_id` is known
- **group_id**: `{platform}:{conversation_id}`
- **group_name**: `${PlatformName}: ${conversation_title}` (optional)
- **scene**: `"group_chat"` (if supported by EMOS)

## 3) Idempotency rules

### 3.1 Item key

```text
item_key = platform + ":" + conversation_id + ":" + message_index
```

### 3.2 Content hash

```text
content_hash = sha256(content_bytes)
```

### 3.3 Ledger + server safety

- Ruminer ledger is the **first line** of defense (skip unchanged items).
- EMOS `message_id=item_key` is the **second line** (server-side idempotent upsert).

## 4) Extension direct EMOS HTTP API (minimum expectations)

The OpenClaw plugin uses:

- `POST /api/v1/memories` to add a memory (single message payload)
- `POST /api/v1/memories/search` to search

The extension direct client should target the same endpoints.

### 4.1 Auth and headers

- `Authorization: Bearer <apiKey>`
- Optional:
  - `X-Tenant-Id: <tenantId>`
  - `X-Space-Id: <spaceId>`

### 4.2 Add / upsert

`POST {baseUrl}/api/v1/memories`

Body is an `EverMemSingleMessage`:

```json
{
  "message_id": "chatgpt:conv_abc:0",
  "create_time": "2026-02-25T01:23:45Z",
  "sender": "me",
  "content": "hello world",
  "group_id": "chatgpt:conv_abc",
  "group_name": "ChatGPT: My conversation title",
  "sender_name": "Me",
  "role": "user",
  "refer_list": ["chatgpt:conv_abc:previous"]
}
```

**Expected behavior**: create-or-update by `message_id`.

### 4.3 Search

`POST {baseUrl}/api/v1/memories/search`

Body:

- `query` (required)
- optional `group_id`, `user_id`, `limit`, `retrieve_method`, etc.

## 5) Failure handling contract (autonomous ingestion)

When EMOS is unreachable or returns non-200:

- Retry with exponential backoff (bounded)
- Record ledger entry as `failed` with `last_error`
- Do **not** advance workflow cursor past the failed item
- Surface a clear UI status + “Retry” action in Workflows tab
