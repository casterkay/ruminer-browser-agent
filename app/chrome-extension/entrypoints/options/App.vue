<template>
  <div class="agent-theme options-page" :data-agent-theme="theme.theme.value">
    <header class="options-header">
      <h1 class="options-title">System Settings</h1>
    </header>

    <SystemSettingsForm />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import SystemSettingsForm from '@/entrypoints/shared/components/SystemSettingsForm.vue';
import { useAgentTheme } from '../sidepanel/composables/useAgentTheme';

const theme = useAgentTheme();

onMounted(async () => {
  await theme.initTheme();
});
</script>

<style scoped>
.options-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 20px;
  display: grid;
  gap: 16px;
  min-height: 100vh;
  background-color: var(--ac-bg);
  background-image: var(--ac-bg-pattern);
  background-size: var(--ac-bg-pattern-size);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}

.options-header {
  padding: 0 2px;
}

.options-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}
</style>
