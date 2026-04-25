<template>
  <div
    v-if="open"
    class="fixed top-12 left-4 right-4 z-50 py-2 max-w-[calc(100%-2rem)]"
    :style="{
      backgroundColor: 'var(--ac-surface, #ffffff)',
      border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      borderRadius: 'var(--ac-radius-inner, 8px)',
      boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.1))',
    }"
  >
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      Engines
    </div>

    <div class="max-h-[220px] overflow-y-auto ac-scroll">
      <button
        v-for="engine in engines"
        :key="engine.name"
        class="w-full px-3 py-2 text-left text-sm flex items-center justify-between ac-menu-item"
        :style="{
          color:
            currentEngine === engine.name ? 'var(--ac-accent, #c87941)' : 'var(--ac-text, #1a1a1a)',
        }"
        @click="$emit('engine:select', engine.name)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="inline-flex items-center justify-center w-4 h-4 flex-shrink-0"
            :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
          >
            <img
              v-if="getAgentEngineIconUrl(engine.name)"
              :src="getAgentEngineIconUrl(engine.name)"
              alt=""
              class="w-4 h-4 rounded-full object-cover"
              :style="{ backgroundColor: 'var(--ac-surface, #ffffff)' }"
            />
            <ILucidePointer
              v-else-if="getEngineIconFallback(engine.name) === 'pointer'"
              class="w-4 h-4"
            />
            <ILucideSparkles
              v-else-if="getEngineIconFallback(engine.name) === 'sparkles'"
              class="w-4 h-4"
            />
            <ILucideBrain
              v-else-if="getEngineIconFallback(engine.name) === 'brain'"
              class="w-4 h-4"
            />
            <ILucideFeather
              v-else-if="getEngineIconFallback(engine.name) === 'feather'"
              class="w-4 h-4"
            />
            <ILucideCpu v-else class="w-4 h-4" />
          </span>
          <span class="truncate">{{ toDisplayName(engine.name) }}</span>
        </div>

        <svg
          v-if="currentEngine === engine.name"
          class="w-4 h-4 flex-shrink-0 ml-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { AgentEngineInfo } from 'chrome-mcp-shared';
import { getAgentEngineMetadata, getAgentEngineIconUrl } from '@/common/agent-engines';
import ILucideFeather from '~icons/lucide/feather';
import ILucidePointer from '~icons/lucide/mouse-pointer-2';
import ILucideSparkles from '~icons/lucide/sparkles';
import ILucideBrain from '~icons/lucide/brain';
import ILucideCpu from '~icons/lucide/cpu';

defineProps<{
  open: boolean;
  engines: AgentEngineInfo[];
  currentEngine: string;
}>();

defineEmits<{
  'engine:select': [engineName: string];
}>();

function getEngineIconFallback(engineName: string): string {
  return getAgentEngineMetadata(engineName).iconFallback;
}

function toDisplayName(engineName: string): string {
  return getAgentEngineMetadata(engineName).displayName;
}
</script>
