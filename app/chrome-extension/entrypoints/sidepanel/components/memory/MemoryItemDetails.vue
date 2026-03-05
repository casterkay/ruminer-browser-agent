<template>
  <aside class="details-panel" :style="panelStyle">
    <header class="panel-header">
      <h3 class="panel-title">Memory Details</h3>

      <div class="panel-actions">
        <button
          class="icon-btn ac-btn ac-focus-ring"
          :style="iconBtnStyle"
          :disabled="!item?.source_url"
          title="Open canonical URL"
          aria-label="Open canonical URL"
          @click="handleOpen"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </button>

        <button
          class="icon-btn ac-btn ac-focus-ring"
          :style="iconBtnStyle"
          :disabled="!item"
          title="Delete memory"
          aria-label="Delete memory"
          @click="handleDelete"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"
            />
          </svg>
        </button>

        <button
          class="icon-btn ac-btn ac-focus-ring"
          :style="iconBtnStyle"
          title="Close details"
          aria-label="Close details"
          @click="$emit('close')"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </header>

    <p v-if="!item" class="panel-empty">Select an item to inspect details.</p>

    <template v-else>
      <div class="detail-row">
        <span class="detail-label">ID</span>
        <span class="detail-value">{{ item.message_id }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Sender</span>
        <span class="detail-value">{{ item.sender_name || item.sender || '-' }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Group</span>
        <span class="detail-value">{{ formatGroupName(item) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Created</span>
        <span class="detail-value">{{ formatTimestamp(item.create_time) }}</span>
      </div>

      <div class="content-block ac-scroll" :style="contentBlockStyle">
        {{ item.content }}
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MemoryItem } from '../../composables/useEmosSearch';

const props = defineProps<{
  item: MemoryItem | null;
}>();

const emit = defineEmits<{
  (e: 'open', item: MemoryItem): void;
  (e: 'delete', item: MemoryItem): void;
  (e: 'close'): void;
}>();

const panelStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-card)',
}));

const contentBlockStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
  fontFamily: 'var(--ac-font-mono)',
  color: 'var(--ac-text)',
}));

const iconBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-button)',
}));

function formatTimestamp(value?: string): string {
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

function handleOpen(): void {
  if (!props.item?.source_url) {
    return;
  }
  emit('open', props.item);
}

function handleDelete(): void {
  if (!props.item) {
    return;
  }
  emit('delete', props.item);
}

function formatGroupName(item: MemoryItem): string {
  const metadataGroupName =
    item.metadata && typeof item.metadata.group_name === 'string' ? item.metadata.group_name : null;
  const metadataTitle =
    item.metadata && typeof item.metadata.title === 'string' ? item.metadata.title : null;
  return item.group_name || metadataGroupName || metadataTitle || '-';
}
</script>

<style scoped>
.details-panel {
  padding: 14px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-empty {
  margin: 0;
  color: var(--ac-text-subtle);
  font-size: 12px;
  font-family: var(--ac-font-body);
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--ac-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.detail-value {
  font-size: 13px;
  color: var(--ac-text);
  word-break: break-all;
  font-family: var(--ac-font-body);
}

.content-block {
  margin: 0;
  padding: 10px;
  min-height: 120px;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  cursor: pointer;
  transition:
    background-color var(--ac-motion-fast),
    transform var(--ac-motion-fast);
}

.icon-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon {
  width: 14px;
  height: 14px;
}
</style>
