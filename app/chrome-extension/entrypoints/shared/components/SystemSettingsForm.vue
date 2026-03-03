<template>
  <div class="system-settings-form">
    <!-- Toast for saved notifications -->
    <Transition name="toast">
      <div v-if="toastMessage" class="settings-toast">
        {{ toastMessage }}
      </div>
    </Transition>

    <!-- MCP Server card -->
    <section class="settings-card">
      <div class="settings-card-header">
        <h2 class="settings-card-title">MCP Server</h2>
        <button
          type="button"
          class="btn-icon"
          :disabled="refreshing"
          :aria-label="t('refreshStatusButtonAria')"
          @click="refreshServerStatus"
        >
          <ILucideRefreshCw class="w-4 h-4" :class="{ 'animate-spin': refreshing }" />
        </button>
      </div>
      <div class="settings-row">
        <span class="settings-label">Status</span>
        <span class="settings-value" :class="mcpServerRunning ? 'ok' : 'warn'">
          {{ mcpServerRunning ? 'Running' : 'Stopped' }}
        </span>
      </div>
      <div v-if="mcpServerPort != null" class="settings-row">
        <span class="settings-label">Port</span>
        <span class="settings-value">{{ mcpServerPort }}</span>
      </div>
      <div v-else class="settings-row">
        <span class="settings-label">Port</span>
        <span class="settings-value settings-muted">Default: {{ defaultPort }}</span>
      </div>
    </section>

    <!-- Quick Panel card -->
    <section class="settings-card">
      <h2 class="settings-card-title">Quick Panel</h2>
      <label class="settings-checkbox">
        <input v-model="floatingIconEnabled" type="checkbox" @change="saveFloatingIcon" />
        <span>Show in-page button</span>
      </label>
    </section>

    <!-- OpenClaw Gateway card -->
    <section class="settings-card">
      <div class="settings-card-header">
        <h2 class="settings-card-title">OpenClaw Gateway</h2>
        <button
          type="button"
          class="btn-icon"
          :disabled="testingGateway"
          :aria-label="t('testConnectionButtonAria')"
          @click="testGateway"
        >
          <ILucidePlug class="w-4 h-4" />
        </button>
      </div>
      <label class="settings-field">
        <span class="settings-field-label">Gateway WS URL</span>
        <input
          v-model="gatewayWsUrl"
          class="settings-field-input"
          type="text"
          placeholder="ws://127.0.0.1:18789"
          @blur="saveGateway"
        />
      </label>
      <label class="settings-field">
        <span class="settings-field-label">Auth Token</span>
        <input
          v-model="gatewayAuthToken"
          class="settings-field-input"
          type="password"
          placeholder="gateway token"
          @blur="saveGateway"
        />
      </label>
      <div v-if="gatewayMessage" class="settings-status" :class="gatewayOk ? 'ok' : 'error'">
        {{ gatewayMessage }}
      </div>
    </section>

    <!-- EverMemOS card -->
    <section class="settings-card">
      <div class="settings-card-header">
        <h2 class="settings-card-title">EverMemOS</h2>
        <button
          type="button"
          class="btn-icon"
          :disabled="testingEmos"
          :aria-label="t('testConnectionButtonAria')"
          @click="testEmos"
        >
          <ILucidePlug class="w-4 h-4" />
        </button>
      </div>
      <label class="settings-field">
        <span class="settings-field-label">Base URL</span>
        <input
          v-model="baseUrl"
          class="settings-field-input"
          type="text"
          placeholder="https://api.evermind.ai"
          @blur="saveEmos"
        />
      </label>
      <label class="settings-field">
        <span class="settings-field-label">API Key</span>
        <input
          v-model="apiKey"
          class="settings-field-input"
          type="password"
          placeholder="your EverMemOS API key"
          @blur="saveEmos"
        />
      </label>
      <label class="settings-field">
        <span class="settings-field-label">User ID</span>
        <input
          v-model="userId"
          class="settings-field-input"
          type="text"
          placeholder="your user identifier for memory storage"
          @blur="saveEmos"
        />
      </label>
      <div v-if="emosMessage" class="settings-status" :class="emosOk ? 'ok' : 'error'">
        {{ emosMessage }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { NATIVE_HOST } from '@/common/constants';
import {
  getEmosSettings,
  getGatewaySettings,
  setEmosSettings,
  setGatewaySettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  refreshServerStatus as doRefreshServerStatus,
  saveFloatingIcon as doSaveFloatingIcon,
  testEmos as doTestEmos,
  testGateway as doTestGateway,
  loadFloatingIcon,
} from '@/entrypoints/shared/utils/system-settings';
import { getMessage } from '@/utils/i18n';
import { onMounted, ref } from 'vue';
import ILucidePlug from '~icons/lucide/plug';
import ILucideRefreshCw from '~icons/lucide/refresh-cw';

const defaultPort = NATIVE_HOST.DEFAULT_PORT;
const t = (key: string) => getMessage(key);

// Toast state
const toastMessage = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string): void {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
    toastTimer = null;
  }, 2500);
}

// MCP Server state
const mcpServerRunning = ref(false);
const mcpServerPort = ref<number | null>(null);
const refreshing = ref(false);

// Gateway state
const gatewayWsUrl = ref('ws://127.0.0.1:18789');
const gatewayAuthToken = ref('');
const testingGateway = ref(false);
const gatewayOk = ref(true);
const gatewayMessage = ref('');

// EverMemOS state
const baseUrl = ref('https://api.evermind.ai');
const apiKey = ref('');
const userId = ref('');
const testingEmos = ref(false);
const emosOk = ref(true);
const emosMessage = ref('');

