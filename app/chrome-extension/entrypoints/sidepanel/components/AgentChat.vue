<template>
  <div class="ruminer-chat">
    <header class="chat-header">
      <div>
        <h2>Chat</h2>
        <p>OpenClaw Gateway session: <code>main</code></p>
      </div>
      <div class="header-actions">
        <button class="secondary" @click="chat.newChat">New chat</button>
        <button class="secondary" @click="gateway.reconnect" :disabled="gateway.connecting.value">
          {{ gateway.connecting.value ? 'Connecting...' : 'Reconnect' }}
        </button>
      </div>
    </header>

    <div class="connection-banner" :class="gateway.connected.value ? 'ok' : 'warn'">
      <span v-if="gateway.connected.value">Gateway connected</span>
      <span v-else>
        Gateway disconnected{{ gateway.lastError.value ? `: ${gateway.lastError.value}` : '' }}
      </span>
    </div>

    <section class="tool-groups">
      <h3>Tool Groups</h3>
      <label v-for="item in groupItems" :key="item.id" class="group-toggle">
        <input
          type="checkbox"
          :checked="item.enabled"
          @change="toggleGroup(item.id, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ item.label }}</span>
      </label>
    </section>

    <section class="message-list" ref="messageListRef">
      <div v-if="chat.loadingHistory.value" class="placeholder">Loading chat history...</div>
      <div v-else-if="chat.messages.value.length === 0" class="placeholder">
        Start a conversation with Ruminer.
      </div>

      <article
        v-for="message in chat.messages.value"
        :key="message.id"
        class="message"
        :class="`role-${message.role}`"
      >
        <header class="message-meta">
          <strong>{{ message.role }}</strong>
          <span>{{ formatTime(message.createdAt) }}</span>
        </header>
        <TimelineToolCallStep
          v-if="isToolUseMessage(message)"
          :item="toToolUseTimelineItem(message)"
        />
        <TimelineToolResultCardStep
          v-else-if="isToolResultMessage(message)"
          :item="toToolResultTimelineItem(message)"
        />
        <pre v-else class="message-content">{{ message.content }}</pre>
      </article>
    </section>

    <section v-if="suggestions.hasSuggestions.value" class="suggestions">
      <h4>Memory Suggestions</h4>
      <button
        v-for="suggestion in suggestions.suggestions.value"
        :key="suggestion.id"
        class="suggestion-item"
        @click="insertSuggestion(suggestion.content)"
      >
        <span class="suggestion-text">{{ suggestion.content }}</span>
        <span class="suggestion-meta">{{ suggestion.sender || 'memory' }}</span>
      </button>
    </section>

    <footer class="composer">
      <textarea
        v-model="chat.input.value"
        class="composer-input"
        :disabled="!gateway.connected.value"
        placeholder="Ask Ruminer to help with browser tasks..."
        @input="onInput"
        @keydown.enter.exact.prevent="chat.send"
      />
      <div class="composer-actions">
        <button class="secondary" @click="chat.abort" :disabled="!chat.activeRunId.value"
          >Stop</button
        >
        <button class="primary" @click="chat.send" :disabled="!chat.canSend.value">Send</button>
      </div>
      <p v-if="chat.error.value" class="error">{{ chat.error.value }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useOpenClawGateway } from '../composables/useOpenClawGateway';
