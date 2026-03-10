## Ruminate (RAG) + EMOS Citations UI

### Summary

- Add a per-session Ruminate toggle (default
  off) that, when enabled, injects “use
  emos_search_memories on user (me) messages

* cite by message_id” guidance into the
  outgoing prompt.

- Move workspace folder selection (only
  before the first message starts the
  session) + Open Project target selection/
  open actions into Session Settings, in a
  new section above EverMemOS.
- Render assistant citations interactively:
  strip trailing reference lines, convert
  inline [^…] citations into hover/click UI
  that previews EMOS summary and opens the
  existing Memory details overlay.

———

### Key Changes

#### 1) Persisted session option:

enableRuminate

- Add enableRuminate?: boolean to
  AgentSessionOptionsConfig (packages/
  shared/src/agent-types.ts).
- Semantics:
  - Default: false (treat undefined as
    off).
  - Scope: per session.
  - New chat (no session yet): store in
    draftSessionSettings.optionsConfig.ena
    bleRuminate so it’s applied when the
    session is created on first send.
  - Existing session: toggle writes
    immediately via
    sessions.updateSession(sessionId,
    { optionsConfig: { ...existing,
    enableRuminate } }).

#### 2) Top bar: replace Open Project button

with Ruminate toggle

- AgentTopBar.vue
  - Remove folder/open-project button.
  - Add a toggle button labeled/tooled
    “Ruminate” with clear on/off styling.
  - New props/emits:
    - ruminateEnabled: boolean
    - emit toggle:ruminate (or
      update:ruminateEnabled) on click.
- AgentChat.vue
  - Compute ruminateEnabled from:
    - sessions.selectedSession.optionsCo
      nfig.enableRuminate === true when
      session exists
    - else
      draftSessionSettings.optionsConfig
      .enableRuminate === true
  - Handle toggle:
    - If sessionless: update
      draftSessionSettings (create draft
      object if null).
    - If session exists:
      sessions.updateSession(...) to
      persist.

#### 3) Session Settings: new “Workspace &

Project” section (above EverMemOS)

- AgentSessionSettingsPanel.vue
  - Insert a new section between “Session
    Info” and “EverMemOS”.
  - Workspace folder path
    - Display current selected project
      root path (monospace,
      truncatable).
    - Editable only before session star
      ts: enable controls only when
      props.session?.id === '**new**' (
      the “new chat” sentinel from sess
      ionForPanels).
    - Controls (enabled only for
      **new**): - “Choose folder…” → triggers
      directory picker and selects/
      creates a project for that
      path. - Small hint text: “Workspace is
      locked after the first message
      starts the session.”
    - For existing sessions: show read-
      only with hint “Start a new
      session to change workspace.”
  - Open Project
    - Inline “Open in” choices
      (replacing the old topbar
      dropdown): - Buttons: “VS Code” and
      “Terminal” - Show current default target
      (from
      useOpenProjectPreference().def
      aultTarget) and update it when
      user clicks either button.
    - “Open now” behavior:
      - If session exists: open by
        session id.
      - If **new**: open by project
        id.
- AgentChat.vue
  - Pass into session settings panel the
    data it needs (at minimum: selected
    project info + open-project default
    target), and wire new emits: - workspace:pick → reuse existing
    flow: projects.pickDirectory() →
    projects.createProjectFromPath(pat
    h, dirName); update local project-
    related UI state the same way
    handleNewProject() currently does. - project:open with target → call
    openProjectPreference.saveDefaultT
    arget(target) (non-blocking) +
    openBySession/openByProject.

#### 4) Prompt injection: RAG guidance +

citation contract (only when Ruminate on)

- AgentChat.vue
  - Add
    injectRuminateRagGuidance(instruction:
    string): string.
  - Apply in send pipeline:
    - instructionWithContext → marker
      injection → if ruminateEnabled:
      rag injection → tool-restrictions
      injection.
  - Guidance content (verbatim intent):
    - Before answering, call
      emos_search_memories with: - query: derived from the user
      request - user_id: "me" (explicitly:
      search the user’s own
      messages)
    - Use retrieved memories to ground
      the answer.
    - If you use memories, include
      citations by message_id using
      exactly: - Inline: ... [^1] ...
      [^1,2] ... - Footer references at end: - [^1]: <message_id> - [^2]: <message_id> - Absolutely no content after
      the reference block.

