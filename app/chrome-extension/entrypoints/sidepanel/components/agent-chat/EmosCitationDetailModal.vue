<template>
  <Transition name="modal-fade">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <!-- Backdrop -->
      <Transition name="backdrop-fade">
        <div v-if="visible" class="absolute inset-0 bg-black/40" @click="close" />
      </Transition>

      <!-- Panel -->
      <Transition name="panel-slide">
        <div
          v-if="visible"
          class="relative w-full max-w-sm mx-4 overflow-hidden"
          :style="{
            backgroundColor: 'var(--ac-surface, #ffffff)',
            border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
            borderRadius: 'var(--ac-radius-card, 12px)',
            boxShadow: 'var(--ac-shadow-float, 0 8px 32px -4px rgba(0,0,0,0.25))',
          }"
        >
          <!-- Header: sender, time, close -->
          <div class="flex items-center justify-between gap-3 px-2 py-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-sm font-medium truncate" :style="{ color: 'var(--ac-text)' }">
                {{ senderText || 'unknown' }}
              </span>
              <span class="text-xs shrink-0" :style="{ color: 'var(--ac-text-muted)' }">
                {{ dateText || 'unknown' }}
              </span>
            </div>
            <button
              class="p-1 -m-1 rounded-full transition-colors"
              :style="{ color: 'var(--ac-text-muted)' }"
              aria-label="Close"
              @click="close"
            >
              <ILucideX class="w-4 h-4" />
            </button>
          </div>

          <!-- Content -->
          <div class="px-2 py-2">
            <p
              class="text-sm leading-relaxed whitespace-pre-wrap break-words"
              :style="{ color: 'var(--ac-text)', lineHeight: '1.6' }"
            >
              {{ item.content }}
            </p>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import ILucideX from '~icons/lucide/x';
import type { MemoryItem } from '../../composables/useEmosSearch';

const props = defineProps<{ item: MemoryItem }>();
const emit = defineEmits<{ close: [] }>();

const visible = ref(false);

// Animate in on mount
watch(
  () => props.item,
  () => {
    visible.value = true;
  },
  { immediate: true },
);

function close() {
  visible.value = false;
  setTimeout(() => emit('close'), 150);
}

const senderText = computed(() => props.item.sender_name ?? props.item.sender ?? '');

const dateText = computed(() => {
  const t = props.item.create_time;
  if (!t) return '';
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return t;
  }
});
</script>

<style scoped>
.modal-fade-enter-active {
  animation: fadeIn 0.15s ease-out;
}
.modal-fade-leave-active {
  animation: fadeIn 0.15s ease-in reverse;
}
.backdrop-fade-enter-active {
  animation: fadeIn 0.15s ease-out;
}
.backdrop-fade-leave-active {
  animation: fadeIn 0.15s ease-in reverse;
}
.panel-slide-enter-active {
  animation: slideUp 0.2s ease-out;
}
.panel-slide-leave-active {
  animation: slideDown 0.15s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes slideDown {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(16px) scale(0.96);
  }
}
</style>
