import { createApp } from 'vue';
import App from './App.vue';

// Tailwind first, then custom tokens
import '../styles/tailwind.css';
// AgentChat theme tokens (shared with sidepanel)
import '../sidepanel/styles/agent-chat.css';

import { preloadAgentTheme } from '../sidepanel/composables/useAgentTheme';

/**
 * Initialize and mount the Vue app.
 * Preloads theme before mounting to prevent flash.
 */
async function init(): Promise<void> {
  await preloadAgentTheme();
  createApp(App).mount('#app');
}

init();
