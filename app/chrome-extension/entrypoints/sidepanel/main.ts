import { createApp } from 'vue';
import App from './App.vue';

// Tailwind first, then custom tokens
import '../styles/tailwind.css';
// AgentChat theme tokens
import './styles/agent-chat.css';

import { preloadAgentTheme } from './composables';

/**
 * Initialize and mount the Vue app.
 * Preloads theme before mounting to prevent flash.
 */
async function init(): Promise<void> {
  // Preload theme from storage and apply to document
  // This happens before Vue mounts, preventing theme flash
  await preloadAgentTheme();

  // Sidepanel presence: used for Quick Panel icon toggle behavior.
  try {
    const port = chrome.runtime.connect({ name: 'ruminer_sidepanel_presence' });
    const params = new URLSearchParams(location.search || '');
    const tabIdFromUrl = Number(params.get('tabId') || '');
    if (Number.isFinite(tabIdFromUrl) && tabIdFromUrl > 0) {
      port.postMessage({ tabId: tabIdFromUrl });
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.id === 'number') {
        port.postMessage({ tabId: tab.id });
      }
    }
    window.addEventListener('pagehide', () => {
      try {
        port.disconnect();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }

  // Mount Vue app
  createApp(App).mount('#app');
}

init();