#### 5) Citation rendering (strip references

- hover/click UX)

* Add a small citation parsing/transform
  utility (new file under sidepanel, e.g.
  composables/emos-citations.ts): - parseTrailingFootnoteRefs(text): - Detect trailing ref block lines
  matching ^\[\^(\d+)\]:\s\*(.+)$ - Return { body: string, refMap:
  Map<citeKey, messageId> } - Enforce “no content after refs” by
  removing everything from the first
  detected ref line (near end) to
  the end. - transformInlineCitations(body,
  refMap): - Replace each [^1] / [^1,2] outside
  fenced/inline code with a custom
  HTML tag: - <emos-cite keys="1,2" message-
              ids="<id1>,<id2>"></emos-cite> - (Assumption: message_ids never
  contain commas; safe for your
  autosave id format.)
* Build per-thread EMOS lookup from tool
  results - AgentRequestThread.vue: - Scan thread.items for tool_result
  where tool name is emos_search_me
  mories (case-insensitive, read fr
  om
  item.tool.raw.metadata.toolName/tool_name). - Parse item.tool.raw.content as
  JSON when possible, extract items,
  normalize into MemoryItem where
  content comes from raw summary/
  content. - Build Map<message_id, MemoryItem>
  and provide() it via an injection
  key.
* Render citations via markstream custom
  component - Update markstream-thinking.ts to
  register both: - thinking: ThinkingNode - emos-cite: EmosCitationNode (new
  component) - TimelineNarrativeStep.vue: - Include emos-cite in
  CUSTOM_HTML_TAGS. - Compute processedContent = strip
  refs + transform inline citations,
  then feed that to MarkdownRender. - New EmosCitationNode.vue: - Props: keys: string, messageIds:
  string - Display as [^1] or [^1,2] with
  accent styling and pointer cursor. - Hover: show a small bubble listing
  each citation’s content (from the
  provided EMOS map), truncated
  (e.g. 200 chars). If missing, show
  message_id only. - Click: open Memory details overlay
  for the first available cited id;
  inside the hover bubble, each
  listed item is clickable to open
  its own details.
* Reuse existing overlay UI
  - AgentConversation.vue:
    - provide() an “open memory details”
      controller that sets
      selectedMemoryItem (the same state
      currently used by suggestion-
      click).
    - EmosCitationNode inject()s this
      controller so click opens the same
      MemoryItemDetails overlay.

#### 6) EMOS suggestions: search user (me)

only when Ruminate enabled

- useEmosSuggestions.ts
  - Default search speaker IDs to ['me']
    (no bot), since Ruminate is explicitly
    “user’s own messages”.
- AgentChat.vue
  - Gate the existing “empty chat memory
    suggestions” watcher so it only calls
    emosSuggestions.updateQuery() when: - isSearchMode and - ruminateEnabled is true
  - When toggled off, call
    emosSuggestions.clear().

———

### Test Plan

- Add Vitest unit tests (extension
  workspace) for: - Citation parsing: - strips trailing [^n]: … block - transforms [^1] and [^1,2] into
  <emos-cite …> - does not transform inside fenced
  code blocks or inline backticks - Tool-result EMOS extraction: - given a representative JSON tool
  result containing message_id +
  summary, produces a
  Map<message_id, MemoryItem> where - New chat → Session Settings → Choose
  usage + assistant response with
  footnotes → references hidden in UI →
  hover shows summary bubble → click
  opens MemoryItemDetails overlay. - Toggle Ruminate off → no RAG injection
  (and memory suggestions in empty chat
  stop running).

———

### Assumptions / Defaults

- Ruminate is stored as
  optionsConfig.enableRuminate and defaults
  to off.
- Workspace folder selection is only allowed
  when session.id === '**new**'; after a
  real session starts it is read-only.
- Cited message IDs do not contain commas
  (true for the current autosave message_id
  format).
- EMOS tool/search results contain
  message_id and summary (used as UI preview
  text).
