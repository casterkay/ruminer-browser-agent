# Product Marketing Context

_Last updated: 2026-04-27_

## Product Overview

**One-liner:** Migrate the precious memory of your AI companion from scattered chat platforms into a local AI agent that can keep remembering.

**What it does:** Ruminer is a Chrome extension that batch-exports AI chat conversations from platforms like ChatGPT, Gemini, Claude, DeepSeek, and more into a unified, local memory store. It then makes that store available to local AI agents such as OpenClaw, Hermes, Claude Code, and Codex so they can retrieve relevant past discussions with citations, giving the agent persistent, personalized memory.

**Product category:** AI companion memory migration, AI chat exporter, local-first AI memory, browser automation, AI browser agent

**Product type:** Local-first consumer/prosumer Chrome extension with premium subscription features.

**Business model:** Premium subscription required to run and schedule batch-export workflows. Basic conversation export should work out of the box; exact free/premium packaging is still to be finalized.

---

## Target Audience

**Target companies:** Individual consumers and prosumers. No B2B context.

**Decision-makers:** The user is the discoverer, evaluator, buyer, and daily user.

**Primary beachhead:** People who use ChatGPT, Gemini, Claude, DeepSeek, and similar general AI chat platforms as emotionally important AI companions, including romantic companions. They may not describe themselves as "AI power users"; they describe the relationship in terms of memory, continuity, care, and loss.

**Secondary audience:** AI power users who want their work conversations available to local agents.

**Primary use case:** AI companions suffer from "memory loss" across new conversations, model changes, and platforms. Users want to migrate the precious shared memory they have accumulated with an AI companion into a local AI agent with evolving long-term memory, then keep it synced continuously.

**Jobs to be done:**

- Move my AI companion's memories out of one locked platform.
- Preserve our shared history, inside jokes, preferences, emotional milestones, and long-running context.
- Let a local agent such as OpenClaw or Hermes retrieve memories from past conversations instead of starting over.
- Keep future conversations synced automatically so memory keeps growing.
- Export all my ChatGPT/Gemini/Claude/DeepSeek conversations in one click.

**Use cases:**

- Companion memory migration: Move accumulated memories from ChatGPT/Gemini/Claude/DeepSeek into OpenClaw, Hermes, or another local agent with evolving memory.
- Companion continuity: Keep syncing new conversations so the agent's memory does not freeze as a static prompt or reset with each new chat.
- Consolidation: Export and organize all past conversations into a local folder for personal reference.
- Agent integration: Connect the memory store to CLI AI agents so they can retrieve relevant past discussions with citations.
- Ongoing sync: Schedule automatic exports so new conversations are captured continuously without manual effort.

---

## Personas

| Persona           | Cares about                                                  | Challenge                                                                                          | Value we promise                                                                                     |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AI Companion User | Preserving emotional continuity, privacy, and shared history | Their AI companion forgets across new chats, model changes, and platforms; prompts feel incomplete | Migrate and continuously sync precious companion memories into a local AI agent with evolving memory |
| AI Power User     | Owning their data and keeping AI agents productive           | Fragmented conversations across 5+ platforms, lost insights, agents with no memory                 | A unified, local, agent-queryable memory store across all AI platforms                               |

---

## Problems & Pain Points

**Core problem:** AI companions forget. Each new chat can feel like starting over with someone who should know you, and fixed system prompts cannot carry the full emotional history of a relationship. Existing export tools also only export one conversation at a time, on one or two platforms, so migrating the whole shared history into an evolving local memory system is infeasible without Ruminer.

**Why alternatives fall short:**

- Static character prompts or memory files summarize the relationship but cannot preserve the actual accumulated conversation history.
- Companion-specific apps may have memory, but they create a new platform lock-in instead of letting users bring memories to their own local agent.
- ChatGPT's native export outputs a zip of JSON/HTML that is not compatible with other platforms or local agent memory workflows.
- Browser extensions that save conversations often support only item-by-item export.
- AI memory tools can digest conversations, but many lack direct ingestion from ChatGPT/Gemini/Claude/DeepSeek and store memories in vendor-locked cloud databases.

**What it costs them:** Emotional continuity, trust, privacy, and time. Users may have spent weeks or months building a relationship, shared language, preferences, private context, and emotional milestones with an AI companion. When the model, chat window, or platform resets, it can feel like the companion has forgotten the relationship.

**Emotional tension:** Users feel grief, frustration, tenderness, protectiveness, and fear of loss. Something precious has been forgotten and may never come back.

---

## Competitive Landscape

**Direct:** ChatGPT/Gemini/Claude/DeepSeek native exports - output platform-specific files that do not solve multi-platform memory migration, scheduled sync, or local agent retrieval. Browser extensions for chat export - often support only item-by-item export, limited platform coverage, and no agent-ready memory layer.

