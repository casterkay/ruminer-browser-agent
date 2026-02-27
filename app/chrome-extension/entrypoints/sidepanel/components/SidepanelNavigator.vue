<template>
  <nav class="navigator">
    <button
      v-for="item in tabs"
      :key="item.id"
      class="nav-item"
      :class="{ active: activeTab === item.id }"
      @click="$emit('change', item.id)"
    >
      {{ item.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
type TabType = 'chat' | 'memory' | 'workflows';

const props = defineProps<{
  activeTab: TabType;
}>();

const tabs: Array<{ id: TabType; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'memory', label: 'Memory' },
  { id: 'workflows', label: 'Workflows' },
];

defineEmits<{
  (e: 'change', tab: TabType): void;
}>();
</script>

<style scoped>
.navigator {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid #cbd5e1;
  background: #ffffff;
}

.nav-item {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: #334155;
  background: #f8fafc;
  cursor: pointer;
}

.nav-item.active {
  border-color: #2563eb;
  background: #dbeafe;
  color: #1e40af;
  font-weight: 600;
}
</style>
