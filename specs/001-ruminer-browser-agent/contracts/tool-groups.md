# Contract — Tool Selection (prompt allowlist + runtime enforcement)

Tool selection is the user-controlled permission boundary for browser automation tools. Ruminer
enforces it in **two layers**, both inside the extension:

1. **Prompt layer (soft)**: when the sidepanel sends `chat.send` to OpenClaw, it prepends a system
   instruction that includes an **allowlist** of browser tools currently enabled.
2. **Runtime layer (hard)**: the extension background rejects MCP tool calls that are not allowed by
   the current selection.

OpenClaw’s `mcp-client` plugin and Ruminer’s native server do **not** enforce tool selection. The
extension background is the source of truth for enforcement.

---

## 1) UI model: groups + per-tool overrides

Ruminer exposes tool selection as:

- **Tool groups** (coarse toggles): `observe | navigate | interact | execute | workflow`
- **Per-tool overrides** (fine toggles): disable individual tool IDs within enabled groups

Default group state:

| Group    | Default | Description                                  |
| -------- | ------- | -------------------------------------------- |
| Observe  | On      | Read-only (snapshot, list tabs, history…)    |
| Navigate | On      | Change active tab/page (navigate/open/close) |
| Interact | Off     | DOM interaction (click/type/dialogs)         |
| Execute  | Off     | Script/network/file-like actions             |
| Workflow | On      | Record/Replay (flows, runs, triggers)        |

---

## 2) Storage contract (chrome.storage.local)

Selection is persisted in two keys:

- `toolGroupState` (`STORAGE_KEYS.TOOL_GROUP_STATE`)
  - Shape: `{ observe, navigate, interact, execute, workflow, updatedAt }`
- `individualToolState` (`STORAGE_KEYS.INDIVIDUAL_TOOL_STATE`)
  - Shape: `{ overrides: Record<string, boolean>, updatedAt }`
  - Convention: only `false` is persisted as an override (absence means “not individually disabled”).

Legacy tool IDs may be migrated to canonical MCP tool names (e.g. `chrome_file_upload →
chrome_upload_file`).

---

## 3) Effective allowlist contract (itemwise)

Define `enabledToolIds` as the effective allowlist:

- A tool is enabled **iff** its **group toggle** is on **and** `overrides[toolId] !== false`.
- Unknown/unmapped tool IDs are **disabled by default** (security-by-default).
- Tool names may be normalized via a legacy-alias table before evaluation.

---

## 4) Runtime enforcement contract (hard)

**Enforcement point (authoritative)**:

- Extension background Native Messaging handler for `NativeMessageType.CALL_TOOL` (MCP tool calls
  coming from the native server), in `app/chrome-extension/entrypoints/background/native-host.ts`.
- Also applies to the UI bridge message `{ type: 'call_tool' }` for direct UI → background tool calls.

**Behavior**:

- If tool is disabled:
  - Return a normal MCP `ToolResult` with `isError=true`
  - Error message: `Disabled tool: <toolName>. Enable it in Ruminer → Tools.`
  - Native Messaging envelope still responds with `status: 'success'` so the MCP caller receives a
    regular tool result (not a transport error).
- If tool is enabled: execute normally.

**Scope boundary**:

- Enforcement applies to **MCP tool calls only**.
- Internal RR‑V3 workflow execution (scanner/ingest runs inside the extension) must **not** be
  blocked by chat/tool selection.

---

## 5) Prompt restriction contract (soft)

When the user sends a message from the sidepanel Chat tab, the extension prepends:

```text
Browser tool restrictions (enforced at runtime):
- Allowed browser tools: <comma-separated tool IDs>
- Do not use any other browser tools.

Ask the user to enable a tool in Ruminer → Tools before using it.
```

If no tools are enabled, it must state that explicitly and instruct the agent to ask for enabling
tools.

---

## 6) Workflows and approvals

Workflows may declare `flow.meta.requiredTools` (MCP tool IDs) and the UI may require re-approval
before enqueueing if the required tool list changes.
