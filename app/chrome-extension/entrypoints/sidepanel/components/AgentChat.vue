<template>
  <div class="chat-shell">
    <!-- Action Bar -->
    <header class="chat-header" :style="headerStyle">
      <div class="header-left">
        <span
          class="status-dot"
          :class="gateway.connected.value ? 'connected' : 'disconnected'"
          :data-tooltip="gateway.connected.value ? 'Connected' : 'Disconnected'"
        />
        <span class="status-label">{{
          gateway.connected.value ? 'Connected' : 'Disconnected'
        }}</span>
      </div>
      <div class="header-right">
        <button
          v-if="!gateway.connected.value"
          class="header-btn ac-btn ac-focus-ring"
          :style="btnStyle"
          :disabled="gateway.connecting.value"
          data-tooltip="Reconnect"
          @click="gateway.reconnect"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
        <button
          class="header-btn ac-btn ac-focus-ring"
          :style="btnStyle"
          data-tooltip="Tool Groups"
          @click="toolGroupsOpen = !toolGroupsOpen"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
            />
          </svg>
        </button>
        <button
          class="header-btn ac-btn ac-focus-ring"
          :style="btnStyle"
          data-tooltip="New Chat"
          @click="chat.newChat"
        >
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Tool Groups Tray -->
    <div v-if="toolGroupsOpen" class="tool-tray" :style="trayStyle">
      <div class="tool-chips">
        <button
          v-for="item in groupItems"
          :key="item.id"
          class="tool-chip ac-focus-ring"
          :style="item.enabled ? chipActiveStyle : chipInactiveStyle"
          @click="toggleGroup(item.id, !item.enabled)"
        >
          {{ item.label }}
        </button>
      </div>
      <button
        class="tray-close ac-btn ac-focus-ring"
        :style="btnStyle"
        @click="toolGroupsOpen = false"
      >
        <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>

    <!-- Scrollable Message Area -->
    <main ref="contentRef" class="message-area ac-scroll" @scroll="handleScroll">
      <div ref="contentSlotRef" class="message-content-wrap">
        <!-- Loading -->
        <div v-if="chat.loadingHistory.value" class="empty-state">
          <div class="empty-icon ac-pulse" :style="{ color: 'var(--ac-text-subtle)' }">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p class="empty-heading">Loading chat history...</p>
        </div>

        <!-- Empty State -->
        <div v-else-if="chat.messages.value.length === 0" class="empty-state">
          <div class="empty-icon" :style="{ color: 'var(--ac-text-subtle)' }">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p class="empty-heading">Start a conversation</p>
          <p class="empty-subtext">Ask Ruminer to help with browser tasks</p>
        </div>

        <!-- Messages -->
        <template v-else>
          <article
            v-for="message in chat.messages.value"
            :key="message.id"
            class="message"
            :class="`role-${message.role}`"
            :style="messageStyle(message.role)"
          >
            <header class="message-meta">
              <span class="message-role">{{ roleLabel(message.role) }}</span>
              <span class="message-time">{{ formatRelativeTime(message.createdAt) }}</span>
            </header>
            <TimelineToolCallStep
              v-if="isToolUseMessage(message)"
              :item="toToolUseTimelineItem(message)"
            />
            <TimelineToolResultCardStep
              v-else-if="isToolResultMessage(message)"
              :item="toToolResultTimelineItem(message)"
            />
            <div v-else class="message-body">{{ message.content }}</div>
          </article>
        </template>
      </div>
    </main>

    <!-- Footer: Suggestions + Composer + Label -->
    <footer class="chat-footer" :style="footerGradientStyle">
      <!-- Memory Suggestions -->
      <div
        v-if="suggestions.hasSuggestions.value"
        class="suggestions-card"
        :style="suggestionsStyle"
      >
        <div class="suggestions-header">
          <span class="suggestions-title">Memory Suggestions</span>
          <button
            class="tray-close ac-btn ac-focus-ring"
            :style="btnStyle"
            @click="suggestions.clear()"
          >
            <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div class="suggestions-list ac-scroll">
          <button
            v-for="suggestion in suggestions.suggestions.value"
            :key="suggestion.id"
            class="suggestion-item ac-btn"
            :style="suggestionItemStyle"
            @click="insertSuggestion(suggestion.content)"
          >
            <span class="suggestion-text">{{ suggestion.content }}</span>
            <span class="suggestion-meta">{{ suggestion.sender || 'memory' }}</span>
          </button>
        </div>
      </div>

      <!-- Error Banner -->
      <div v-if="chat.error.value" class="error-banner" :style="errorBannerStyle">
        <span>{{ chat.error.value }}</span>
        <button
          class="tray-close ac-btn ac-focus-ring"
          :style="btnStyle"
          @click="chat.error.value = null"
        >
          <svg class="btn-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Floating Composer Card -->
      <div class="composer-card" :style="composerCardStyle">
        <textarea
          ref="textareaRef"
          v-model="chat.input.value"
          class="composer-textarea"
          :style="textareaStyle"
          :disabled="!gateway.connected.value"
          placeholder="Ask Ruminer to help with browser tasks..."
          rows="1"
          @input="handleTextareaInput"
          @keydown.enter.exact.prevent="handleSend"
        />
        <button
          v-if="chat.activeRunId.value"
          class="send-btn"
          :style="stopBtnStyle"
          @click="chat.abort"
        >
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
        <button
          v-else
          class="send-btn"
          :style="sendBtnStyle"
          :disabled="!chat.canSend.value"
          @click="handleSend"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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

