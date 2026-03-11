<template>
  <div class="space-y-3">
    <!-- Timeline container -->
    <div class="relative space-y-4">
      <AgentTimelineItem
        v-for="(entry, index) in pairedItems"
        :key="entry.item.id"
        :item="entry.item"
        :result-item="entry.resultItem"
        :is-last="index === pairedItems.length - 1"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { AgentThreadState, TimelineItem } from '../../composables/useAgentThreads';
import AgentTimelineItem from './AgentTimelineItem.vue';

const props = defineProps<{
  items: TimelineItem[];
  state: AgentThreadState;
}>();

interface PairedItem {
  item: TimelineItem;
  resultItem?: Extract<TimelineItem, { kind: 'tool_result' }>;
}

/**
 * Pair consecutive tool_use → tool_result items into a single display entry.
 * Standalone tool_result items (with no preceding tool_use) remain as-is.
 */
const pairedItems = computed<PairedItem[]>(() => {
  const result: PairedItem[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < props.items.length; i++) {
    if (consumed.has(i)) continue;
    const item = props.items[i];

    if (item.kind === 'tool_use') {
      // Look ahead for ALL consecutive tool_results (skip any intermediate items)
      let resultItems: Extract<TimelineItem, { kind: 'tool_result' }>[] = [];
      for (let j = i + 1; j < props.items.length; j++) {
        const candidate = props.items[j];
        if (candidate.kind === 'tool_result') {
          // Pair with this tool_result
          resultItems.push(candidate);
          consumed.add(j);
        } else if (candidate.kind === 'tool_use') {
          // Stop at next tool_use
          break;
        }
        // Continue looking past other items (status, assistant_text, etc.)
      }
      // Use the first result if available, but pair all consumed results
      result.push({ item, resultItem: resultItems[0] });
      consumed.add(i);
    } else if (item.kind === 'tool_result' && !consumed.has(i)) {
      // Standalone tool_result - not consumed by any tool_use
      result.push({ item });
    } else {
      // Other items (user_prompt, assistant_text, status)
      result.push({ item });
    }
  }

  return result;
});
</script>
