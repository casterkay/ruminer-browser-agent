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
      <button class="search-btn ac-focus-ring" :style="searchBtnStyle" @click="$emit('search')">
        <svg class="search-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </button>
    </div>

    <div class="filter-row">
      <input
        :value="platform"
        class="filter-input"
        :style="filterInputStyle"
        type="text"
        placeholder="Platform (chatgpt, gemini, claude...)"
        @input="$emit('update:platform', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="startDate"
        class="filter-input"
        :style="filterInputStyle"
        type="date"
        @input="$emit('update:startDate', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="endDate"
        class="filter-input"
        :style="filterInputStyle"
        type="date"
        @input="$emit('update:endDate', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineProps<{
  query: string;
  platform: string;
  startDate: string;
  endDate: string;
}>();

defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:platform', value: string): void;
  (e: 'update:startDate', value: string): void;
  (e: 'update:endDate', value: string): void;
  (e: 'search'): void;
}>();

const searchWrapStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
}));

const inputStyle = computed(() => ({
  color: 'var(--ac-text)',
  fontFamily: 'var(--ac-font-body)',
}));

const searchBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent)',
  color: 'var(--ac-accent-contrast)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'none',
}));

const filterInputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-inner)',
  color: 'var(--ac-text)',
  fontFamily: 'var(--ac-font-body)',
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

.search-btn {
  flex-shrink: 0;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--ac-motion-fast),
    transform var(--ac-motion-fast);
}

.search-btn:hover {
  transform: translateY(-1px);
}

.search-btn-icon {
  width: 16px;
  height: 16px;
}

.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.filter-input {
  padding: 7px 10px;
  font-size: 12px;
  outline: none;
  transition: border-color var(--ac-motion-fast);
}

.filter-input::placeholder {
  color: var(--ac-text-placeholder);
}

.filter-input:focus {
  border-color: var(--ac-accent);
}

@media (max-width: 500px) {
  .filter-row {
    grid-template-columns: 1fr;
  }
}
</style>
