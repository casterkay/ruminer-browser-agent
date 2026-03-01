<template>
  <aside class="details-panel" :style="panelStyle">
    <h3 class="panel-title">Memory Details</h3>

    <p v-if="!item" class="panel-empty">Select an item to inspect details.</p>

    <template v-else>
      <div class="detail-row">
        <span class="detail-label">ID</span>
        <span class="detail-value">{{ item.message_id || item.id }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Sender</span>
        <span class="detail-value">{{ item.sender || '-' }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Group</span>
        <span class="detail-value">{{ item.group_name || item.group_id || '-' }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Created</span>
        <span class="detail-value">{{ item.create_time || '-' }}</span>
      </div>

      <div class="content-block ac-scroll" :style="contentBlockStyle">
        {{ item.content }}
      </div>

      <div class="actions">
        <button
          class="open-btn ac-btn ac-focus-ring"
          :style="openBtnStyle"
          :disabled="!item.canonical_url"
          @click="$emit('open', item)"
        >
          <svg class="open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open URL
        </button>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MemoryItem } from '../../composables/useEmosSearch';

defineProps<{
  item: MemoryItem | null;
}>();

defineEmits<{
  (e: 'open', item: MemoryItem): void;
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

const openBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-button)',
}));
</script>

<style scoped>
.details-panel {
  padding: 14px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
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

.actions {
  display: flex;
  gap: 8px;
}

.open-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  cursor: pointer;
  font-family: var(--ac-font-body);
  transition:
    background-color var(--ac-motion-fast),
    transform var(--ac-motion-fast);
}

.open-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.open-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.open-icon {
  width: 14px;
  height: 14px;
}
</style>
