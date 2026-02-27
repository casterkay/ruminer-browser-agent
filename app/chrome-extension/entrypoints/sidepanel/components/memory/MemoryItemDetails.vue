<template>
  <aside class="details-panel">
    <h3>Memory Details</h3>
    <p v-if="!item" class="muted">Select an item to inspect details.</p>

    <template v-else>
      <div class="detail-row"><strong>ID:</strong> {{ item.message_id || item.id }}</div>
      <div class="detail-row"><strong>Sender:</strong> {{ item.sender || '-' }}</div>
      <div class="detail-row"
        ><strong>Group:</strong> {{ item.group_name || item.group_id || '-' }}</div
      >
      <div class="detail-row"><strong>Created:</strong> {{ item.create_time || '-' }}</div>

      <pre class="content-block">{{ item.content }}</pre>

      <div class="actions">
        <button class="secondary" @click="$emit('open', item)" :disabled="!item.canonical_url">
          Open URL
        </button>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { MemoryItem } from '../../composables/useEmosSearch';

defineProps<{
  item: MemoryItem | null;
}>();

defineEmits<{
  (e: 'open', item: MemoryItem): void;
}>();
</script>

<style scoped>
.details-panel {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #f8fafc;
  padding: 12px;
  display: grid;
  gap: 8px;
}

h3 {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
}

.muted {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.detail-row {
  font-size: 12px;
  color: #1e293b;
}

.content-block {
  margin: 0;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  min-height: 120px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: #0f172a;
}

.actions {
  display: flex;
  gap: 8px;
}

.secondary {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid;
}

.secondary {
  border-color: #94a3b8;
  background: #ffffff;
  color: #334155;
}

.secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