import {
  useOpenClawChat,
  type ChatMessage,
  type ToolCardData,
} from '../composables/useOpenClawChat';
import { useEmosSuggestions } from '../composables/useEmosSuggestions';
import {
  getToolGroupState,
  setToolGroupEnabled,
  type ToolGroupId,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import type { TimelineItem, ToolPresentation, ToolSeverity } from '../composables/useAgentThreads';
import TimelineToolCallStep from './agent-chat/timeline/TimelineToolCallStep.vue';
import TimelineToolResultCardStep from './agent-chat/timeline/TimelineToolResultCardStep.vue';

const gateway = useOpenClawGateway();
const chat = useOpenClawChat(gateway);
const suggestions = useEmosSuggestions(gateway);
const messageListRef = ref<HTMLElement | null>(null);

const toolGroups = ref<ToolGroupState>({
  observe: true,
  navigate: true,
  interact: false,
  execute: false,
  workflow: true,
  updatedAt: new Date().toISOString(),
});

const groupItems = computed(() => [
  { id: 'observe' as const, label: 'Observe', enabled: toolGroups.value.observe },
  { id: 'navigate' as const, label: 'Navigate', enabled: toolGroups.value.navigate },
  { id: 'interact' as const, label: 'Interact', enabled: toolGroups.value.interact },
  { id: 'execute' as const, label: 'Execute', enabled: toolGroups.value.execute },
  { id: 'workflow' as const, label: 'Workflow', enabled: toolGroups.value.workflow },
]);

function toolSeverity(card: ToolCardData): ToolSeverity {
  if (card.isError) {
    return 'error';
  }
  if (card.phase === 'result') {
    return 'success';
  }
  return 'info';
}

function toToolPresentation(card: ToolCardData): ToolPresentation {
  return {
    kind: card.kind,
    label: card.label,
    title: card.title,
    details: card.details,
    files: card.files,
    filePath: card.filePath,
    diffStats: card.diffStats,
    command: card.command,
    commandDescription: card.commandDescription,
    pattern: card.pattern,
    searchPath: card.searchPath,
    severity: toolSeverity(card),
    phase: card.phase,
    raw: {
      content: card.details || '',
      metadata: card.raw,
    },
  };
}

function isToolUseMessage(
  message: ChatMessage,
): message is ChatMessage & { toolCard: ToolCardData & { phase: 'use' } } {
  return message.role === 'tool' && message.toolCard?.phase === 'use';
}

function isToolResultMessage(
  message: ChatMessage,
): message is ChatMessage & { toolCard: ToolCardData & { phase: 'result' } } {
  return message.role === 'tool' && message.toolCard?.phase === 'result';
}

function toToolUseTimelineItem(message: ChatMessage): Extract<TimelineItem, { kind: 'tool_use' }> {
  const card = message.toolCard as ToolCardData;
  return {
    kind: 'tool_use',
    id: `tool-use:${message.id}`,
    createdAt: message.createdAt,
    messageId: message.id,
    tool: toToolPresentation(card),
    isStreaming: message.isStreaming === true,
    requestId: message.runId,
  };
}

function toToolResultTimelineItem(
  message: ChatMessage,
): Extract<TimelineItem, { kind: 'tool_result' }> {
  const card = message.toolCard as ToolCardData;
  return {
    kind: 'tool_result',
    id: `tool-result:${message.id}`,
    createdAt: message.createdAt,
    messageId: message.id,
    tool: toToolPresentation(card),
    isError: card.isError === true,
    requestId: message.runId,
  };
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

async function toggleGroup(groupId: ToolGroupId, enabled: boolean): Promise<void> {
  toolGroups.value = await setToolGroupEnabled(groupId, enabled);
}

function onInput(): void {
  suggestions.updateQuery(chat.input.value);
}

function insertSuggestion(content: string): void {
  chat.input.value = `${chat.input.value.trim()}\n${content}`.trim();
  suggestions.clear();
}

onMounted(async () => {
  toolGroups.value = await getToolGroupState();

  const ok = await gateway.connect();
  if (ok) {
    await chat.hydrateHistory();
  }
});
</script>

<style scoped>
.ruminer-chat {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto auto 1fr auto auto;
  gap: 10px;
  padding: 12px;
  background: #f1f5f9;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.chat-header h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.chat-header p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.connection-banner {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.connection-banner.ok {
  border: 1px solid #86efac;
  background: #dcfce7;
  color: #166534;
}

.connection-banner.warn {
  border: 1px solid #fdba74;
  background: #fff7ed;
  color: #9a3412;
}

.tool-groups {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px 10px;
  background: #ffffff;
}

.tool-groups h3 {
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.group-toggle {
  font-size: 12px;
  color: #0f172a;
  display: flex;
  gap: 5px;
  align-items: center;
}

.message-list {
  min-height: 0;
  overflow: auto;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.placeholder {
  font-size: 12px;
  color: #64748b;
  padding: 8px;
}

.message {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px;
  display: grid;
  gap: 6px;
}

.message.role-user {
  border-color: #bfdbfe;
  background: #eff6ff;
}

.message.role-assistant {
  border-color: #d1d5db;
  background: #f8fafc;
}

.message.role-tool {
  border-color: #fde68a;
  background: #fffbeb;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #475569;
}

.message-content {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #0f172a;
}

.suggestions {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  display: grid;
  gap: 6px;
  max-height: 180px;
  overflow: auto;
}

.suggestions h4 {
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.suggestion-item {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 8px;
  padding: 6px;
  text-align: left;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.suggestion-text {
  font-size: 12px;
  color: #0f172a;
}

.suggestion-meta {
  font-size: 11px;
  color: #64748b;
}

.composer {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  padding: 8px;
  display: grid;
  gap: 8px;
}

.composer-input {
  width: 100%;
  min-height: 80px;
  resize: vertical;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: #0f172a;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.primary,
.secondary {
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid;
}

.secondary {
  border-color: #94a3b8;
  background: #ffffff;
  color: #334155;
}

.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.primary:disabled,
.secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}
</style>
