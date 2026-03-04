<template>
  <Teleport to=".sidepanel-root">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div class="absolute inset-0" :style="backdropStyle" @click="$emit('cancel')"></div>

      <div class="relative w-full max-w-md p-4" :style="modalStyle" @click.stop>
        <div class="text-sm font-semibold" :style="{ color: 'var(--ac-text)' }">
          Approve workflow tools
        </div>
        <div class="mt-1 text-xs" :style="{ color: 'var(--ac-text-muted)' }">
          <span class="font-medium" :style="{ color: 'var(--ac-text)' }">{{ flowName }}</span>
          declares these tools:
        </div>

        <div class="mt-3 max-h-52 overflow-y-auto ac-scroll">
          <ul class="space-y-1">
            <li
              v-for="tool in requiredTools"
              :key="tool"
              class="text-xs px-2 py-1 rounded"
              :style="toolPillStyle(tool)"
            >
              {{ tool }}
            </li>
          </ul>
        </div>

        <div
          v-if="addedTools.length > 0"
          class="mt-3 text-xs"
          :style="{ color: 'var(--ac-text-muted)' }"
        >
          Newly required:
          <span :style="{ color: 'var(--ac-warning, #d97706)' }">{{ addedTools.join(', ') }}</span>
        </div>

        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            class="px-3 py-2 text-xs font-medium"
            :style="btnSecondaryStyle"
            @click="$emit('cancel')"
          >
            Cancel
          </button>
          <button
            class="px-3 py-2 text-xs font-medium"
            :style="btnPrimaryStyle"
            @click="$emit('approve')"
          >
            Approve & Run
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  flowName: string;
  requiredTools: string[];
  addedTools: string[];
}>();

defineEmits<{
  (e: 'approve'): void;
  (e: 'cancel'): void;
}>();

const backdropStyle = computed(() => ({
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
}));

const modalStyle = computed(() => ({
  backgroundColor: 'var(--ac-modal-surface, var(--ac-surface, #ffffff))',
  borderRadius: 'var(--ac-radius-card, 12px)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4)',
  boxShadow: 'var(--ac-shadow-float, 0 12px 40px -12px rgba(0, 0, 0, 0.25))',
}));

const btnPrimaryStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent, #d97757)',
  color: 'var(--ac-accent-contrast, #ffffff)',
  borderRadius: 'var(--ac-radius-button, 8px)',
}));

const btnSecondaryStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-muted, #6e6e6e)',
  borderRadius: 'var(--ac-radius-button, 8px)',
  border: '1px solid var(--ac-border, #e7e5e4)',
}));

function toolPillStyle(tool: string): Record<string, string> {
  const isAdded = props.addedTools.includes(tool);
  return {
    backgroundColor: isAdded
      ? 'var(--ac-warning-light, #fef3c7)'
      : 'var(--ac-surface-muted, #f2f0eb)',
    color: isAdded ? 'var(--ac-warning, #d97706)' : 'var(--ac-text-muted, #6e6e6e)',
  };
}
</script>