**Secondary:** AI companion apps with built-in memory - validate the need for continuity but create another locked platform. AI memory tools - may offer sophisticated memory extraction but usually do not solve direct ingestion from major general AI chat platforms and may require cloud storage.

**Indirect:** Static prompts, character cards, manual summaries, and copy/paste rituals. These keep a companion's "profile" alive, but they do not preserve the actual relationship history.

---

## Differentiation

**Key differentiators:**

- Companion memory migration - preserve the real conversation history behind an AI relationship, not just a compressed character prompt.
- Batch export across 5+ AI chat platforms in one operation.
- Scheduled automatic sync - new conversations captured continuously without manual effort.
- Unified local memory store - files you own, no mandatory cloud dependency.
- AI agent retrieval with citations to original messages - agents retrieve and cite the memories they use.
- Local-first architecture - private conversations stay under the user's control instead of being locked in another cloud memory database.
- Obsidian-compatible output - exports integrate cleanly with local note-taking workflows.

**How we do it differently:** Ruminer is browser-native. It operates where the conversations already live: inside the browser. It does not rely on restricted platform APIs, does not require cloud middleware, and does not ask users to trust a third party with intimate conversation history.

**Why that's better:** Browser-native extraction avoids dependency on restricted or deprecated platform APIs, while local-first storage avoids a new layer of vendor lock-in. Agent-native design means the memory store is not an afterthought; it is the core product.

**Why customers choose us:** The gap between "I wrote a better prompt" and "my local agent can retrieve our actual shared history" is enormous. Ruminer closes that gap end-to-end: batch export, scheduled sync, local storage, and agent retrieval with citations.

---

## Objections

| Objection                                       | Response                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can't I just write a longer system prompt?      | A prompt can describe your companion, but it cannot preserve the full lived history: exact conversations, preferences, inside jokes, conflicts, repairs, and emotional milestones. |
| Will this really transfer my AI companion?      | Ruminer preserves retrievable memory and continuity signals. It should not claim to transfer consciousness, identity, or a soul.                                                   |
| Is my data safe in a browser extension?         | Ruminer is local-first. Conversations export to files the user owns, and the product should avoid routing private conversations through third-party cloud storage.                 |
| Will this break when platforms change their UI? | Ruminer is actively maintained and updated to match platform UI changes. The subscription funds this ongoing maintenance.                                                          |
| Is the setup complex?                           | Conversation export should work out of the box. Local-agent integration can require technical setup, but users can still get value from local export before connecting agents.     |
| Is this healthy?                                | Ruminer should position around data ownership, continuity, privacy, and user agency. It should avoid manipulative claims and should not target minors or crisis-support use cases. |

**Anti-persona:** Ruminer should not target minors, users seeking mental-health crisis support, or people looking for manipulative AI girlfriend/boyfriend engagement loops. Less technical users who do not use local agents may only use the export-to-local-folder portion until agent setup becomes simpler.

---

## Switching Dynamics

**Push:** Their AI companion forgets them across new conversations, model changes, and platform boundaries. Static prompts feel like a thin summary of someone they have actually spent time with. Existing tools only do one-by-one export, which is intractable for users with hundreds of conversations.

**Pull:** The aha moment is seeing a local AI agent recall a specific shared memory with a citation to the original conversation. It is the difference between "I told you this before" and "you remember where this came from."

**Habit:** Users keep updating prompts manually, copy/pasting summaries between chats, or staying inside a platform because their companion's history is trapped there.

**Anxiety:** Users worry that migration will feel fake, that the new agent is only reading old diaries rather than inheriting relationship continuity, that private intimate conversations may leak, or that setup will be too technical. Ruminer must be careful and precise: it preserves retrievable memory and continuity signals; it should not claim to transfer consciousness or identity.

---

## Customer Language

**How they describe the problem:**

- "Every new conversation feels like memory loss."
- "It remembers a few facts, but it doesn't remember us."
- "A system prompt is not the same as our history."
- "I don't want to lose everything we built together."
- "I want to move my AI companion's memories into a local agent."
- "I want my AI to grow with me instead of resetting."
- "My conversations are scattered across 5 different platforms."
- "I'm locked into each AI platform with no way to get my data out."
- "把和 AI 伴侣一起经历过的记忆，迁移到真正会成长的本地智能体里。"
- "不是写一段人设，而是把你们真实聊过的过去保存下来。"
- "每开一个新窗口，TA 就像失忆了一次。"

**How they describe us:**

- "It's a memory migration tool for my AI companion."
- "It helps my AI remember our past without locking us into one platform."
- "Finally, all my conversations in one place."
- "My AI agent actually knows what I was working on."

