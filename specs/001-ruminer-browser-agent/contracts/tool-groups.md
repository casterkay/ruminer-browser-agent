# Contract — Tool Selection (per-tool prompt + runtime enforcement)

Ruminer exposes browser automation tools to OpenClaw via MCP (`mcp-client` plugin → Ruminer native
server → Native Messaging → extension background). Users must be able to enable/disable tools
**itemwise**, and the extension must enforce that policy at runtime.

This contract replaces any prior “route → group” dispatcher mapping.

---

## 1) Policy Inputs (authoritative state)

Tool policy is derived from two persisted states in `chrome.storage.local`:

1. **Tool group state**: group toggles (Observe / Navigate / Interact / Execute / Workflow / Memory)
2. **Individual tool state**: per-tool overrides (`toolName -> false` means disabled)

Defaults MUST be safe:

- Observe: On
- Navigate: On
- Interact: On
- Execute: Off
- Workflow: On
- Memory: On

Defaults apply only when state is unset; existing stored user state must be preserved.

---

## 2) Effective Policy Computation (itemwise)

The extension must compute an **effective enabled set** of tool names:

- A tool is **enabled** iff:
  - its **group** is enabled, and
  - it is not individually overridden as disabled.
- **Unknown tool names** are **disabled by default** (security-by-default).

### Normalization / Legacy Aliases

If legacy tool names can still arrive at the runtime boundary, the background must normalize them
before policy evaluation using a small alias table (e.g. `chrome_file_upload -> chrome_upload_file`).

---

## 3) Runtime Enforcement Contract (hard enforcement)

### Boundary + Scope (locked)

Runtime enforcement MUST happen in the **extension background**, at the Native Messaging tool-call
entrypoint:

- Enforce inside `NativeMessageType.CALL_TOOL` handling (Native Messaging messages coming from the
  native server).
- Also enforce the same policy for the internal UI bridge path (`chrome.runtime.onMessage` with
  `{ type: 'call_tool' }`), so direct UI calls behave identically.

Enforcement scope is **MCP tool calls only**. Internal RR‑V3 workflow execution MUST NOT be blocked
by chat/tool selection.

### Rejection Semantics

If a tool is disabled by policy:

- Return a normal MCP tool result with `isError=true` (so the caller receives a tool result rather
  than a transport error).
- The error message MUST be actionable and stable, e.g.:
  - `Disabled tool: <toolName>. Enable it in Ruminer → Tools.`

Unknown tool names MUST be rejected by default with the same semantics.

---

## 4) Prompt-Layer Injection Contract (soft restriction)

When the user submits a message from the sidepanel chat, the extension MUST inject a system
instruction that lists **disabled tools itemwise** (tool names), derived from the same effective
policy computation as runtime enforcement.

The instruction MUST:

- List disabled tool names explicitly (comma-separated is acceptable).
- Instruct the model not to call disabled tools.
- Instruct the model to ask the user to enable a tool in Ruminer → Tools if needed.

**Example (conceptual)**:

```text
Tool restrictions (enforced at runtime):
- Disabled tools: chrome_click_element, chrome_fill_or_select, chrome_javascript
- Do not use any disabled tools.

Ask the user to enable a tool in Ruminer → Tools before using it.
```

---

## 5) Catalog Completeness (contract tests)

The UI tool catalog and the runtime policy mapping must cover all exposed MCP tools:

- Every tool name exposed via `TOOL_SCHEMAS` MUST appear in the UI catalog unless it is explicitly
  excluded with a documented rationale.
- Contract tests must validate:
  - Catalog/tool-schema completeness.
  - Group-off disables all tools in the group.
  - Individual override disables a specific tool.
  - Unknown tool name resolves to disabled.

---

## 6) Workflows vs Chat Tool Selection

Workflows have their own declared tool set and approval flow (FR‑032/FR‑025):

- Workflow execution must be independent of chat tool selection.
- Chat tool selection enforcement applies only to MCP tool calls coming from OpenClaw (native-server
  → Native Messaging `CALL_TOOL`) and the UI bridge `{ type:'call_tool' }`.
