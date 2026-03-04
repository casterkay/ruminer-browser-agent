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
        <div class="text-sm font-semibold" :style="{ color: 'var(--ac-text)' }">Run workflow</div>
        <div class="mt-1 text-xs" :style="{ color: 'var(--ac-text-muted)' }">
          <span class="font-medium" :style="{ color: 'var(--ac-text)' }">{{ flowName }}</span>
          requires parameters:
        </div>

        <div class="mt-3 space-y-3">
          <div v-for="v in variables" :key="v.name" class="space-y-1">
            <div class="flex items-center justify-between gap-2">
              <label class="text-xs font-medium" :style="{ color: 'var(--ac-text)' }">
                {{ v.label || v.name }}
              </label>
              <span class="text-[10px]" :style="{ color: 'var(--ac-text-subtle)' }">{{
                v.name
              }}</span>
            </div>

            <input
              v-model="values[v.name]"
              class="w-full px-3 py-2 text-xs rounded"
              :style="inputStyle"
              :type="v.sensitive ? 'password' : 'text'"
              :placeholder="v.description || 'Required'"
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>

        <div v-if="validationError" class="mt-3 text-xs" :style="{ color: 'var(--ac-danger)' }">
          {{ validationError }}
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
            :disabled="!canSubmit"
            @click="submit"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';

export type FlowArgVar = {
  name: string;
  label?: string;
  description?: string;
  sensitive?: boolean;
};

const props = defineProps<{
  open: boolean;
  flowName: string;
  variables: FlowArgVar[];
  initialValues?: Record<string, string | undefined>;
}>();

const emit = defineEmits<{
  (e: 'run', args: Record<string, string>): void;
  (e: 'cancel'): void;
}>();

const values = reactive<Record<string, string>>({});

watch(
  () => [props.open, props.variables, props.initialValues] as const,
  () => {
    if (!props.open) {
      return;
    }
    for (const v of props.variables) {
      const initial = props.initialValues?.[v.name];
      values[v.name] = typeof initial === 'string' ? initial : values[v.name] || '';
    }
  },
  { immediate: true, deep: true },
);

const validationError = computed(() => {
  for (const v of props.variables) {
    const val = String(values[v.name] || '').trim();
    if (!val) {
      return `Please fill "${v.label || v.name}".`;
    }
  }
  return null;
});

const canSubmit = computed(() => props.open && !validationError.value);

function submit() {
  if (!canSubmit.value) return;
  const out: Record<string, string> = {};
  for (const v of props.variables) {
    out[v.name] = String(values[v.name] || '').trim();
  }
  emit('run', out);
}

const backdropStyle = computed(() => ({
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
}));

const modalStyle = computed(() => ({
  backgroundColor: 'var(--ac-modal-surface, var(--ac-surface, #ffffff))',
  borderRadius: 'var(--ac-radius-card, 12px)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e7e5e4)',
  boxShadow: 'var(--ac-shadow-float, 0 12px 40px -12px rgba(0, 0, 0, 0.25))',
}));

const inputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface, #ffffff)',
  color: 'var(--ac-text, #111827)',
  borderRadius: 'var(--ac-radius-inner, 10px)',
  border: '1px solid var(--ac-border, #e7e5e4)',
}));

const btnPrimaryStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent, #d97757)',
  color: 'var(--ac-accent-contrast, #ffffff)',
  borderRadius: 'var(--ac-radius-button, 8px)',
  opacity: canSubmit.value ? '1' : '0.6',
}));

const btnSecondaryStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted, #f2f0eb)',
  color: 'var(--ac-text-muted, #6e6e6e)',
  borderRadius: 'var(--ac-radius-button, 8px)',
  border: '1px solid var(--ac-border, #e7e5e4)',
}));
</script>