const contentRef = ref<HTMLElement | null>(null);
const contentSlotRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const toolGroupsOpen = ref(false);
const toolGroups = ref<ToolGroupState>({
  observe: true,
  navigate: true,
  interact: false,
  execute: false,
  workflow: true,
  updatedAt: new Date().toISOString(),
});

// Auto-scroll state
const isUserScrolledUp = ref(false);
const SCROLL_THRESHOLD = 150;
let contentResizeObserver: ResizeObserver | null = null;
let scrollScheduled = false;

// Textarea auto-resize
const MIN_TEXTAREA_HEIGHT = 40;
const MAX_TEXTAREA_HEIGHT = 160;

const groupItems = computed(() => [
  { id: 'observe' as const, label: 'Observe', enabled: toolGroups.value.observe },
  { id: 'navigate' as const, label: 'Navigate', enabled: toolGroups.value.navigate },
  { id: 'interact' as const, label: 'Interact', enabled: toolGroups.value.interact },
  { id: 'execute' as const, label: 'Execute', enabled: toolGroups.value.execute },
  { id: 'workflow' as const, label: 'Workflow', enabled: toolGroups.value.workflow },
]);

// ---- Styles ----

const headerStyle = computed(() => ({
  backgroundColor: 'var(--ac-header-bg)',
  borderBottom: 'var(--ac-border-width) solid var(--ac-header-border)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
}));

const btnStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'none',
  background: 'none',
}));

const trayStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  borderBottom: 'var(--ac-border-width) solid var(--ac-border)',
}));

const chipActiveStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent-subtle)',
  color: 'var(--ac-accent)',
  border: 'var(--ac-border-width) solid var(--ac-accent)',
  borderRadius: '999px',
}));

const chipInactiveStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text-subtle)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: '999px',
}));

const composerCardStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  borderRadius: 'var(--ac-radius-card)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  boxShadow: 'var(--ac-shadow-float)',
}));

const textareaStyle = computed(() => ({
  fontFamily: 'var(--ac-font-body)',
  color: 'var(--ac-text)',
  minHeight: `${MIN_TEXTAREA_HEIGHT}px`,
  maxHeight: `${MAX_TEXTAREA_HEIGHT}px`,
  paddingRight: '36px',
}));

const sendBtnStyle = computed(() => ({
  backgroundColor: chat.canSend.value ? 'var(--ac-accent)' : 'var(--ac-surface-muted)',
  color: chat.canSend.value ? 'var(--ac-accent-contrast)' : 'var(--ac-text-subtle)',
  borderRadius: 'var(--ac-radius-button)',
  cursor: chat.canSend.value ? 'pointer' : 'not-allowed',
}));

const stopBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-diff-del-bg)',
  color: 'var(--ac-danger)',
  border: 'var(--ac-border-width) solid var(--ac-diff-del-border)',
  borderRadius: 'var(--ac-radius-button)',
}));

const suggestionsStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-card)',
  boxShadow: 'var(--ac-shadow-float)',
}));

const suggestionItemStyle = computed(() => ({
  borderRadius: 'var(--ac-radius-inner)',
}));

const errorBannerStyle = computed(() => ({
  backgroundColor: 'var(--ac-diff-del-bg)',
  color: 'var(--ac-danger)',
  border: 'var(--ac-border-width) solid var(--ac-diff-del-border)',
  borderRadius: 'var(--ac-radius-inner)',
}));

const footerGradientStyle = computed(() => ({
  background: 'linear-gradient(to top, var(--ac-bg), var(--ac-bg), transparent)',
}));

// ---- Message helpers ----

function messageStyle(role: string) {
  if (role === 'user') {
    return {
      backgroundColor: 'var(--ac-accent-subtle)',
      borderRadius: 'var(--ac-radius-card)',
    };
  }
  if (role === 'assistant') {
    return {
      backgroundColor: 'var(--ac-surface)',
      border: 'var(--ac-border-width) solid var(--ac-border)',
      borderRadius: 'var(--ac-radius-card)',
    };
  }
  return {};
}

function roleLabel(role: string): string {
  if (role === 'user') return 'You';
  if (role === 'assistant') return 'Ruminer';
  return role;
}

