<template>
  <div class="flex items-center justify-between w-full">
    <!-- Brand / Context -->
    <div class="flex items-center -ml-3">
      <!-- Back Button (when in chat view) -->
      <button
        v-if="showBackButton"
        class="flex items-center justify-center w-8 h-8 flex-shrink-0 ac-btn"
        :style="{
          color: 'var(--ac-text-muted)',
          borderRadius: 'var(--ac-radius-button)',
        }"
        data-tooltip="Back"
        @click="$emit('back')"
      >
        <ILucideChevronLeft class="w-5 h-5" />
      </button>

      <!-- Brand + Connection Indicator -->
      <div class="flex items-center gap-3 ml-1">
        <h1
          class="text-lg font-medium tracking-tight flex-shrink-0"
          :style="{
            fontFamily: 'var(--ac-font-heading)',
            color: 'var(--ac-text)',
          }"
        >
          <button
            v-if="isEmptyChat"
            type="button"
            class="flex items-center gap-1 ac-btn ac-hover-text cursor-pointer"
            :style="{ borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Select engine"
            @click="$emit('toggle:engineMenu')"
          >
            <span class="inline-flex items-center gap-2">
              <img
                v-if="brandIconUrl"
                :src="brandIconUrl"
                alt=""
                class="w-5 h-5 rounded-full object-cover flex-shrink-0"
                :style="{ backgroundColor: 'var(--ac-surface)' }"
              />
              <ILucideFeather
                v-else-if="brandIconFallback === 'feather'"
                class="w-5 h-5 flex-shrink-0"
              />
              <span>{{ brandLabel || 'Agent' }}</span>
            </span>
            <ILucideChevronDown class="w-4 h-4" :style="{ color: 'var(--ac-text-subtle)' }" />
          </button>
          <span v-else class="inline-flex items-center gap-2">
            <img
              v-if="brandIconUrl"
              :src="brandIconUrl"
              alt=""
              class="w-5 h-5 rounded-full object-cover flex-shrink-0"
              :style="{ backgroundColor: 'var(--ac-surface)' }"
            />
            <ILucideFeather
              v-else-if="brandIconFallback === 'feather'"
              class="w-5 h-5 flex-shrink-0"
            />
            <span>{{ brandLabel || 'Agent' }}</span>
            <!-- Connection Indicator (left, after engine name) -->
            <div class="flex items-center" :data-tooltip="connectionText">
              <span
                class="w-2 h-2 m-1 rounded-full"
                :style="{
                  backgroundColor: connectionColor,
                  boxShadow: connectionState === 'ready' ? `0 0 8px ${connectionColor}` : 'none',
                }"
              />
            </div>
          </span>
        </h1>
      </div>
    </div>

    <!-- Settings -->
    <div class="flex items-center gap-3">
      <!-- Ruminate Toggle -->
      <button
        type="button"
        class="px-2 py-1 text-xs font-medium ac-btn ac-focus-ring transition-colors"
        :style="ruminateButtonStyle"
        :data-tooltip="ruminateEnabled ? 'Ruminate: On' : 'Ruminate: Off'"
        @click="$emit('toggle:ruminate')"
      >
        <span class="inline-flex items-center gap-1.5">
          <ILucideInfinity class="w-3.5 h-3.5" />
          <span>Ruminate</span>
        </span>
      </button>

      <!-- Session Settings Button -->
      <button
        class="p-1 ac-btn ac-hover-text"
        :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
        data-tooltip="Session settings"
        @click="$emit('session:settings')"
      >
        <ILucideSlidersHorizontal class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { getAgentEngineMetadata, getAgentEngineIconUrl } from '@/common/agent-engines';
import { computed } from 'vue';
import ILucideChevronDown from '~icons/lucide/chevron-down';
import ILucideChevronLeft from '~icons/lucide/chevron-left';
import ILucideFeather from '~icons/lucide/feather';
import ILucideInfinity from '~icons/lucide/infinity';
import ILucideSlidersHorizontal from '~icons/lucide/sliders-horizontal';

export type ConnectionState = 'ready' | 'connecting' | 'disconnected';

const props = defineProps<{
  projectLabel: string;
  sessionLabel: string;
  connectionState: ConnectionState;
  /** Whether to show back button (for returning to sessions list) */
  showBackButton?: boolean;
  /** Brand label to display (e.g., "Claude Code", "Codex") */
  brandLabel?: string;
  /** Engine name for resolving brand icon asset (e.g., "openclaw", "claude") */
  brandEngineName?: string;
  /** Whether current chat is empty; enables engine switching affordance */
  isEmptyChat?: boolean;
  /** Whether Ruminate (RAG) mode is enabled for this session */
  ruminateEnabled: boolean;
}>();

defineEmits<{
  'toggle:projectMenu': [];
  'toggle:sessionMenu': [];
  'toggle:engineMenu': [];
  'session:settings': [];
  'toggle:ruminate': [];
  /** Emitted when back button is clicked */
  back: [];
}>();

const connectionColor = computed(() => {
  switch (props.connectionState) {
    case 'ready':
      return 'var(--ac-success)';
    case 'connecting':
      return 'var(--ac-warning)';
    default:
      return 'var(--ac-text-subtle)';
  }
});

const connectionText = computed(() => {
  switch (props.connectionState) {
    case 'ready':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    default:
      return 'Disconnected';
  }
});

const brandIconUrl = computed(() => {
  return getAgentEngineIconUrl(props.brandEngineName);
});

const brandIconFallback = computed(() => {
  return getAgentEngineMetadata(props.brandEngineName).iconFallback;
});

const ruminateButtonStyle = computed(() => {
  const enabled = props.ruminateEnabled === true;
  return {
    borderRadius: '9999px',
    fontFamily: 'var(--ac-font-body)',
    border: enabled
      ? 'var(--ac-border-width, 1px) solid color-mix(in srgb, var(--ac-accent) 60%, transparent)'
      : 'var(--ac-border-width, 1px) solid var(--ac-border)',
    backgroundColor: enabled
      ? 'color-mix(in srgb, var(--ac-accent) 18%, transparent)'
      : 'transparent',
    color: enabled ? 'var(--ac-accent)' : 'var(--ac-text-subtle)',
  };
});
</script>
