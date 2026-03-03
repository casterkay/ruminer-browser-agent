# Implementation Plan: Ruminer Browser Agent

**Branch**: `001-ruminer-browser-agent` | **Date**: 2026-02-27 | **Spec**: `specs/001-ruminer-browser-agent/spec.md`  
**Input**: Feature specification from `specs/001-ruminer-browser-agent/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build a sidepanel-first Chrome MV3 extension that connects to the OpenClaw Gateway over localhost
WebSocket as an **operator/UI client** for chat (`chat.*`), and exposes browser automation via a
local MCP server (`app/native-server`). OpenClaw calls those MCP tools via the `mcp-client` plugin
(OpenClaw → MCP client → Ruminer MCP server), and the native server bridges execution to the
extension via Native Messaging.

Ruminer enforces tool groups (prompt-layer in chat UI), runs RR-V3 for reliable workflows, and
ingests AI chat history (ChatGPT first, then Gemini/Claude/DeepSeek) into EverMemOS via two paths:

- Extension direct EMOS client: autonomous ingestion workflows (RR-V3 triggered) run within the extension and convert message elements in DOM into standard EMOS message JSON.
- OpenClaw `evermemos` plugin: memory search + auto-ingest of the user's sidepanel chat with the agent.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript (monorepo uses TypeScript `^5.8.3`), Node.js (for build tooling)  
**Primary Dependencies**: Vue 3, WXT (MV3 extension framework), TailwindCSS 4, Zod, pnpm workspaces  
**Storage**: Browser local persistence (`chrome.storage.local`), IndexedDB (RR-V3 stores + ingestion ledger)  
**Testing**: Vitest (extension), `pnpm typecheck` (`tsc --noEmit`)  
**Target Platform**: Chrome extension Manifest V3 (service worker + sidepanel + options)  
**Project Type**: Monorepo (extension + shared TS package + OpenClaw plugin modules)  
**Performance Goals**: Sidepanel feels instant; memory suggestions appear within 500ms debounce budget  
**Constraints**: MV3 service worker lifecycle (restarts, no long-lived state), local-first, secrets in storage only  
**Scale/Scope**: MVP ships Chat tab + tool groups + RR-V3 workflow runtime + ChatGPT ingestion pack; then 3 more packs

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Code quality & type safety**: Strict TypeScript; explicit error handling; no dead code.
- **Pattern consistency**: Follow existing extension message/state patterns; reuse RR-V3 storage/engine patterns.
- **Best practices**: Respect MV3 SW constraints; validate untrusted inputs across boundary (content ↔ background).
- **UX**: Any long op shows progress; errors are plain-language with next steps; workflows are stoppable.
- **Engineering standards**: `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm build` pass before merge.

## Project Structure

### Documentation (this feature)

```text
specs/001-ruminer-browser-agent/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
app/
├── chrome-extension/                 # MV3 extension (Vue 3 + WXT)
│   ├── entrypoints/
│   │   ├── background/               # SW orchestration (tools, RR-V3, dispatch)
│   │   ├── sidepanel/                # Sidepanel UI (Chat/Memory/Workflows)
│   │   └── options/                  # Options (Gateway + EMOS config, tool defaults)
│   └── common/                       # Shared UI/background constants + message types
│
└── openclaw-extensions/
    ├── evermemos/                    # OpenClaw plugin (existing): add/search memory
  └── mcp-client/                   # OpenClaw plugin (existing): OpenClaw → MCP client → /mcp

packages/
├── shared/                           # Shared TS types/constants (legacy MCP tool schemas, etc.)
└── wasm-simd/                        # WASM SIMD utilities (optional)
```

**Structure Decision**: Keep the existing pnpm monorepo. Implement the new architecture primarily in
`app/chrome-extension/entrypoints/background/` (Native Messaging tool executor + RR-V3 runtime) and
`app/chrome-extension/entrypoints/sidepanel/` (Gateway WS chat UI + tool group toggles + workflows UI),
and use `app/openclaw-extensions/mcp-client` to expose MCP tools inside OpenClaw.

## Phase Plan (high-level)

### Phase 0 — Research & Interface Decisions

- Confirm OpenClaw Gateway WS frame shapes + relevant `chat.*` usage for UI.
- Decide session strategy for sidepanel (MVP: deterministic `sessionKey = "main"`).
- Align sidepanel chat transport: native-server SSE vs Gateway WS (prefer Gateway WS for OpenClaw chat).

### Phase 1 — Design Artifacts (contracts + data model)

- Define contracts for:
  - Gateway WS handshake + event framing (subset used by extension)
  - MCP tool call semantics + tool group policy (prompt-layer now; runtime layer optional)
  - Standard EMOS message JSON + ingestion ledger entry + EMOS API mapping
- Produce data model for settings, tool groups, ledger, and RR-V3 workflow entities.

### Phase 2 — Implementation Planning (ready for `/speckit.tasks`)

- Ensure OpenClaw tool calls work via `mcp-client` → local MCP server (`app/native-server`).
- Update sidepanel Chat tab to use `chat.*` Gateway methods and render tool events.
- Implement tool group toggles + prompt-layer enforcement; decide runtime enforcement location.
- Implement autonomous ingestion workflow nodes (ChatGPT pack first) + ledger + EMOS direct client.
