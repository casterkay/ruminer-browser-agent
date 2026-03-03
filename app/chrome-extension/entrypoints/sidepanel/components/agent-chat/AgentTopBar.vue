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
            <span>{{ brandLabel || 'Agent' }}</span>
          </span>
        </h1>

        <!-- Connection Indicator (left, after engine name) -->
        <div class="flex items-center" :data-tooltip="connectionText">
          <span
            class="w-2 h-2 rounded-full"
            :style="{
              backgroundColor: connectionColor,
              boxShadow: connectionState === 'ready' ? `0 0 8px ${connectionColor}` : 'none',
            }"
          />
        </div>
      </div>
    </div>

    <!-- Settings -->
    <div class="flex items-center gap-3">
      <!-- Session Settings Button -->
      <button
        class="p-1 ac-btn ac-hover-text"
        :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
        data-tooltip="Session settings"
        @click="$emit('session:settings')"
      >
        <ILucideSlidersHorizontal class="w-5 h-5" />
      </button>

      <!-- Open Project Button -->
      <button
        class="p-1 ac-btn ac-hover-text"
        :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
        data-tooltip="Open project workspace"
        @click="$emit('toggle:openProjectMenu')"
      >
        <ILucideFolderOpen class="w-5 h-5" />
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ILucideSlidersHorizontal from '~icons/lucide/sliders-horizontal';
import ILucideChevronLeft from '~icons/lucide/chevron-left';
import ILucideChevronDown from '~icons/lucide/chevron-down';
import ILucideFolderOpen from '~icons/lucide/folder-open';

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
}>();

defineEmits<{
  'toggle:projectMenu': [];
  'toggle:sessionMenu': [];
  'toggle:engineMenu': [];
  'toggle:openProjectMenu': [];
  'session:settings': [];
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
  const engineName = props.brandEngineName?.trim();
  if (!engineName) return '';

  const path =
    engineName === 'openclaw'
      ? 'engine-icons/openclaw.svg'
      : engineName === 'claude'
        ? 'engine-icons/claude.png'
        : engineName === 'codex'
          ? 'engine-icons/codex.svg'
          : '';

  if (!path) return '';

  try {
    // Prefer extension-safe URL in sidepanel context
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch {
    // ignore
  }

  // Dev/preview fallback
  return `/${path}`;
});
</script>
