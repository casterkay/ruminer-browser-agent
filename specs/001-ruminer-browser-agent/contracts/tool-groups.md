# Contract — Tool Groups (prompt + runtime enforcement)

Tool groups define permission boundaries for browser actions. Ruminer enforces them in **two
layers**, both inside the extension:

1. **Prompt layer** (soft): sidepanel chat prepends instructions to `chat.send`
2. **Runtime layer** (hard): `browser.proxy` dispatcher rejects disabled routes

The `browser-ext` OpenClaw plugin must remain unaware of tool groups.

## 1) Groups and defaults

| Group    | Default | Description                                  |
| -------- | ------- | -------------------------------------------- |
| Observe  | On      | Read-only (snapshots, list tabs, history…)   |
| Navigate | On      | Change active tab/page (navigate/open/close) |
| Interact | Off     | DOM manipulation (click/type/scroll/dialogs) |
| Execute  | Off     | Code/network/file I/O (cookie network, JS)   |
| Workflow | On      | RR‑V3 flow/trigger/run management            |

State is persisted in `chrome.storage.local`.

## 2) Runtime mapping: route → group

This mapping is authoritative for the dispatcher.

### Observe

- `/snapshot`
- `/tabs/*` (list only)
- `/bookmarks/*` (read/search only)
- `/history/*` (read/search only)
- `/ledger/*` (status/query)

### Navigate

- `/navigate`
- `/tabs/switch`
- `/tabs/close`

### Interact

- `/act`
- `/element-selection/*`

### Execute

- `/network/*`
- `/javascript/*`
- `/file/*` (if introduced)

### Workflow

- `/rr_v3/*`

## 3) Runtime rejection contract

If a route’s group is disabled:

- Return `ok=false`
- Use `error.code = "tool_group_disabled"`
- Use `error.message` like:
  - `"Disabled by tool group: Interact"`
- Include `details` with `{ groupId, path, method }` for debugging.

## 4) Prompt restriction contract (chat.send injection)

When the user submits a message from the sidepanel:

- Determine disabled groups
- Prepend a system instruction that:
  - Names the disabled groups
  - Lists example actions that are forbidden
  - Instructs the model to ask the user to enable the group if needed

**Example (conceptual)**:

```text
Tool group restrictions:
- Interact: disabled (do not click/type/scroll or request element selection)
- Execute: disabled (do not run JS, do not make cookie-auth network requests)

If you need a disabled tool, ask the user to enable the group first.
```

## 5) Workflows vs chat tool groups

Per spec (FR-025):

- Workflows have a fixed set of declared tools at authoring time.
- Workflow execution must be independent of chat tool group toggles.
