# Ruminer Browser Agent — Product Pitch

The core problem this app solves: automatically and securely collect user's history conversations on different AI chat platforms; Ruminer browser agent acts as a central node connected with 4 AI chat platforms in the frontend and 3 AI agent engines in the backend, integrating user's conversations in all these channels into a single centralized memory store - EverMemOS! The AI agents play a two-fold role: one is driving browser automation to autonomously collect messages on web platforms or perform general browser-based tasks; the other is communicating with the user equipped with tools to intelligently and deeply retrieve from user's integrated digital memory. The whole system is integrated into a true AI assistant that understands the user and works for the user on browser.

## One-liner

**The AI agent you love with centralized memory integration from all your AI chat platforms.**

- Continuously import conversations into EverMemOS across AI chat platforms: ChatGPT, Gemini, Claude, and DeepSeek.
- Your user credentials on these platforms stay secure in your own browser, never uploaded to cloud.
- Freely choose your agent engine with browser automation capabilities: OpenClaw, Claude Code, or Codex.
- Make your agent understand you deeply via RAG from your centralized EverMemOS memory store.
- Seamlessly integrated into your Chrome browser with beautiful UI.

## The core problem

Users don’t have “one AI” anymore. They have many:

- Conversations are **fragmented** across AI chat platforms.
- Important context (decisions, prompts, code, plans) gets **lost** in tabs and scrollback.
- Copy/paste “memory” is **manual**, inconsistent, and doesn’t compound.
- Agents without your history are **shallow**; agents without tools are **passive**.

## The big idea

Make the **browser** the integration hub.

If the browser is where AI conversations happen, then the browser can be the secure, user-controlled bridge that:

1. **Collects conversation history automatically** from web platforms
2. **Normalizes and stores it** in EverMemOS as durable memory
3. Enables agents to **retrieve + reason + act** with continuity

## What Ruminer is (today)

Ruminer acts as a central node:

- **Frontend (4 AI chat platforms):** ChatGPT, Gemini, Claude, DeepSeek
- **Backend (3 agent engines):** OpenClaw, Claude Code, Codex CLI
- **Memory layer:** EverMemOS (single source of truth for your integrated conversation memory)

Ruminer’s agents play a two-fold role:

1. **Operator:** drive browser automation to autonomously collect messages and perform browser-based tasks
2. **Assistant:** communicate with the user, equipped with tools to intelligently retrieve from integrated memory

## How it works (mental model)

```text
AI chat platforms (web) -> Ruminer Chrome Extension -> EverMemOS

Agent engines (OpenClaw / Claude Code / Codex)
  -> MCP tools (localhost)
  -> Ruminer Native Server
  -> Native Messaging
  -> Chrome Extension (MV3 background) -> Chrome APIs (tabs, scripting, debugger, ...)
```

## Why this wins (differentiation)

- **Browser-native:** works with your real logged-in sessions and web UI flows
- **Memory as infrastructure:** not a “chat export,” but durable, queryable memory in EverMemOS
- **Agents that think _and_ do:** deep retrieval + real-world browser actions
- **Multi-engine compatibility:** plug in multiple agent runtimes via MCP

## Product pillars

### 1) Centralize your digital memory

- Unify conversations across platforms into one store (EverMemOS)
- Enable long-horizon recall: “what we decided,” “why,” and “what’s next”

### 2) Agents that can both retrieve and automate

- Autonomous ingestion workflows (collect history without manual copy/paste)
- Browser task execution with continuity from past context

### 3) Secure, user-controlled, local-first

- Local MCP endpoint by default (`http://127.0.0.1:12306/mcp`)
- Permissioned tool groups: Observe / Navigate / Interact / Execute / Workflow
- Workflows built for MV3 reliability (survive service worker restarts)

## High-signal use cases

- **Cross-platform recall:** “Summarize what I concluded about X across all AI chats.”
- **Decision recovery:** “What did I decide last time? What were the open questions?”
- **Auto-ingest:** scheduled ingestion so your memory stays current.
- **Memory-aware action:** “Open the page we used last time, continue the workflow, and report results.”

## Who it’s for

- Power users who rotate between multiple AI chats daily
- Builders (engineers, founders, PMs) who need decisions and context to persist for weeks/months
- Researchers/writers who need long-horizon retrieval across scattered threads

## Demo script (3 minutes)

1. Show multiple AI chat tabs open → highlight fragmented memory.
2. Run an ingestion workflow → show content landing in EverMemOS.
3. Ask a memory question (“What did we decide about X?”) → show deep retrieval.
4. Ask for an action (“Continue the task in browser…”) → show tool-driven automation.
5. Close: “Ruminer doesn’t just answer—it remembers and works.”

## Key message

Ruminer turns AI chats into **durable memory**, and turns memory into a **capable assistant** that understands you and
works for you—directly in the browser.
