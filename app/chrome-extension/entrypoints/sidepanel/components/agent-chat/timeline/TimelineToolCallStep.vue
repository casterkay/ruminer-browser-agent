<template>
  <div class="space-y-1">
    <!-- Main row: Label + Tool name + Chevron -->
    <div class="flex items-center gap-2">
      <!-- Label -->
      <span
        class="text-[11px] font-bold uppercase tracking-wider flex-shrink-0"
        :style="{
          color: labelColor,
        }"
      >
        {{ displayLabel }}
      </span>

      <!-- Tool name -->
      <code
        v-if="item.tool.kind === 'grep' || item.tool.kind === 'read' || item.tool.kind === 'recall'"
        class="text-xs px-1.5 py-0.5 cursor-pointer ac-chip-hover"
        :style="{
          fontFamily: 'var(--ac-font-mono)',
          backgroundColor: 'var(--ac-chip-bg)',
          color: 'var(--ac-chip-text)',
          borderRadius: 'var(--ac-radius-button)',
        }"
        :title="item.tool.filePath || item.tool.pattern"
      >
        {{ item.tool.title }}
      </code>

      <span
        v-else
        class="text-xs truncate"
        :style="{
          fontFamily: 'var(--ac-font-mono)',
          color: 'var(--ac-text-muted)',
        }"
        :title="item.tool.filePath || item.tool.command"
      >
        {{ item.tool.title }}
      </span>

      <!-- Diff Stats Preview (for edit) -->
      <span
        v-if="hasDiffStats"
        class="text-[10px] px-1.5 py-0.5 flex-shrink-0"
        :style="{
          backgroundColor: 'var(--ac-chip-bg)',
          color: 'var(--ac-text-muted)',
          fontFamily: 'var(--ac-font-mono)',
          borderRadius: 'var(--ac-radius-button)',
        }"
      >
        <span v-if="diffStatsRef?.addedLines" class="text-green-600 dark:text-green-400">
          +{{ diffStatsRef.addedLines }}
        </span>
        <span v-if="diffStatsRef?.addedLines && diffStatsRef?.deletedLines">/</span>
        <span v-if="diffStatsRef?.deletedLines" class="text-red-600 dark:text-red-400">
          -{{ diffStatsRef.deletedLines }}
        </span>
      </span>

      <!-- Error indicator -->
      <span
        v-if="resultItem?.isError"
        class="text-[10px] flex-shrink-0"
        :style="{ color: 'var(--ac-danger)' }"
      >
        Error
      </span>

      <!-- Streaming indicator -->
      <span
        v-if="item.isStreaming && !resultItem"
        class="text-xs italic flex-shrink-0"
        :style="{ color: 'var(--ac-text-subtle)' }"
      >
        ...
      </span>

      <!-- Spacer to push chevron to right -->
      <span class="flex-1" />

      <!-- Chevron toggle for result details -->
      <button
        v-if="hasResultDetails"
        type="button"
        class="inline-flex items-center justify-center w-4 h-4 cursor-pointer transition-transform flex-shrink-0"
        :style="{ color: 'var(--ac-text-subtle)' }"
        :title="expanded ? 'Collapse' : 'Expand'"
        @click="expanded = !expanded"
      >
        <svg
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-90': expanded }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Collapsible result card -->
    <div
      v-if="expanded && resultDetails"
      class="overflow-hidden text-xs leading-5 mt-1"
      :style="{
        fontFamily: 'var(--ac-font-mono)',
        border: 'var(--ac-border-width) solid var(--ac-code-border)',
        boxShadow: 'var(--ac-shadow-card)',
        borderRadius: 'var(--ac-radius-inner)',
      }"
    >
      <!-- File list for edit -->
      <template v-if="resultItem?.tool.kind === 'edit' && resultItem.tool.files?.length">
        <div
          v-for="(file, idx) in resultItem.tool.files.slice(0, 5)"
          :key="file"
          class="px-3 py-1"
          :style="{
            backgroundColor: 'var(--ac-surface)',
            borderBottom:
              idx === Math.min(resultItem.tool.files!.length, 5) - 1
                ? 'none'
                : 'var(--ac-border-width) solid var(--ac-border)',
            color: 'var(--ac-text-muted)',
          }"
        >
          {{ file }}
        </div>
        <div
          v-if="resultItem.tool.files!.length > 5"
          class="px-3 py-1 text-[10px]"
          :style="{
            backgroundColor: 'var(--ac-surface-muted)',
            color: 'var(--ac-text-subtle)',
          }"
        >
          +{{ resultItem.tool.files!.length - 5 }} more files
        </div>
      </template>

      <!-- Generic details -->
      <template v-else>
        <div
          class="px-3 py-2 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto ac-scroll"
          :style="{
            backgroundColor: 'var(--ac-code-bg)',
            color: 'var(--ac-code-text)',
          }"
        >
          {{ resultDetails }}
        </div>
      </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { TimelineItem } from '../../../composables/useAgentThreads';

const props = defineProps<{
  item: Extract<TimelineItem, { kind: 'tool_use' }>;
  /** Paired tool_result item */
  resultItem?: Extract<TimelineItem, { kind: 'tool_result' }>;
}>();

const expanded = ref(false);

const displayLabel = computed(() => {
  // Use "CALL" for generic tools, preserve special labels
  const itemLabel = props.item.tool.label;
  const specialLabels = ['Plan', 'Edit', 'Write', 'Read', 'Grep', 'Search', 'Run', 'Recall'];
  if (specialLabels.includes(itemLabel)) {
    return itemLabel;
  }
  return 'CALL';
});

const labelColor = computed(() => {
  if (props.resultItem?.isError) return 'var(--ac-danger)';
  if (props.item.tool.kind === 'edit') return 'var(--ac-accent)';
  if (props.resultItem) return 'var(--ac-success)';
  return 'var(--ac-text-subtle)';
});

const diffStatsRef = computed(() => {
  return props.resultItem?.tool.diffStats ?? props.item.tool.diffStats;
});

const hasDiffStats = computed(() => {
  const stats = diffStatsRef.value;
  if (!stats) return false;
  return stats.addedLines !== undefined || stats.deletedLines !== undefined;
});

const resultDetails = computed(() => {
  return props.resultItem?.tool.details ?? undefined;
});

const hasResultDetails = computed(() => {
  if (!props.resultItem) return false;
  // Check for file list or text details
  if (props.resultItem.tool.kind === 'edit' && props.resultItem.tool.files?.length) return true;
  return !!props.resultItem.tool.details;
});
</script>
