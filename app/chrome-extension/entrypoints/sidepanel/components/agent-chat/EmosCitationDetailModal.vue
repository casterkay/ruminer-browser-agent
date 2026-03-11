<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    role="dialog"
    aria-modal="true"
    aria-label="Memory citation details"
    @click.self="$emit('close')"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/40" @click="$emit('close')" />

    <!-- Panel -->
    <div
      class="relative w-full max-w-md mx-4 max-h-[85vh] overflow-hidden flex flex-col"
      :style="{
        backgroundColor: 'var(--ac-surface, #ffffff)',
        border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
        borderRadius: 'var(--ac-radius-card, 12px)',
        boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.2))',
      }"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3"
        :style="{ borderBottom: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)' }"
      >
        <div class="flex items-center gap-2">
          <ILucideBrain class="w-4 h-4 shrink-0" :style="{ color: 'var(--ac-accent)' }" />
          <h2 class="text-sm font-semibold" :style="{ color: 'var(--ac-text)' }">
            Memory Citation
          </h2>
        </div>
        <button
          class="p-1 ac-btn ac-focus-ring"
          :style="{ color: 'var(--ac-text-muted)', borderRadius: 'var(--ac-radius-button)' }"
          aria-label="Close"
          @click="$emit('close')"
        >
          <ILucideX class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto ac-scroll px-4 py-4 space-y-4">
        <!-- Memory Content -->
        <div class="space-y-1.5">
          <div
            class="text-[10px] font-bold uppercase tracking-wider"
            :style="{ color: 'var(--ac-text-subtle)' }"
          >
            Content
          </div>
          <div
            class="text-sm p-3 whitespace-pre-wrap break-words"
            :style="{
              color: 'var(--ac-text)',
              backgroundColor: 'var(--ac-surface-inset)',
              borderRadius: 'var(--ac-radius-inner)',
              lineHeight: '1.6',
            }"
          >
            {{ item.content }}
          </div>
        </div>

        <!-- Details -->
        <div class="space-y-2">
          <div
            class="text-[10px] font-bold uppercase tracking-wider"
            :style="{ color: 'var(--ac-text-subtle)' }"
          >
            Details
          </div>
          <div
            class="divide-y text-xs"
            :style="{
              backgroundColor: 'var(--ac-surface-inset)',
              borderRadius: 'var(--ac-radius-inner)',
              border: 'var(--ac-border-width, 1px) solid var(--ac-border)',
              '--tw-divide-color': 'var(--ac-border)',
            }"
          >
            <MetaRow v-if="senderText" label="Sender">{{ senderText }}</MetaRow>
            <MetaRow v-if="item.role" label="Role">
              <span class="capitalize">{{ item.role }}</span>
            </MetaRow>
            <MetaRow v-if="dateText" label="Date">{{ dateText }}</MetaRow>
            <MetaRow v-if="groupText" label="Conversation">{{ groupText }}</MetaRow>
            <MetaRow v-if="item.source_url" label="Source">
              <a
                :href="item.source_url"
                target="_blank"
                rel="noopener noreferrer"
                class="underline truncate max-w-[220px] inline-block align-bottom"
                :style="{ color: 'var(--ac-accent)' }"
              >
                {{ item.source_url }}
              </a>
            </MetaRow>
            <MetaRow label="ID">
              <span
                class="font-mono text-[10px] truncate max-w-[220px] inline-block align-bottom"
                :style="{ color: 'var(--ac-text-muted)' }"
              >
                {{ item.message_id }}
              </span>
            </MetaRow>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ILucideBrain from '~icons/lucide/brain';
import ILucideX from '~icons/lucide/x';
import type { MemoryItem } from '../../composables/useEmosSearch';

defineEmits<{ close: [] }>();

const props = defineProps<{ item: MemoryItem }>();

const senderText = computed(() => props.item.sender_name ?? props.item.sender ?? '');

const dateText = computed(() => {
  const t = props.item.create_time;
  if (!t) return '';
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
  } catch {
    return t;
  }
});

const groupText = computed(() => props.item.group_name ?? props.item.group_id ?? '');
</script>

<!-- Inline child component for each metadata row -->
<script lang="ts">
import { defineComponent, h } from 'vue';

const MetaRow = defineComponent({
  name: 'MetaRow',
  props: { label: { type: String, required: true } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          class: 'flex items-center justify-between gap-3 px-3 py-2',
        },
        [
          h(
            'span',
            {
              class: 'shrink-0',
              style: 'color: var(--ac-text-subtle)',
            },
            props.label,
          ),
          h(
            'span',
            {
              class: 'text-right truncate',
              style: 'color: var(--ac-text)',
            },
            slots.default?.(),
          ),
        ],
      );
  },
});

export { MetaRow };
</script>
