<template>
  <div class="memory-filters">
    <input
      :value="query"
      class="memory-input"
      type="text"
      placeholder="Search memory"
      @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
    />
    <input
      :value="platform"
      class="memory-input"
      type="text"
      placeholder="Platform (chatgpt/gemini/claude/deepseek)"
      @input="$emit('update:platform', ($event.target as HTMLInputElement).value)"
    />
    <div class="memory-date-row">
      <input
        :value="startDate"
        class="memory-input"
        type="date"
        @input="$emit('update:startDate', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="endDate"
        class="memory-input"
        type="date"
        @input="$emit('update:endDate', ($event.target as HTMLInputElement).value)"
      />
      <button class="memory-button" @click="$emit('search')">Search</button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  query: string;
  platform: string;
  startDate: string;
  endDate: string;
}>();

defineEmits<{
  (e: 'update:query', value: string): void;
  (e: 'update:platform', value: string): void;
  (e: 'update:startDate', value: string): void;
  (e: 'update:endDate', value: string): void;
  (e: 'search'): void;
}>();
</script>

<style scoped>
.memory-filters {
  display: grid;
  gap: 8px;
}

.memory-date-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}

.memory-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: #0f172a;
  background: #ffffff;
}

.memory-button {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #ffffff;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
