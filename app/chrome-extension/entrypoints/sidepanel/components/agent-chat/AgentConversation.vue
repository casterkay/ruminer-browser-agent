<template>
  <div class="conversation-root">
    <div v-if="threads.length === 0" class="empty-mode">
      <div v-if="trimmedQuery.length >= 3" class="memory-suggestion-layout">
        <div class="memory-suggestion-header">
          <strong>Memory Matches</strong>
          <span>{{ memoryLoading ? 'Searching...' : `${memorySuggestions.length} found` }}</span>
        </div>

        <div class="memory-suggestion-body ac-scroll">
          <div
            v-if="memoryLoading && memorySuggestions.length === 0"
            class="memory-suggestion-empty"
          >
            Searching memory...
          </div>
          <div
            v-else-if="memoryError"
            class="memory-suggestion-empty"
            :style="{ color: 'var(--ac-danger)' }"
          >
            {{ memoryError }}
          </div>
          <div
            v-else-if="memorySuggestions.length === 0"
            class="memory-suggestion-empty"
            :style="{ color: 'var(--ac-text-subtle)' }"
          >
            No matching memory yet.
          </div>

          <TransitionGroup v-else name="memory-cards" tag="div" class="memory-suggestion-cards">
            <button
              v-for="suggestion in memorySuggestions"
              :key="suggestion.id"
              class="memory-suggestion-item ac-btn ac-focus-ring"
              type="button"
              @click="openSuggestionDetails(suggestion)"
            >
              <div class="memory-suggestion-meta">
                <span>{{ formatSource(suggestion) }}</span>
                <span>·</span>
                <span :title="formatAbsoluteTime(suggestion.createTime)">
                  {{ formatRelativeTime(suggestion.createTime) }}
                </span>
              </div>
              <p class="memory-suggestion-content">{{ compactSnippet(suggestion.content) }}</p>
            </button>
          </TransitionGroup>
        </div>
      </div>
      <div v-else class="empty-state-placeholder">
        <p
          class="text-2xl italic opacity-40"
          :style="{
            fontFamily: 'var(--ac-font-heading)',
            color: 'var(--ac-text-subtle)',
          }"
        >
          How can I help you today?
        </p>
      </div>
    </div>

    <!-- Request Threads -->
    <div v-else class="thread-list">
      <AgentRequestThread v-for="thread in threads" :key="thread.id" :thread="thread" />
    </div>

    <div v-if="detailsVisible" class="details-overlay" @click.self="closeDetails">
      <div class="details-modal">
        <MemoryItemDetails
          :item="selectedMemoryItem"
          @open="openCanonicalUrl"
          @close="closeDetails"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { AgentThread } from '../../composables/useAgentThreads';
import type { MemorySuggestion } from '../../composables/useEmosSuggestions';
import type { MemoryItem } from '../../composables/useEmosSearch';
import AgentRequestThread from './AgentRequestThread.vue';
import MemoryItemDetails from '../memory/MemoryItemDetails.vue';

const props = withDefaults(
  defineProps<{
    threads: AgentThread[];
    searchQuery?: string;
    memorySuggestions?: MemorySuggestion[];
    memoryLoading?: boolean;
    memoryError?: string | null;
  }>(),
  {
    searchQuery: '',
    memorySuggestions: () => [],
    memoryLoading: false,
    memoryError: null,
  },
);

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const trimmedQuery = computed(() => props.searchQuery.trim());
const selectedMemoryItem = ref<MemoryItem | null>(null);
const detailsVisible = computed(() => !!selectedMemoryItem.value);
const PLATFORM_LABELS: Record<string, string> = {
  agent: 'OpenClaw',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function compactSnippet(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function toMemoryItem(suggestion: MemorySuggestion): MemoryItem {
  return {
    id: suggestion.id,
    message_id: suggestion.messageId || suggestion.id,
    content: suggestion.content,
    sender: suggestion.sender,
    create_time: suggestion.createTime,
    group_id: suggestion.groupId,
    group_name: suggestion.groupName,
    source_url: suggestion.canonicalUrl,
    metadata: suggestion.metadata,
  };
}

function openSuggestionDetails(suggestion: MemorySuggestion): void {
  selectedMemoryItem.value = toMemoryItem(suggestion);
}

function closeDetails(): void {
  selectedMemoryItem.value = null;
}

function openCanonicalUrl(item: MemoryItem): void {
  if (!item.source_url) return;
  void chrome.tabs.create({ url: item.source_url });
}

function formatAbsoluteTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRelativeTime(value?: string): string {
  if (!value) return '-';
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return value;

  const secondsDiff = Math.round((created - Date.now()) / 1000);
  const absSeconds = Math.abs(secondsDiff);

  if (absSeconds < 60) return relativeTimeFormatter.format(secondsDiff, 'second');
  if (absSeconds < 3600)
    return relativeTimeFormatter.format(Math.round(secondsDiff / 60), 'minute');
  if (absSeconds < 86400)
    return relativeTimeFormatter.format(Math.round(secondsDiff / 3600), 'hour');
  return relativeTimeFormatter.format(Math.round(secondsDiff / 86400), 'day');
}

function formatSource(suggestion: MemorySuggestion): string {
  const group = suggestion.groupId || '';
  const sender = (suggestion.sender || 'unknown').toLowerCase();
  if (group.includes(':')) {
    const platform = group.split(':')[0].trim().toLowerCase();
    return PLATFORM_LABELS[platform] || platform;
  }
  return PLATFORM_LABELS[sender] || sender;
}
</script>

<style scoped>
.conversation-root {
  min-height: 100%;
  position: relative;
}

.thread-list {
  padding: 1.5rem 1.25rem;
  display: grid;
  gap: 2rem;
}

.empty-mode {
  min-height: 100%;
}

.empty-state-placeholder {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12rem 1.25rem;
}

.memory-suggestion-layout {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  padding: 0.75rem 1.25rem 1.5rem;
  gap: 0.5rem;
}

.memory-suggestion-body {
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  background-color: var(--ac-surface);
  overflow-y: auto;
}

.memory-suggestion-cards {
  padding: 10px;
  display: grid;
  gap: 10px;
}

.memory-suggestion-header {
  padding: 0 0.125rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-body);
}

.memory-suggestion-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--ac-text-muted);
  font-family: var(--ac-font-body);
}

.memory-suggestion-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  background: var(--ac-surface);
  cursor: pointer;
}

.memory-suggestion-item:hover {
  background-color: var(--ac-hover-bg);
}

.memory-cards-enter-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.memory-cards-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.memory-cards-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.memory-cards-move {
  transition: transform 160ms ease;
}

.memory-suggestion-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-body);
}

.memory-suggestion-content {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ac-text);
  line-height: 1.45;
  font-family: var(--ac-font-body);
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.details-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: color-mix(in srgb, var(--ac-bg) 56%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  backdrop-filter: blur(2px);
}

.details-modal {
  width: min(760px, 100%);
  max-height: 100%;
  overflow: hidden;
}
</style>
