<template>
  <div class="relative group/step">
    <!-- Content based on item kind -->
    <TimelineUserPromptStep v-if="item.kind === 'user_prompt'" :item="item" />
    <TimelineNarrativeStep v-else-if="item.kind === 'assistant_text'" :item="item" />
    <TimelineToolCallStep
      v-else-if="item.kind === 'tool_use'"
      :item="item"
      :result-item="resultItem"
    />
    <!-- Only render tool_result card for standalone results (not paired with tool_use) -->
    <TimelineToolResultCardStep
      v-else-if="item.kind === 'tool_result' && !resultItem"
      :item="item"
    />
    <TimelineStatusStep v-else-if="item.kind === 'status'" :item="item" />
  </div>
</template>

<script lang="ts" setup>
import type { TimelineItem } from '../../composables/useAgentThreads';
import TimelineNarrativeStep from './timeline/TimelineNarrativeStep.vue';
import TimelineStatusStep from './timeline/TimelineStatusStep.vue';
import TimelineToolCallStep from './timeline/TimelineToolCallStep.vue';
import TimelineToolResultCardStep from './timeline/TimelineToolResultCardStep.vue';
import TimelineUserPromptStep from './timeline/TimelineUserPromptStep.vue';

defineProps<{
  item: TimelineItem;
  /** Paired tool_result item (for tool_use items with results) */
  resultItem?: Extract<TimelineItem, { kind: 'tool_result' }>;
  /** Whether this is the last item in the timeline */
  isLast?: boolean;
}>();
</script>
