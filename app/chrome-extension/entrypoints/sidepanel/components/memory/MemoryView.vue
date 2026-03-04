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
      @search="refreshSearch"
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
            @click="refreshSearch"
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
          <div v-if="memory.loading.value && memory.items.value.length === 0" class="placeholder">
            <span class="ac-pulse">Loading memory...</span>
          </div>
          <div v-else-if="memory.items.value.length === 0" class="placeholder">
            {{ noResultsMessage }}
          </div>
          <div v-if="memory.loading.value && memory.items.value.length > 0" class="loading-hint">
            Updating results...
          </div>

          <button
            v-for="item in memory.items.value"
            :key="item.id"
            class="memory-item ac-btn"
            :class="{ active: memory.selectedItem.value?.id === item.id }"
            :style="memory.selectedItem.value?.id === item.id ? activeItemStyle : inactiveItemStyle"
            @click="handleSelectItem(item)"
          >
            <div class="memory-item-top">
              <div class="memory-item-title">
                <span class="memory-item-title-text">{{ formatGroupTitle(item) }}</span>
              </div>
              <span class="platform-badge">{{ formatPlatform(item) }}</span>
            </div>
            <div class="memory-item-meta" :title="formatAbsoluteTime(item.create_time)">
              {{ formatSender(item.sender) }} · {{ formatRelativeTime(item.create_time) }}
            </div>
            <div class="memory-item-snippet">{{ buildSnippet(item.content) }}</div>
          </button>
        </div>
      </section>
    </div>

    <div v-if="detailsVisible" class="details-overlay" @click.self="closeDetails">
      <div class="details-modal" :style="detailsModalStyle">
        <MemoryItemDetails
          :item="memory.selectedItem.value"
          @open="openCanonicalUrl"
          @delete="handleDeleteItem"
          @close="closeDetails"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import MemoryFilters from './MemoryFilters.vue';
import MemoryItemDetails from './MemoryItemDetails.vue';
import { useEmosSearch, type MemoryItem } from '../../composables/useEmosSearch';

const memory = useEmosSearch();
const detailsOpen = ref(false);
const ALL_PLATFORMS = ['openclaw', 'chatgpt', 'gemini', 'claude', 'deepseek'] as const;

const LIVE_SEARCH_DEBOUNCE_MS = 250;
const KNOWN_PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  deepseek: 'DeepSeek',
  agent: 'OpenClaw',
};
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const filters = reactive({
  query: '',
  platform: [...ALL_PLATFORMS] as string[],
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

const detailsModalStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-card)',
  boxShadow: 'var(--ac-shadow-float)',
}));

const hasActiveFilters = computed(
  () =>
    filters.query.trim().length > 0 ||
    filters.platform.length !== ALL_PLATFORMS.length ||
    filters.startDate.trim().length > 0 ||
    filters.endDate.trim().length > 0,
);

const noResultsMessage = computed(() =>
  filters.platform.length === 0
    ? 'No platforms selected. Use the top-right toggle to select all.'
    : hasActiveFilters.value
      ? 'No items match the current filters.'
      : 'No items found yet. Run ingestion to populate memory.',
);

const detailsVisible = computed(() => detailsOpen.value && !!memory.selectedItem.value);

// ---- Methods ----

async function runSearch(): Promise<void> {
  const selectedPlatforms =
    filters.platform.length === ALL_PLATFORMS.length ? undefined : [...filters.platform];
  await memory.search({
    query: filters.query,
    platform: selectedPlatforms,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });
}

function scheduleSearch(immediate = false): void {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }

  if (immediate) {
    void runSearch();
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    void runSearch();
    searchDebounceTimer = null;
  }, LIVE_SEARCH_DEBOUNCE_MS);
}

function refreshSearch(): void {
  scheduleSearch(true);
}

function handleSelectItem(item: MemoryItem): void {
  memory.selectItem(item);
  detailsOpen.value = true;
}

function closeDetails(): void {
  detailsOpen.value = false;
  memory.selectItem(null);
}

function openCanonicalUrl(item: MemoryItem): void {
  if (!item.source_url) return;
  void chrome.tabs.create({ url: item.source_url });
}

async function handleDeleteItem(item: MemoryItem): Promise<void> {
  const ok = confirm('Delete this memory item?');
  if (!ok) return;

  const removed = await memory.remove(item);
  if (removed) {
    detailsOpen.value = false;
  }
}

function formatSender(sender?: string): string {
  if (!sender) return 'Unknown';
  if (sender === 'me') return 'Me';
  return KNOWN_PLATFORM_LABELS[sender.toLowerCase()] || sender;
}

function getPlatformKey(item: MemoryItem): string {
  const group = item.group_id || '';
  if (group.includes(':')) {
    return group.split(':')[0].trim().toLowerCase();
  }

  const sender = item.sender?.trim().toLowerCase() || '';
  if (KNOWN_PLATFORM_LABELS[sender]) {
    return sender;
  }

  return 'unknown';
}

function formatPlatform(item: MemoryItem): string {
  const key = getPlatformKey(item);
  if (KNOWN_PLATFORM_LABELS[key]) {
    return KNOWN_PLATFORM_LABELS[key];
  }
  return key === 'unknown' ? 'Unknown' : key;
}

function formatGroupTitle(item: MemoryItem): string {
  const metadataGroupName =
    item.metadata && typeof item.metadata.group_name === 'string' ? item.metadata.group_name : null;
  const metadataTitle =
    item.metadata && typeof item.metadata.title === 'string' ? item.metadata.title : null;
  const preferred = item.group_name || metadataGroupName || metadataTitle;
  if (preferred && preferred.trim().length > 0) {
    return preferred.replace(/\s+/g, ' ').trim();
  }
  return 'Untitled Conversation';
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

function buildSnippet(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

watch(
  [() => filters.query, () => filters.platform, () => filters.startDate, () => filters.endDate],
  () => {
    scheduleSearch(false);
  },
);

onMounted(() => {
  scheduleSearch(true);
});

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
});
</script>

<style scoped>
.memory-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 10px;
  padding: 12px;
  position: relative;
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
  height: 100%;
  display: grid;
  grid-template-columns: 1fr;
}

/* List */
.memory-list {
  display: grid;
  grid-template-rows: auto 1fr;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.memory-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  font-size: 12px;
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: var(--ac-surface);
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
  height: 100%;
  overflow-y: auto;
  min-height: 0;
}

.placeholder {
  padding: 12px;
  color: var(--ac-text-subtle);
  font-size: 12px;
  font-family: var(--ac-font-body);
}

.loading-hint {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-body);
  border-bottom: var(--ac-border-width) solid var(--ac-border);
  background-color: color-mix(in srgb, var(--ac-surface) 92%, transparent);
}

/* Items */
.memory-item {
  width: 100%;
  min-width: 0;
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

.memory-item-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.memory-item-title {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.memory-item-title-text {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--ac-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-badge {
  flex-shrink: 0;
  border-radius: 999px;
  border: var(--ac-border-width) solid var(--ac-border);
  background-color: var(--ac-surface-muted);
  color: var(--ac-text-subtle);
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.01em;
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

@media (max-width: 900px) {
  .memory-content {
    display: block;
  }
}
</style>
