<template>
  <div class="memory-filters">
    <div class="search-row">
      <div class="search-input-wrap" :style="searchWrapStyle">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          :value="query"
          class="search-input"
          :style="inputStyle"
          type="text"
          placeholder="Search memory..."
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
          @keydown.enter="$emit('search')"
        />
      </div>
      <button
        class="reset-btn ac-focus-ring"
        :style="resetBtnStyle"
        :disabled="!hasActiveFilters"
        @click="resetFilters"
      >
        Reset
      </button>
    </div>

    <div class="platform-section">
      <div class="platform-header">
        <span class="section-label">Platforms</span>
        <button
          class="toggle-all-btn ac-focus-ring"
          :title="allSelected ? 'Unselect all platforms' : 'Select all platforms'"
          :aria-label="allSelected ? 'Unselect all platforms' : 'Select all platforms'"
          @click="toggleAllPlatforms"
        >
          <svg
            v-if="allSelected"
            class="toggle-all-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 5h14v14H5zM8 12h8"
            />
          </svg>
          <svg v-else class="toggle-all-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 5h14v14H5zM8 12h8M12 8v8"
            />
          </svg>
        </button>
      </div>

      <div class="platform-row ac-scroll">
        <button
          v-for="option in platformOptions"
          :key="option.value"
          type="button"
          class="platform-chip ac-focus-ring"
          :class="{ active: selectedPlatformSet.has(option.value) }"
          :style="selectedPlatformSet.has(option.value) ? activeChipStyle : inactiveChipStyle"
          @click="togglePlatform(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div class="date-row">
      <label class="date-field">
        <span class="date-label">Start</span>
        <input
          :value="startDate"
          class="filter-input"
          :style="filterInputStyle"
          type="date"
          @input="$emit('update:startDate', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="date-field">
        <span class="date-label">End</span>
        <input
          :value="endDate"
          class="filter-input"
          :style="filterInputStyle"
          type="date"
          @input="$emit('update:endDate', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  query: string;
  platform: string[];
  startDate: string;
  endDate: string;
}>();

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:platform', value: string[]): void;
  (e: 'update:startDate', value: string): void;
  (e: 'update:endDate', value: string): void;
  (e: 'search'): void;
}>();

const platformOptions = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'ChatGPT', value: 'chatgpt' },
  { label: 'Gemini', value: 'gemini' },
  { label: 'Claude', value: 'claude' },
  { label: 'DeepSeek', value: 'deepseek' },
] as const;

const allPlatformValues = platformOptions.map((option) => option.value);
const selectedPlatformSet = computed(
  () => new Set(props.platform.map((value) => value.toLowerCase())),
);
const allSelected = computed(() =>
  allPlatformValues.every((value) => selectedPlatformSet.value.has(value)),
);
const hasActiveFilters = computed(
  () =>
    props.query.trim().length > 0 ||
    !allSelected.value ||
    props.startDate.trim().length > 0 ||
    props.endDate.trim().length > 0,
);

function resetFilters(): void {
  emit('update:query', '');
  emit('update:platform', [...allPlatformValues]);
  emit('update:startDate', '');
  emit('update:endDate', '');
  emit('search');
}

function togglePlatform(value: string): void {
  const next = new Set(selectedPlatformSet.value);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  emit('update:platform', Array.from(next));
}

function toggleAllPlatforms(): void {
  emit('update:platform', allSelected.value ? [] : [...allPlatformValues]);
  emit('search');
}

const searchWrapStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
}));

const inputStyle = computed(() => ({
  color: 'var(--ac-text)',
  fontFamily: 'var(--ac-font-body)',
}));

const resetBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
}));

const filterInputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
  color: 'var(--ac-text)',
  fontFamily: 'var(--ac-font-body)',
}));

const activeChipStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent-subtle)',
  border: 'var(--ac-border-width) solid var(--ac-accent)',
  color: 'var(--ac-accent)',
}));

const inactiveChipStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  color: 'var(--ac-text-muted)',
}));
</script>

<style scoped>
.memory-filters {
  display: grid;
  gap: 8px;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 10px;
}

.search-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ac-text-subtle);
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  padding: 8px 8px;
  font-size: 13px;
  outline: none;
}

.search-input::placeholder {
  color: var(--ac-text-placeholder);
}

.reset-btn {
  flex-shrink: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--ac-font-body);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--ac-motion-fast),
    transform var(--ac-motion-fast);
}

.reset-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.platform-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

.platform-section {
  display: grid;
  gap: 6px;
}

.platform-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ac-text-subtle);
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-family: var(--ac-font-body);
}

.toggle-all-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid var(--ac-border);
  border-radius: 99px;
  background-color: transparent;
  color: var(--ac-text-subtle);
  transition:
    background-color var(--ac-motion-fast),
    border-color var(--ac-motion-fast),
    color var(--ac-motion-fast);
}

.toggle-all-btn:hover {
  background-color: var(--ac-surface-muted);
  border-color: var(--ac-text-subtle);
  color: var(--ac-text);
}

.toggle-all-btn:focus-visible {
  outline: 2px solid var(--ac-accent);
  outline-offset: 2px;
}

.toggle-all-icon {
  width: 13px;
  height: 13px;
}

.platform-chip {
  border-radius: 999px;
  padding: 4px 10px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--ac-font-body);
  cursor: pointer;
  transition:
    background-color var(--ac-motion-fast),
    border-color var(--ac-motion-fast),
    color var(--ac-motion-fast);
}

.date-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.date-field {
  display: grid;
  gap: 4px;
}

.date-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-body);
}

.filter-input {
  padding: 7px 10px;
  font-size: 12px;
  outline: none;
  width: 100%;
  transition: border-color var(--ac-motion-fast);
}

.filter-input::placeholder {
  color: var(--ac-text-placeholder);
}

.filter-input:focus {
  border-color: var(--ac-accent);
}
</style>
