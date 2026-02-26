# Contract — `browser.proxy` Superset Dispatcher

Ruminer implements a single routing surface, `browser.proxy`, in the extension background service
worker. It receives proxy requests from OpenClaw (via `node.invoke`) and dispatches to:

- Standard browser automation routes (handled by the existing browser tool implementations)
- Extension-specific routes (bookmarks/history/network/RR‑V3/ledger/element selection)

## 1) Request shape

```ts
type BrowserProxyRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // e.g. "/history/search"
  query?: Record<string, string>;
  body?: unknown;
};
```

## 2) Response shape

```ts
type BrowserProxyResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

Errors must be user-comprehensible and safe to display in the sidepanel tool-call cards.

## 3) Tool group enforcement (runtime layer)

Before executing any route, the dispatcher must:

- Determine the tool group for the `path` (see `contracts/tool-groups.md`)
- If the group is disabled, return:
  - `ok=false`
  - `error.code = "tool_group_disabled"`
  - `error.message` indicating which group blocked the action

## 4) Route table (MVP + platform packs)

This table defines extension-specific routes. Standard routes are treated as a compatibility layer
implemented during integration (the precise standard route list is owned by OpenClaw).

### 4.1 Observe group (read-only)

- **GET** `/tabs/list`
  - Return windows + tabs summary (active tab, urls, titles)
- **GET** `/snapshot`
  - Return page snapshot / accessibility tree (compatible with OpenClaw expectations)
- **GET** `/bookmarks/search`
  - Body/query: `{ query?: string, maxResults?: number, folderPath?: string }`
- **GET** `/history/search`
  - Body/query: `{ text?: string, startTime?: string, endTime?: string, maxResults?: number }`
- **GET** `/ledger/status`
  - Return ledger counts (ingested/skipped/failed) + last updated timestamps
- **POST** `/ledger/query`
  - Query by `platform`, `conversation_id`, `status`, prefix match, etc.

### 4.2 Navigate group

- **POST** `/navigate`
  - Body: `{ url?: string, refresh?: boolean, tabId?: number, background?: boolean }`
- **POST** `/tabs/switch`
  - Body: `{ tabId: number, windowId?: number }`
- **POST** `/tabs/close`
  - Body: `{ tabIds?: number[], url?: string }`

### 4.3 Interact group

- **POST** `/act`
  - Body: action payload compatible with OpenClaw “act” semantics (click/type/scroll/etc.)
- **POST** `/element-selection/request`
  - Human-in-the-loop interactive picker (returns picked element refs)
- **POST** `/element-selection/resolve`
  - Convert picked element(s) into stable selector candidates

### 4.4 Execute group

- **POST** `/network/request`
  - Body: `{ url: string, method?: string, headers?: Record<string,string>, body?: string, timeout?: number }`
- **POST** `/javascript/eval`
  - Body: `{ code: string, tabId?: number, timeoutMs?: number }`

### 4.5 Workflow group (RR‑V3)

These routes expose RR‑V3 management and execution for:

- Sidepanel Workflows tab
- OpenClaw `browser-ext` plugin (tool surface)

**Flows**

- **GET** `/rr_v3/flow/list`
- **GET** `/rr_v3/flow/get`
- **POST** `/rr_v3/flow/save`
- **DELETE** `/rr_v3/flow/delete`

**Triggers**

- **GET** `/rr_v3/trigger/list`
- **POST** `/rr_v3/trigger/create`
- **POST** `/rr_v3/trigger/update`
- **POST** `/rr_v3/trigger/enable`
- **POST** `/rr_v3/trigger/disable`
- **DELETE** `/rr_v3/trigger/delete`
- **POST** `/rr_v3/trigger/fire`

**Runs**

- **POST** `/rr_v3/run/enqueue`
- **GET** `/rr_v3/run/list`
- **GET** `/rr_v3/run/get`
- **GET** `/rr_v3/run/events`
- **POST** `/rr_v3/run/cancel`
- **POST** `/rr_v3/run/pause`
- **POST** `/rr_v3/run/resume`

## 5) Versioning

- Routes are versioned implicitly by the extension version.
- Breaking route changes must be reflected in:
  - `contracts/browser-proxy.md` (this file)
  - `app/openclaw-extensions/browser-ext` mappings (when implemented)