// Quick Panel state
const floatingIconEnabled = ref(true);

// Last saved values (to avoid toast when nothing changed)
const lastSavedGateway = ref({ wsUrl: '', authToken: '' });
const lastSavedEmos = ref({ baseUrl: '', apiKey: '', userId: '' });
const lastSavedFloatingIcon = ref(true);

async function refreshServerStatus(): Promise<void> {
  refreshing.value = true;
  try {
    const status = await doRefreshServerStatus();
    mcpServerRunning.value = status.isRunning;
    mcpServerPort.value = status.port;
  } finally {
    refreshing.value = false;
  }
}

async function loadSettings(): Promise<void> {
  const [gw, em, fi] = await Promise.all([
    getGatewaySettings(),
    getEmosSettings(),
    loadFloatingIcon(),
  ]);
  gatewayWsUrl.value = gw.gatewayWsUrl;
  gatewayAuthToken.value = gw.gatewayAuthToken;
  baseUrl.value = em.baseUrl;
  apiKey.value = em.apiKey;
  userId.value = em.userId;
  floatingIconEnabled.value = fi;
  lastSavedGateway.value = { wsUrl: gw.gatewayWsUrl.trim(), authToken: gw.gatewayAuthToken.trim() };
  lastSavedEmos.value = {
    baseUrl: em.baseUrl.trim(),
    apiKey: em.apiKey.trim(),
    userId: em.userId.trim(),
  };
  lastSavedFloatingIcon.value = fi;
}

async function saveGateway(): Promise<void> {
  const wsUrl = gatewayWsUrl.value.trim();
  const authToken = gatewayAuthToken.value.trim();
  if (wsUrl === lastSavedGateway.value.wsUrl && authToken === lastSavedGateway.value.authToken) {
    return;
  }
  await setGatewaySettings({ gatewayWsUrl: wsUrl, gatewayAuthToken: authToken });
  lastSavedGateway.value = { wsUrl, authToken };
  gatewayOk.value = true;
  gatewayMessage.value = '';
  showToast(t('settingsGatewaySavedNotification'));
}

async function saveEmos(): Promise<void> {
  const base = baseUrl.value.trim();
  const key = apiKey.value.trim();
  const user = userId.value.trim();
  if (
    base === lastSavedEmos.value.baseUrl &&
    key === lastSavedEmos.value.apiKey &&
    user === lastSavedEmos.value.userId
  ) {
    return;
  }
  await setEmosSettings({ baseUrl: base, apiKey: key, userId: user });
  lastSavedEmos.value = { baseUrl: base, apiKey: key, userId: user };
  emosOk.value = true;
  emosMessage.value = '';
  showToast(t('settingsEmosSavedNotification'));
}

async function saveFloatingIcon(): Promise<void> {
  const enabled = floatingIconEnabled.value;
  if (enabled === lastSavedFloatingIcon.value) return;
  await doSaveFloatingIcon(enabled);
  lastSavedFloatingIcon.value = enabled;
  showToast(t('settingsQuickPanelSavedNotification'));
}

async function testGateway(): Promise<void> {
  testingGateway.value = true;
  gatewayMessage.value = '';
  try {
    const result = await doTestGateway(gatewayWsUrl.value, gatewayAuthToken.value);
    gatewayOk.value = result.ok;
    gatewayMessage.value = result.message;
  } finally {
    testingGateway.value = false;
  }
}

async function testEmos(): Promise<void> {
  testingEmos.value = true;
  emosMessage.value = '';
  try {
    const result = await doTestEmos(baseUrl.value, apiKey.value, userId.value);
    emosOk.value = result.ok;
    emosMessage.value = result.message;
  } finally {
    testingEmos.value = false;
  }
}

onMounted(() => {
  void loadSettings();
  void refreshServerStatus();
});
</script>

<style scoped>
.system-settings-form {
  display: grid;
  gap: 16px;
  position: relative;
}

.settings-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  background-color: var(--ac-accent);
  color: var(--ac-accent-contrast);
  border: none;
  border-radius: 999px;
  box-shadow:
    0 4px 16px color-mix(in srgb, var(--ac-accent) 40%, transparent),
    0 1px 4px color-mix(in srgb, var(--ac-accent) 20%, transparent);
  z-index: 100;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

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
  font-size: 16px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

.btn-icon {
  width: 32px;
  height: 32px;
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

.settings-muted {
  color: var(--ac-text-muted);
}

.settings-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.settings-field-label {
  color: var(--ac-text-muted);
  font-weight: 500;
}

.settings-field-input {
  padding: 9px 12px;
  font-size: 13px;
  outline: none;
  border: none;
  background-color: var(--ac-surface-muted);
  border-radius: var(--ac-radius-inner);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}

.settings-field-input::placeholder {
  color: var(--ac-text-placeholder);
}

.settings-field-input:focus {
  background-color: var(--ac-hover-bg);
}

.settings-status {
  margin: 0;
  font-size: 12px;
  padding: 10px 12px;
  border-radius: var(--ac-radius-inner);
}

.settings-status.ok {
  background-color: var(--ac-diff-add-bg);
  color: var(--ac-success);
  border: var(--ac-border-width) solid var(--ac-diff-add-border);
}

.settings-status.error {
  background-color: var(--ac-diff-del-bg);
  color: var(--ac-danger);
  border: var(--ac-border-width) solid var(--ac-diff-del-border);
}

.settings-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ac-text);
  cursor: pointer;
}

.settings-checkbox input {
  width: 16px;
  height: 16px;
  accent-color: var(--ac-accent);
}
</style>
