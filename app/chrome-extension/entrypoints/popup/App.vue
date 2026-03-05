<template>
  <div class="popup-root">
    <!-- Header with branding -->
    <header class="popup-header">
      <div class="logo-mark">
        <svg
          class="logo-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <div>
          <span class="logo-text">Ruminer</span>
          <p class="tagline">Browser agent for personal memory integration</p>
        </div>
      </div>
      <button class="btn-icon" :disabled="refreshing" @click="refreshStatus">
        <ILucideRefreshCw class="icon" :class="{ 'animate-spin': refreshing }" />
      </button>
    </header>

    <!-- Status Card -->
    <section class="settings-card" :class="serverReady ? 'ok' : 'warn'">
      <div class="settings-card-header">
        <span class="settings-label">MCP Server</span>
        <span class="settings-value" :class="serverReady ? 'ok' : 'warn'">
          {{ serverReady ? 'Running' : 'Stopped' }}
        </span>
      </div>
      <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
    </section>

    <!-- Actions -->
    <section class="actions">
      <button class="btn-primary" @click="openSidepanel">
        <ILucidePanelLeftOpen class="icon" />
        <span>Open Sidepanel</span>
      </button>
      <button class="btn-secondary" @click="openOptions">
        <ILucideSettings class="icon" />
        <span>Open Settings</span>
      </button>
      <button class="btn-secondary" @click="openWelcome">
        <ILucideBookOpen class="icon" />
        <span>Plugin Guide</span>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { onMounted, ref } from 'vue';
import ILucideBookOpen from '~icons/lucide/book-open';
import ILucidePanelLeftOpen from '~icons/lucide/panel-left-open';
import ILucideRefreshCw from '~icons/lucide/refresh-cw';
import ILucideSettings from '~icons/lucide/settings';

const serverReady = ref(false);
const statusMessage = ref('');
const refreshing = ref(false);

async function refreshStatus(): Promise<void> {
  refreshing.value = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS,
    });

    if (!response?.success) {
      serverReady.value = false;
      statusMessage.value = response?.error || 'Unable to query MCP server status';
      return;
    }

    const isRunning = response?.serverStatus?.isRunning === true;
    const port = response?.serverStatus?.port;

    serverReady.value = isRunning;
    statusMessage.value = isRunning
      ? `MCP server running${typeof port === 'number' ? ' on port ' + port : ''}`
      : 'MCP server not running (open the extension sidepanel and connect native host)';
  } finally {
    refreshing.value = false;
  }
}

async function openSidepanel(): Promise<void> {
  const sidePanel = chrome.sidePanel as any;
  if (!sidePanel?.open) {
    statusMessage.value = 'Sidepanel API is not available in this browser.';
    return;
  }

  const [tab, currentWindow] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]),
    chrome.windows.getCurrent(),
  ]);
  const tabId = tab?.id;
  const windowId = currentWindow?.id;
  const path = 'sidepanel.html?tab=agent-chat';

  try {
    if (typeof tabId === 'number' && sidePanel?.setOptions) {
      await sidePanel.setOptions({
        tabId,
        path,
        enabled: true,
      });
    }

    if (typeof tabId === 'number') {
      await sidePanel.open({ tabId });
    } else if (typeof windowId === 'number') {
      await sidePanel.open({ windowId });
    } else {
      throw new Error('No active window available');
    }

    statusMessage.value = 'Sidepanel opened.';
  } catch (error) {
    if (typeof windowId === 'number') {
      try {
        await sidePanel.open({ windowId });
        statusMessage.value = 'Sidepanel opened.';
        return;
      } catch {
        // Fall through to primary error handling.
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    statusMessage.value = `Failed to open sidepanel: ${message}`;
  }
}

function openOptions(): void {
  void chrome.runtime.openOptionsPage();
}

function openWelcome(): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
}

onMounted(() => {
  void refreshStatus();
});
</script>

<style scoped>
.popup-root {
  width: 360px;
  padding: 16px;
  display: grid;
  gap: 16px;
  background: var(--ac-bg);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}

/* Header */
.popup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: var(--ac-border-width) solid var(--ac-border);
}

.logo-mark {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  color: var(--ac-accent);
}

.logo-text {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

.tagline {
  margin: 0;
  font-size: 11px;
  color: var(--ac-text-muted);
}

/* Cards */
.settings-card {
  padding: 16px;
  display: grid;
  gap: 12px;
  background-color: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  box-shadow: var(--ac-shadow-card);
}

.settings-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.settings-card-header .settings-card-title {
  margin: 0;
}

.settings-card-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.settings-label {
  color: var(--ac-text-muted);
  font-weight: 500;
}

.settings-value {
  color: var(--ac-text);
}

.settings-value.ok {
  color: var(--ac-success);
}

.settings-value.warn {
  color: var(--ac-warning, var(--ac-text-muted));
}

.status-message {
  margin: 0;
  font-size: 11px;
  color: var(--ac-text-muted);
  padding: 8px 10px;
  background-color: var(--ac-surface-muted);
  border-radius: var(--ac-radius-inner);
}

/* Buttons */
.btn-icon {
  width: 28px;
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-inner);
  background-color: var(--ac-surface-muted);
  color: var(--ac-text);
  cursor: pointer;
  transition: background-color var(--ac-motion-fast);
}

.btn-icon:hover:not(:disabled) {
  background-color: var(--ac-hover-bg);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.animate-spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.actions {
  display: grid;
  gap: 8px;
}

.btn-primary,
.btn-secondary {
  width: 100%;
  border-radius: var(--ac-radius-button);
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: var(--ac-border-width) solid;
  transition:
    background-color var(--ac-motion-fast),
    border-color var(--ac-motion-fast);
}

.btn-primary {
  border-color: var(--ac-accent);
  background: var(--ac-accent);
  color: var(--ac-accent-contrast);
}

.btn-primary:hover {
  background: var(--ac-accent-hover);
  border-color: var(--ac-accent-hover);
}

.btn-secondary {
  border-color: var(--ac-border);
  background: var(--ac-surface);
  color: var(--ac-text);
}

.btn-secondary:hover {
  background: var(--ac-hover-bg);
  border-color: var(--ac-border-strong);
}

.btn-secondary .icon {
  width: 14px;
  height: 14px;
  color: var(--ac-text-muted);
}
</style>
