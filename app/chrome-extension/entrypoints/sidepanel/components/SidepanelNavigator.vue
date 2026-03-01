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
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="item.icon" />
      </svg>
      <span class="nav-label">{{ item.label }}</span>
    </button>

    <!-- Active indicator pill -->
    <div class="nav-indicator" :style="indicatorStyle" />
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type TabType = 'chat' | 'memory' | 'workflows';

const props = defineProps<{
  activeTab: TabType;
}>();

defineEmits<{
  (e: 'change', tab: TabType): void;
}>();

const tabs: Array<{ id: TabType; label: string; icon: string }> = [
  {
    id: 'chat',
    label: 'Chat',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4M4 12c0 2.21 3.582 4 8 4s8-1.79 8-4',
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: 'm3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z',
  },
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
  grid-template-columns: repeat(3, 1fr);
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
