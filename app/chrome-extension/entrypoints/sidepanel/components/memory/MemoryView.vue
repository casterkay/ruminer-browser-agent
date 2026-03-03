<template>
  <div class="memory-view">
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

    <div v-if="!memory.isConfigured.value" class="status-banner warning-banner">
      <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
      EverMemOS is not configured. Open Options and set Base URL, API Key, and User ID.
    </div>

    <div v-if="memory.error.value" class="status-banner error-banner">
      <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {{ memory.error.value }}
    </div>

    <div class="memory-content">
      <section class="memory-list" :style="listContainerStyle">
        <div class="memory-list-header" :style="listHeaderStyle">
          <strong>{{ memory.items.value.length }} items</strong>
          <button
            class="refresh-btn ac-btn ac-focus-ring"
            :style="refreshBtnStyle"
            :disabled="memory.loading.value"
            @click="runSearch"
          >
            <svg class="refresh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <div class="memory-list-body ac-scroll">
          <div v-if="memory.loading.value" class="placeholder">
            <span class="ac-pulse">Loading memory...</span>
          </div>
          <div v-else-if="memory.items.value.length === 0" class="placeholder">
            No items found.
          </div>

          <button
            v-for="item in memory.items.value"
            :key="item.id"
            class="memory-item ac-btn"
            :class="{ active: memory.selectedItem.value?.id === item.id }"
            :style="memory.selectedItem.value?.id === item.id ? activeItemStyle : inactiveItemStyle"
            @click="memory.selectItem(item)"
          >
            <div class="memory-item-title">
              {{ item.group_name || item.group_id || 'No Group' }}
            </div>
            <div class="memory-item-meta">
              {{ item.sender || 'unknown' }} · {{ item.create_time || '-' }}
            </div>
            <div class="memory-item-snippet">{{ item.content }}</div>
          </button>
        </div>
      </section>

      <MemoryItemDetails :item="memory.selectedItem.value" @open="openCanonicalUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import MemoryFilters from './MemoryFilters.vue';
import MemoryItemDetails from './MemoryItemDetails.vue';
import { useEmosSearch, type MemoryItem } from '../../composables/useEmosSearch';

const memory = useEmosSearch();

const filters = reactive({
  query: '',
  platform: '',
  startDate: '',
  endDate: '',
});

// ---- Styles ----

const listContainerStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-card)',
}));

const listHeaderStyle = computed(() => ({
  borderBottom: 'var(--ac-border-width) solid var(--ac-border)',
  color: 'var(--ac-text-muted)',
}));

const refreshBtnStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
  border: 'none',
  background: 'none',
  borderRadius: 'var(--ac-radius-button)',
}));

const activeItemStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent-subtle)',
}));

const inactiveItemStyle = computed(() => ({
  backgroundColor: 'transparent',
}));

// ---- Methods ----

async function runSearch(): Promise<void> {
  await memory.search({
    query: filters.query,
    platform: filters.platform.trim() || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });
}

function openCanonicalUrl(item: MemoryItem): void {
  if (!item.canonical_url) return;
  void chrome.tabs.create({ url: item.canonical_url });
}

void runSearch();
</script>

<style scoped>
.memory-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 10px;
  padding: 12px;
}

/* Status Banners */
.status-banner {
  margin: 0;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: var(--ac-radius-inner);
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--ac-font-body);
}

.warning-banner {
  background-color: var(--ac-surface);
  color: var(--ac-text);
  border: var(--ac-border-width) solid var(--ac-warning);
}

.error-banner {
  background-color: var(--ac-diff-del-bg);
  color: var(--ac-danger);
  border: var(--ac-border-width) solid var(--ac-diff-del-border);
}

.banner-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.warning-banner .banner-icon {
  color: var(--ac-warning);
}

.error-banner .banner-icon {
  color: var(--ac-danger);
}

/* Content Layout */
.memory-content {
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr minmax(260px, 40%);
  gap: 10px;
}

/* List */
.memory-list {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  overflow: hidden;
}

.memory-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  font-size: 12px;
}

.refresh-btn {
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.refresh-icon {
  width: 14px;
  height: 14px;
}

.memory-list-body {
  overflow-y: auto;
  min-height: 0;
}

.placeholder {
  padding: 12px;
  color: var(--ac-text-subtle);
  font-size: 12px;
  font-family: var(--ac-font-body);
}

/* Items */
.memory-item {
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: var(--ac-border-width) solid var(--ac-border);
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  cursor: pointer;
  font-family: var(--ac-font-body);
  transition: background-color var(--ac-motion-fast);
}

.memory-item:hover {
  background-color: var(--ac-hover-bg) !important;
}

.memory-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ac-text);
}

.memory-item-meta {
  font-size: 11px;
  color: var(--ac-text-subtle);
}

.memory-item-snippet {
  font-size: 12px;
  color: var(--ac-text-muted);
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
