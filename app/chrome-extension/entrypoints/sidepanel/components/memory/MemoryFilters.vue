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
        <button
          type="button"
          class="search-clear-btn ac-focus-ring"
          :disabled="!hasActiveFilters"
          aria-label="Reset filters"
          title="Reset filters"
          @click="resetFilters"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 6l12 12M18 6L6 18"
            />
          </svg>
        </button>
      </div>
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

      <div class="platform-header" style="margin-top: 2px">
        <span class="section-label">Speakers</span>
      </div>

      <div class="speaker-row ac-scroll">
        <div v-for="speaker in speakerOptions" :key="speaker" class="speaker-chip-wrap">
          <button
            type="button"
            class="platform-chip speaker-chip ac-focus-ring"
            :class="{ active: selectedSpeakerSet.has(speaker) }"
            :style="selectedSpeakerSet.has(speaker) ? activeChipStyle : inactiveChipStyle"
            @click="toggleSpeaker(speaker)"
          >
            {{ speaker }}
          </button>
          <button
            type="button"
            class="speaker-chip-remove ac-focus-ring"
            :aria-label="`Remove speaker ${speaker}`"
            :title="`Remove speaker ${speaker}`"
            @click.stop="removeSpeaker(speaker)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </div>

        <button
          v-if="!isAddingSpeaker"
          type="button"
          class="speaker-add-trigger ac-focus-ring"
          aria-label="Add speaker"
          title="Add speaker"
          @click="startAddingSpeaker"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 5v14M5 12h14"
            />
          </svg>
        </button>

        <div v-else class="speaker-add-chip" :style="inactiveChipStyle">
          <input
            ref="newSpeakerInputRef"
            v-model="newSpeaker"
            class="speaker-add-input"
            :style="speakerInputStyle"
            type="text"
            placeholder="Enter name"
            @keydown.enter.prevent="addSpeaker"
            @keydown.esc.prevent="cancelAddingSpeaker"
            @blur="
              () => {
                if (!newSpeaker.trim()) cancelAddingSpeaker();
              }
            "
          />
          <button
            type="button"
            class="speaker-add-save ac-focus-ring"
            aria-label="Save speaker"
            title="Save speaker"
            @click="addSpeaker"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{
  query: string;
  platform: string[];
  speakerOptions: string[];
  speakers: string[];
  hasDateFilter: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:platform', value: string[]): void;
  (e: 'update:speakerOptions', value: string[]): void;
  (e: 'update:speakers', value: string[]): void;
  (e: 'clearDateFilter'): void;
  (e: 'search'): void;
}>();

const platformOptions = [
  { label: 'OpenClaw', value: 'openclaw' },
  { label: 'Claude', value: 'claude' },
  { label: 'ChatGPT', value: 'chatgpt' },
  { label: 'Codex', value: 'codex' },
  { label: 'Gemini', value: 'gemini' },
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
    props.speakers.length !== props.speakerOptions.length ||
    props.hasDateFilter,
);

const selectedSpeakerSet = computed(() => new Set(props.speakers.map((value) => value.trim())));
const newSpeaker = ref('');
const isAddingSpeaker = ref(false);
const newSpeakerInputRef = ref<HTMLInputElement | null>(null);

function resetFilters(): void {
  emit('update:query', '');
  emit('update:platform', [...allPlatformValues]);
  emit('update:speakerOptions', ['user', 'assistant']);
  emit('update:speakers', ['user', 'assistant']);
  emit('clearDateFilter');
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

function toggleSpeaker(value: string): void {
  const next = new Set(selectedSpeakerSet.value);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  emit('update:speakers', Array.from(next));
}

function removeSpeaker(value: string): void {
  const nextOptions = props.speakerOptions.filter((v) => v !== value);
  emit('update:speakerOptions', nextOptions);
  const nextSelected = props.speakers.filter((v) => v !== value);
  emit('update:speakers', nextSelected);
  emit('search');
}

function addSpeaker(): void {
  const value = newSpeaker.value.trim();
  if (!value) {
    cancelAddingSpeaker();
    return;
  }

  const exists = props.speakerOptions.some((v) => v.trim() === value);
  if (!exists) {
    emit('update:speakerOptions', [...props.speakerOptions, value]);
  }

  if (!selectedSpeakerSet.value.has(value)) {
    emit('update:speakers', [...props.speakers, value]);
  }

  newSpeaker.value = '';
  isAddingSpeaker.value = false;
  emit('search');
}

function startAddingSpeaker(): void {
  isAddingSpeaker.value = true;
  void nextTick(() => {
    newSpeakerInputRef.value?.focus();
  });
}

function cancelAddingSpeaker(): void {
  newSpeaker.value = '';
  isAddingSpeaker.value = false;
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

const speakerInputStyle = computed(() => ({
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
  display: block;
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

.search-clear-btn {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 0;
  border: none;
  background-color: transparent;
  color: var(--ac-text-subtle);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color var(--ac-motion-fast),
    color var(--ac-motion-fast);
}

.search-clear-btn svg {
  width: 13px;
  height: 13px;
}

.search-clear-btn:hover:not(:disabled) {
  background-color: transparent;
  color: var(--ac-text);
}

.search-clear-btn:disabled {
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

.speaker-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

.speaker-chip-wrap {
  display: inline-flex;
  align-items: center;
  position: relative;
  flex-shrink: 0;
}

.speaker-chip-remove {
  width: 16px;
  height: 16px;
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border-radius: 0;
  border: none;
  background-color: transparent;
  color: var(--ac-text-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity var(--ac-motion-fast) 60ms,
    color var(--ac-motion-fast),
    background-color var(--ac-motion-fast);
}

.speaker-chip-remove svg {
  width: 11px;
  height: 11px;
}

.speaker-chip-wrap:hover .speaker-chip-remove,
.speaker-chip-wrap:focus-within .speaker-chip-remove {
  opacity: 1;
  pointer-events: auto;
}

.speaker-chip-remove:hover {
  background-color: transparent;
  color: var(--ac-text);
}

.speaker-chip {
  padding-right: 10px;
  transition: padding-right var(--ac-motion-fast);
}

.speaker-chip-wrap:hover .speaker-chip,
.speaker-chip-wrap:focus-within .speaker-chip {
  padding-right: 24px;
}

.speaker-add-trigger {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: var(--ac-border-width) solid var(--ac-border);
  background-color: var(--ac-surface-muted);
  color: var(--ac-text-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition:
    background-color var(--ac-motion-fast),
    border-color var(--ac-motion-fast),
    color var(--ac-motion-fast);
}

.speaker-add-trigger svg {
  width: 13px;
  height: 13px;
}

.speaker-add-trigger:hover {
  background-color: var(--ac-surface);
  border-color: var(--ac-text-subtle);
  color: var(--ac-text);
}

.speaker-add-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 3px 0 7px;
  border-radius: 999px;
  flex-shrink: 0;
}

.speaker-add-input {
  width: 70px;
  padding: 4px 0;
  font-size: 12px;
  outline: none;
  border: none !important;
  background: transparent !important;
}

.speaker-add-save {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--ac-text-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.speaker-add-save svg {
  width: 12px;
  height: 12px;
}

.speaker-add-save:hover {
  color: var(--ac-accent);
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