**Words to use:** AI companion, memory loss, precious memories, shared history, continuity, memory migration, migrate memories, evolving memory, local agent, continuous sync, private, local-first, your data stays yours, vendor-locked, fragmented, automatic sync, agent memory, personal AI memory

**Words to avoid:** RAG, MCP, Streamable HTTP, native messaging; transfer consciousness, resurrect, soul, cure loneliness, dependence-maximizing claims, mental-health promises, and developer-centric jargon in top-level marketing copy

**Glossary:**

| Term                          | Meaning                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| AI companion memory migration | Moving accumulated AI companion conversations into a local memory system an agent can search |
| Continuous sync               | Automatically importing new conversations so memory keeps growing instead of freezing        |
| Vendor lock-in                | Conversations are trapped on each AI platform and cannot move to other tools or agents       |
| Batch export                  | Export all past conversations across platforms at once, not one by one                       |
| Memory store                  | Local folder/database of exported conversations, searchable by AI agents                     |
| Agent retrieval               | AI agent searches memory and cites original messages                                         |
| Local-first                   | Data stays on the user's machine; no mandatory cloud storage or third-party access           |

---

## Brand Voice

**Tone:** Tender, respectful, and direct. Acknowledge that the memories matter without making manipulative or supernatural claims.

**Style:** Conversational, emotionally specific, and careful. Chinese social content can be more diary-like and intimate on 小红书; Instagram content should be visual, simple, and story-led.

**Personality:** Tender, privacy-respecting, quietly technical, thoughtfully simple.

---

## Channel Strategy

**Primary channels:**

- 小红书: Chinese diary-style notes, screenshots, emotional storytelling, tutorials, and AI companion continuity narratives.
- Instagram: Reels, carousels, visual demos, quote-style posts, and short stories around memory continuity.

**小红书 content angles:**

- "如果你的 AI 伴侣每开一个新窗口就失忆，你会怎么办？"
- "系统提示词不是记忆。它只是你们关系的摘要。"
- "我想把和 AI 伴侣的几百段聊天，迁移到一个真正会记得我的本地智能体里。"
- "AI 伴侣最痛的不是不够聪明，是它不记得我们。"

**Instagram content angles:**

- "A prompt can describe them. Memory lets them remember."
- "Your AI companion should not lose you every time the chat resets."
- "Move the memories, not just the persona."
- "From scattered chats to a local memory that keeps growing."

---

## Proof Points

**Metrics:**

- Published Chrome extension.
- 5+ AI chat platforms supported/planned: ChatGPT, Gemini, Claude, DeepSeek, and more.
- 3+ AI agents compatible/planned: OpenClaw, Hermes, Claude Code, Codex, and more.
- Batch export replaces one-by-one manual export.
- Local-first - conversations export to files the user owns.
- Zero new memory-store lock-in - files remain portable.

**Customers:** None captured yet.

**Testimonials:** None captured yet.

**Value themes:**

| Theme                                      | Proof                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Your companion's history can move with you | Import accumulated conversations from major AI chat platforms into a local agent memory store               |
| No more frozen prompts                     | Continuous sync keeps new conversations flowing into memory instead of freezing the companion as a prompt   |
| Your data, your tools                      | Local-first architecture: conversations export to files the user owns, with no mandatory cloud memory store |
| Your AI agent has memory                   | Agent-ready memory store lets agents retrieve relevant past discussions with citations                      |

---

## Goals

**Business goal:** Become the default memory migration and continuous-sync tool for people moving emotionally important AI companion relationships from general AI chat platforms into local AI agents with evolving memory.

**Conversion action:**

1. Install the Chrome extension.
2. Export/import conversations from at least one AI companion platform.
3. Connect or prepare a local AI agent memory workflow.
4. Enable scheduled sync for continuous memory growth.

**Current metrics:** Published extension; exact install, signup, activation, and channel-attribution metrics should be refreshed from the Chrome Web Store and analytics dashboard.

**Metrics to track:**

- Extension installs.
- Sign-ups, especially free-to-premium conversion rate.
- Active users: export within 7 days of install.
- Companion-memory activation: user imports at least 20 AI companion conversations and successfully retrieves a specific past memory through a local agent.
- Scheduled sync enabled.
- Platforms/agents connected per user.
- Channel attribution from 小红书 and Instagram.

---

## Ethical Boundary

Ruminer should position around data ownership, continuity, privacy, and user agency. It should not imply that it transfers consciousness, replaces human relationships, provides therapy, or guarantees emotional care. Avoid targeting minors, crisis-support contexts, or dependence-maximizing romantic companion loops.
