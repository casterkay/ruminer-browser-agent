<template>
  <div class="memory-view">
    <header class="memory-header">
      <h2>Memory</h2>
      <p>Browse and manage EMOS knowledge items.</p>
    </header>

    <MemoryFilters
      :query="filters.query"
      :platform="filters.platform"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      @update:query="filters.query = $event"
      @update:platform="filters.platform = $event"
      @update:startDate="filters.startDate = $event"
      @update:endDate="filters.endDate = $event"
      @search="runSearch"
    />

    <p v-if="!memory.isConfigured.value" class="warning">
      EMOS is not configured. Open Options and set base URL + API key.
    </p>

    <p v-if="memory.error.value" class="error">{{ memory.error.value }}</p>

    <div class="memory-content">
      <section class="memory-list">
        <div class="memory-list-header">
          <strong>{{ memory.items.value.length }} items</strong>
          <button class="refresh" @click="runSearch" :disabled="memory.loading.value"
            >Refresh</button
          >
        </div>

        <div v-if="memory.loading.value" class="placeholder">Loading memory...</div>
        <div v-else-if="memory.items.value.length === 0" class="placeholder">No items found.</div>

        <button
          v-for="item in memory.items.value"
          :key="item.id"
          class="memory-item"
          :class="{ active: memory.selectedItem.value?.id === item.id }"
          @click="memory.selectItem(item)"
        >
          <div class="memory-item-title">{{ item.group_name || item.group_id || 'No Group' }}</div>
          <div class="memory-item-meta"
            >{{ item.sender || 'unknown' }} · {{ item.create_time || '-' }}</div
          >
          <div class="memory-item-snippet">{{ item.content }}</div>
        </button>
      </section>

      <MemoryItemDetails :item="memory.selectedItem.value" @open="openCanonicalUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import MemoryFilters from './MemoryFilters.vue';
import MemoryItemDetails from './MemoryItemDetails.vue';
import { useEmosSearch } from '../../composables/useEmosSearch';

const memory = useEmosSearch();

const filters = reactive({
  query: '',
  platform: '',
  startDate: '',
  endDate: '',
});

async function runSearch(): Promise<void> {
  await memory.search({
    query: filters.query,
    platform: filters.platform.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });
}

function openCanonicalUrl(item: MemoryItem): void {
  if (!item.canonical_url) {
    return;
  }

  void chrome.tabs.create({ url: item.canonical_url });
}

void runSearch();
</script>

<style scoped>
.memory-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto auto 1fr;
  gap: 10px;
  padding: 12px;
  background: #f1f5f9;
}

.memory-header h2 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.memory-header p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12px;
}

.warning,
.error {
  margin: 0;
  font-size: 12px;
  padding: 8px;
  border-radius: 8px;
}

.warning {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fdba74;
}

.error {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.memory-content {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr minmax(260px, 40%);
  gap: 10px;
}

.memory-list {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: #ffffff;
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
}

.memory-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 12px;
  color: #334155;
}

.refresh {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}

.placeholder {
  padding: 12px;
  color: #64748b;
  font-size: 12px;
}

.memory-item {
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 10px;
  display: grid;
  gap: 4px;
  cursor: pointer;
}

.memory-item:hover {
  background: #f8fafc;
}

.memory-item.active {
  background: #dbeafe;
}

.memory-item-title {
  font-size: 12px;
  font-weight: 600;
  color: #0f172a;
}

.memory-item-meta {
  font-size: 11px;
  color: #64748b;
}

.memory-item-snippet {
  font-size: 12px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

@media (max-width: 900px) {
  .memory-content {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
}
</style>
