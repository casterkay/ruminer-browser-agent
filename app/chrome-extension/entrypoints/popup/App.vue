<template>
  <div class="popup-root">
    <header>
      <h1>Ruminer</h1>
      <p>Browser agent for personal memory integration</p>
    </header>

    <section class="status-card" :class="serverReady ? 'ok' : 'warn'">
      <div class="status-row">
        <strong>MCP Server</strong>
        <span>{{ serverReady ? 'Running' : 'Stopped' }}</span>
      </div>
      <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
      <button class="secondary" @click="refreshStatus">Refresh</button>
    </section>

    <section class="actions">
      <button class="primary" @click="openSidepanel">Open Sidepanel</button>
      <button class="secondary" @click="openOptions">Open Settings</button>
      <button class="secondary" @click="openWelcome">Plugin Guide</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

const serverReady = ref(false);
const statusMessage = ref('');

async function refreshStatus(): Promise<void> {
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
    ? `MCP server running${typeof port === 'number' ? ` on port ${port}` : ''}`
    : 'MCP server not running (open the extension sidepanel and connect native host)';
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
  min-height: 260px;
  padding: 14px;
  display: grid;
  gap: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
  color: #0f172a;
}

header h1 {
  margin: 0;
  font-size: 22px;
}

header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #475569;
}

.status-card {
  border: 1px solid;
  border-radius: 10px;
  padding: 10px;
  display: grid;
  gap: 8px;
}

.status-card.ok {
  background: #ecfdf5;
  border-color: #86efac;
}

.status-card.warn {
  background: #fff7ed;
  border-color: #fdba74;
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}

.status-message {
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.actions {
  display: grid;
  gap: 8px;
}

.primary,
.secondary {
  width: 100%;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid;
}

.primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.secondary {
  border-color: #94a3b8;
  background: #ffffff;
  color: #334155;
}
</style>