function formatRelativeTime(value: string): string {
  try {
    const date = new Date(value);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  } catch {
    return value;
  }
}

// ---- Tool message helpers ----

function toolSeverity(card: ToolCardData): ToolSeverity {
  if (card.isError) return 'error';
  if (card.phase === 'result') return 'success';
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

// ---- Auto-scroll ----

function isNearBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
}

function handleScroll(): void {
  if (!contentRef.value) return;
  isUserScrolledUp.value = !isNearBottom(contentRef.value);
}

function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  if (!contentRef.value) return;
  contentRef.value.scrollTo({
    top: contentRef.value.scrollHeight,
    behavior,
  });
}

function maybeAutoScroll(): void {
  if (scrollScheduled || isUserScrolledUp.value || !contentRef.value) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    if (!isUserScrolledUp.value) {
      scrollToBottom('auto');
    }
  });
}

// ---- Textarea auto-resize ----

function resizeTextarea(): void {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const scrollH = el.scrollHeight;
  el.style.height = `${Math.min(scrollH, MAX_TEXTAREA_HEIGHT)}px`;
  el.style.overflowY = scrollH > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
}

function handleTextareaInput(): void {
  resizeTextarea();
  suggestions.updateQuery(chat.input.value);
}

function handleSend(): void {
  if (chat.canSend.value) {
    chat.send();
    nextTick(resizeTextarea);
  }
}

// ---- Tool groups ----

async function toggleGroup(groupId: ToolGroupId, enabled: boolean): Promise<void> {
  toolGroups.value = await setToolGroupEnabled(groupId, enabled);
}

function insertSuggestion(content: string): void {
  chat.input.value = `${chat.input.value.trim()}\n${content}`.trim();
  suggestions.clear();
  nextTick(resizeTextarea);
}

// ---- Lifecycle ----

watch(
  () => chat.messages.value.length,
  () => {
    maybeAutoScroll();
  },
);

onMounted(async () => {
  toolGroups.value = await getToolGroupState();

  // Setup content ResizeObserver for auto-scroll
  if (contentSlotRef.value) {
    contentResizeObserver = new ResizeObserver(() => {
      maybeAutoScroll();
    });
    contentResizeObserver.observe(contentSlotRef.value);
  }

  const ok = await gateway.connect();
  if (ok) {
    await chat.hydrateHistory();
  }

  nextTick(resizeTextarea);
});

onUnmounted(() => {
  contentResizeObserver?.disconnect();
});
</script>

<style scoped>
.chat-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Header */
.chat-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-size: 12px;
  color: var(--ac-text-muted);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.connected {
  background-color: var(--ac-success);
  box-shadow: 0 0 6px var(--ac-success);
  animation: pulse-dot 2s infinite;
}

.status-dot.disconnected {
  background-color: var(--ac-warning);
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-btn {
  padding: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.btn-icon-sm {
  width: 14px;
  height: 14px;
}

/* Tool Groups Tray */
.tool-tray {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  transition: all var(--ac-motion-fast);
}

.tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.tool-chip {
  padding: 4px 12px;
  font-size: 12px;
  font-family: var(--ac-font-body);
  cursor: pointer;
  transition: all var(--ac-motion-fast);
}

.tray-close {
  flex-shrink: 0;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Scrollable Message Area */
.message-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
}

.message-content-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  gap: 8px;
}

.empty-icon {
  margin-bottom: 4px;
}

.empty-heading {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-heading);
}

.empty-subtext {
  margin: 0;
  font-size: 13px;
  color: var(--ac-text-muted);
}

/* Messages */
.message {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message.role-tool {
  padding: 0;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.message-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--ac-text-muted);
  text-transform: capitalize;
}

.message-time {
  font-size: 10px;
  color: var(--ac-text-subtle);
}

.message-body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ac-text);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--ac-font-body);
}

/* Footer */
.chat-footer {
  flex-shrink: 0;
  padding: 8px 16px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 5;
}

/* Suggestions Card */
.suggestions-card {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.suggestions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.suggestions-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ac-text-muted);
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.suggestion-item {
  text-align: left;
  padding: 6px 8px;
  border: none;
  background: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
}

.suggestion-text {
  font-size: 12px;
  color: var(--ac-text);
}

.suggestion-meta {
  font-size: 10px;
  color: var(--ac-text-subtle);
}

/* Error Banner */
.error-banner {
  padding: 8px 12px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* Composer Card */
.composer-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.composer-textarea {
  width: 100%;
  border: none;
  background: transparent;
  resize: none;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  overflow-y: hidden;
}

.composer-textarea::placeholder {
  color: var(--ac-text-placeholder);
}

.composer-textarea:disabled {
  opacity: 0.5;
}

.send-btn {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition:
    background-color var(--ac-motion-fast),
    color var(--ac-motion-fast);
}

.send-btn:disabled {
  cursor: not-allowed;
}
</style>
