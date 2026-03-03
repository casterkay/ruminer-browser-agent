<template>
  <nav class="navigator" :style="navStyle">
    <button
      v-for="item in tabs"
      :key="item.id"
      class="nav-tab"
      :class="{ active: activeTab === item.id }"
      :style="activeTab === item.id ? activeTabStyle : inactiveTabStyle"
      @click="$emit('change', item.id)"
    >
      <component :is="item.icon" class="nav-icon" />
      <span class="nav-label">{{ item.label }}</span>
    </button>

    <!-- Active indicator pill -->
    <div class="nav-indicator" :style="indicatorStyle" />
  </nav>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import ILucideMessageCircleMore from '~icons/lucide/message-circle-more';
import ILucideDatabase from '~icons/lucide/database';
import ILucideZap from '~icons/lucide/zap';
import ILucideSettings from '~icons/lucide/settings';

type TabType = 'chat' | 'memory' | 'workflows' | 'settings';

const props = defineProps<{
  activeTab: TabType;
}>();

defineEmits<{
  (e: 'change', tab: TabType): void;
}>();

const tabs: Array<{ id: TabType; label: string; icon: Component }> = [
  { id: 'chat', label: 'Chat', icon: ILucideMessageCircleMore },
  { id: 'memory', label: 'Memory', icon: ILucideDatabase },
  { id: 'workflows', label: 'Workflows', icon: ILucideZap },
  { id: 'settings', label: 'Settings', icon: ILucideSettings },
];

const activeIndex = computed(() => tabs.findIndex((t) => t.id === props.activeTab));

const navStyle = computed(() => ({
  backgroundColor: 'var(--ac-header-bg)',
  borderBottom: 'var(--ac-border-width) solid var(--ac-border)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}));

const activeTabStyle = computed(() => ({
  color: 'var(--ac-accent)',
  fontWeight: '600',
}));

const inactiveTabStyle = computed(() => ({
  color: 'var(--ac-text-subtle)',
  fontWeight: '400',
}));

const indicatorStyle = computed(() => {
  const tabCount = tabs.length;
  const tabWidth = 100 / tabCount;
  const offset = activeIndex.value * tabWidth;
  return {
    left: `calc(${offset}% + ${tabWidth / 2}% - 12px)`,
    backgroundColor: 'var(--ac-accent)',
    transition: 'left var(--ac-motion-normal) ease',
  };
});
</script>

<style scoped>
.navigator {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 6px 0 8px;
  flex-shrink: 0;
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: none;
  background: none;
  cursor: pointer;
  transition:
    color var(--ac-motion-fast),
    font-weight var(--ac-motion-fast);
  font-family: var(--ac-font-body);
  position: relative;
  z-index: 1;
}

.nav-icon {
  width: 20px;
  height: 20px;
}

.nav-label {
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.01em;
}

.nav-indicator {
  position: absolute;
  top: 0;
  width: 24px;
  height: 3px;
  border-radius: 2px;
  pointer-events: none;
}
</style>
