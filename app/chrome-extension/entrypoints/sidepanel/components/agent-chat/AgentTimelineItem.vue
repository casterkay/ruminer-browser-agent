<template>
  <div class="relative group/step">
    <!-- Content based on item kind -->
    <TimelineUserPromptStep v-if="item.kind === 'user_prompt'" :item="item" />
    <TimelineNarrativeStep v-else-if="item.kind === 'assistant_text'" :item="item" />
    <TimelineToolCallStep v-else-if="item.kind === 'tool_use'" :item="item" />
    <TimelineToolResultCardStep v-else-if="item.kind === 'tool_result'" :item="item" />
    <TimelineStatusStep
      v-else-if="item.kind === 'status'"
      :item="item"
      :hide-icon="showLoadingIcon"
    />
  </div>
</template>

<script lang="ts" setup>
import type { TimelineItem } from '../../composables/useAgentThreads';
import TimelineUserPromptStep from './timeline/TimelineUserPromptStep.vue';
import TimelineNarrativeStep from './timeline/TimelineNarrativeStep.vue';
import TimelineToolCallStep from './timeline/TimelineToolCallStep.vue';
import TimelineToolResultCardStep from './timeline/TimelineToolResultCardStep.vue';
import TimelineStatusStep from './timeline/TimelineStatusStep.vue';

const props = defineProps<{
  item: TimelineItem;
  /** Whether this is the last item in the timeline */
  isLast?: boolean;
}>();
</script>
