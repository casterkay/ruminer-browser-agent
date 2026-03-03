<template>
  <div class="agent-theme options-page" :data-agent-theme="theme.theme.value">
    <header class="options-header">
      <h1 class="options-title">System Settings</h1>
    </header>

    <section class="card" :style="cardStyle">
      <h2 class="card-title">OpenClaw Gateway</h2>
      <label class="field">
        <span class="field-label">Gateway WS URL</span>
        <input
          v-model="gateway.gatewayWsUrl"
          type="text"
          placeholder="ws://127.0.0.1:18789"
          class="field-input"
          :style="inputStyle"
        />
      </label>
      <label class="field">
        <span class="field-label">Auth Token (optional on localhost)</span>
        <input
          v-model="gateway.gatewayAuthToken"
          type="password"
          placeholder="gateway token"
          class="field-input"
          :style="inputStyle"
        />
      </label>
      <div class="row">
        <button class="btn-primary ac-focus-ring" :style="primaryBtnStyle" @click="saveGateway">
          Save
        </button>
        <button
          class="btn-secondary ac-focus-ring"
          :style="secondaryBtnStyle"
          :disabled="testingGateway"
          @click="testGateway"
        >
          {{ testingGateway ? 'Testing...' : 'Test Connection' }}
        </button>
      </div>
      <div
        v-if="gatewayStatus.message"
        class="status-banner"
        :class="gatewayStatus.ok ? 'status-ok' : 'status-error'"
      >
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            v-if="gatewayStatus.ok"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
          <path
            v-else
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {{ gatewayStatus.message }}
      </div>
    </section>

    <section class="card" :style="cardStyle">
      <h2 class="card-title">EverMemOS</h2>
      <label class="field">
        <span class="field-label">Base URL</span>
        <input
          v-model="emos.baseUrl"
          type="text"
          placeholder="https://api.evermind.ai"
          class="field-input"
          :style="inputStyle"
        />
      </label>
      <label class="field">
        <span class="field-label">API Key</span>
        <input
          v-model="emos.apiKey"
          type="password"
          placeholder="your EverMemOS API key"
          class="field-input"
          :style="inputStyle"
        />
      </label>
      <label class="field">
        <span class="field-label">User ID</span>
        <input
          v-model="emos.userId"
          type="text"
          placeholder="your user identifier for memory storage"
          class="field-input"
          :style="inputStyle"
        />
      </label>
      <div class="row">
        <button class="btn-primary ac-focus-ring" :style="primaryBtnStyle" @click="saveEmos">
          Save
        </button>
        <button
          class="btn-secondary ac-focus-ring"
          :style="secondaryBtnStyle"
          :disabled="testingEmos"
          @click="testEmos"
        >
          {{ testingEmos ? 'Testing...' : 'Test Connection' }}
        </button>
      </div>
      <div
        v-if="emosStatus.message"
        class="status-banner"
        :class="emosStatus.ok ? 'status-ok' : 'status-error'"
      >
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            v-if="emosStatus.ok"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
          <path
            v-else
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        {{ emosStatus.message }}
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  getGatewaySettings,
  getEmosSettings,
  setGatewaySettings,
  setEmosSettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  buildSignedConnectParams,
  extractConnectChallengeNonce,
  OPENCLAW_CLIENT_IDS,
  OPENCLAW_CLIENT_MODES,
} from '@/entrypoints/shared/utils/openclaw-device-auth';
import { useAgentTheme } from '../sidepanel/composables/useAgentTheme';

const theme = useAgentTheme();

const gateway = reactive({
  gatewayWsUrl: 'ws://127.0.0.1:18789',
  gatewayAuthToken: '',
});

const emos = reactive({
  baseUrl: 'https://api.evermind.ai',
  apiKey: '',
  userId: '',
});

const testingGateway = ref(false);
const testingEmos = ref(false);

const gatewayStatus = reactive({ ok: true, message: '' });
const emosStatus = reactive({ ok: true, message: '' });

// ---- Styles ----

const cardStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-card)',
  boxShadow: 'var(--ac-shadow-card)',
}));

const inputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  borderRadius: 'var(--ac-radius-inner)',
  color: 'var(--ac-text)',
  fontFamily: 'var(--ac-font-body)',
  border: 'none',
}));

const primaryBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent)',
  color: 'var(--ac-accent-contrast)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'none',
}));

const secondaryBtnStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  borderRadius: 'var(--ac-radius-button)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
}));

// ---- Settings Logic ----

async function loadSettings(): Promise<void> {
  const gatewaySettings = await getGatewaySettings();
  gateway.gatewayWsUrl = gatewaySettings.gatewayWsUrl;
  gateway.gatewayAuthToken = gatewaySettings.gatewayAuthToken;

  const emosSettings = await getEmosSettings();
  emos.baseUrl = emosSettings.baseUrl;
  emos.apiKey = emosSettings.apiKey;
  emos.userId = emosSettings.userId;
}

async function saveGateway(): Promise<void> {
  await setGatewaySettings({
    gatewayWsUrl: gateway.gatewayWsUrl.trim(),
    gatewayAuthToken: gateway.gatewayAuthToken.trim(),
  });
  gatewayStatus.ok = true;
  gatewayStatus.message = 'Gateway settings saved.';
}

async function saveEmos(): Promise<void> {
  await setEmosSettings({
    baseUrl: emos.baseUrl.trim(),
    apiKey: emos.apiKey.trim(),
    userId: emos.userId.trim(),
  });
  emosStatus.ok = true;
  emosStatus.message = 'EverMemOS settings saved.';
}

async function testGateway(): Promise<void> {
  testingGateway.value = true;
  gatewayStatus.message = '';

  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(gateway.gatewayWsUrl.trim());
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Gateway test timeout'));
      }, 10_000);
      const challengeTimer = setTimeout(() => {
        if (!connectSent) {
          void sendConnect(null).catch(reject);
        }
      }, 6_000);
      let connectSent = false;

      async function sendConnect(challengeNonce: string | null): Promise<void> {
        if (connectSent) {
          return;
        }
        connectSent = true;
        const params = await buildSignedConnectParams({
          role: 'operator',
          authToken: gateway.gatewayAuthToken.trim(),
          client: {
            id: OPENCLAW_CLIENT_IDS.CONTROL_UI,
            version: chrome.runtime.getManifest().version || '0.1.0',
            platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
            mode: OPENCLAW_CLIENT_MODES.WEBCHAT,
          },
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ruminer-options',
          nonce: challengeNonce,
        });

        ws.send(
          JSON.stringify({
            type: 'req',
            id: crypto.randomUUID(),
            method: 'connect',
            params,
          }),
        );
      }

      ws.onopen = () => {
        // Wait for connect.challenge; fallback timer sends connect if challenge is absent.
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(String(event.data));
          const challengeNonce = extractConnectChallengeNonce(String(event.data));
          if (challengeNonce !== undefined) {
            clearTimeout(challengeTimer);
            void sendConnect(challengeNonce || null).catch(reject);
            return;
          }

          if (frame?.type === 'res' && frame?.ok === true) {
            clearTimeout(timer);
            clearTimeout(challengeTimer);
            ws.close();
            resolve();
          } else if (frame?.type === 'res' && frame?.ok === false) {
            clearTimeout(timer);
            clearTimeout(challengeTimer);
            ws.close();
            reject(new Error(String(frame?.payload || 'Gateway rejected connection')));
          }
        } catch (error) {
          clearTimeout(timer);
          clearTimeout(challengeTimer);
          ws.close();
          reject(error);
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        clearTimeout(challengeTimer);
        ws.close();
        reject(new Error('Gateway socket error'));
      };
    });

    gatewayStatus.ok = true;
    gatewayStatus.message = 'Gateway connection test passed.';
  } catch (reason) {
    gatewayStatus.ok = false;
    gatewayStatus.message = reason instanceof Error ? reason.message : String(reason);
  } finally {
    testingGateway.value = false;
  }
}

async function testEmos(): Promise<void> {
  testingEmos.value = true;
  emosStatus.message = '';

  const baseUrl = emos.baseUrl.trim().replace(/\/$/, '');
  const apiKey = emos.apiKey.trim();
  const userId = emos.userId.trim();

  if (!userId) {
    emosStatus.ok = false;
    emosStatus.message = 'User ID is required for EverMemOS connection.';
    testingEmos.value = false;
    return;
  }

  // Use GET with query params for cloud API - user_id is required
  const endpoint = `${baseUrl}/api/v0/memories/search?query=ping&user_id=${encodeURIComponent(userId)}&limit=1`;

  console.log('[EMOS Test] Base URL:', baseUrl);
  console.log('[EMOS Test] Endpoint:', endpoint);
  console.log('[EMOS Test] User ID:', userId);
  console.log(
    '[EMOS Test] API Key (first 8 chars):',
    apiKey ? `${apiKey.slice(0, 8)}...` : '(empty)',
  );

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };

    console.log('[EMOS Test] Using GET method');

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    console.log('[EMOS Test] Response status:', response.status);
    console.log('[EMOS Test] Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('[EMOS Test] Response body:', responseText);

    if (!response.ok) {
      throw new Error(`EverMemOS test failed (${response.status}): ${responseText}`);
    }

    emosStatus.ok = true;
    emosStatus.message = 'EverMemOS connection test passed.';
  } catch (reason) {
    console.error('[EMOS Test] Error:', reason);
    emosStatus.ok = false;
    const debugInfo = `Endpoint: ${endpoint}`;
    emosStatus.message =
      reason instanceof Error
        ? `${reason.message}\n\n${debugInfo}`
        : `${String(reason)}\n\n${debugInfo}`;
  } finally {
    testingEmos.value = false;
  }
}

onMounted(async () => {
  await theme.initTheme();
  await loadSettings();
});

// Auto-save settings when they change
watch(
  () => emos.baseUrl,
  async () => {
    await saveEmos();
  },
);

watch(
  () => emos.apiKey,
  async () => {
    await saveEmos();
  },
);

watch(
  () => emos.userId,
  async () => {
    await saveEmos();
  },
);

watch(
  () => gateway.gatewayWsUrl,
  async () => {
    await saveGateway();
  },
);

watch(
  () => gateway.gatewayAuthToken,
  async () => {
    await saveGateway();
  },
);
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

.options-subtitle {
  margin: 4px 0 0;
  color: var(--ac-text-muted);
  font-size: 14px;
}

/* Cards */
.card {
  padding: 16px;
  display: grid;
  gap: 12px;
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}

/* Fields */
.field {
  display: grid;
  gap: 4px;
  font-size: 12px;
}

.field-label {
  color: var(--ac-text-muted);
  font-weight: 500;
}

.field-input {
  padding: 9px 12px;
  font-size: 13px;
  outline: none;
  transition: background-color var(--ac-motion-fast);
}

.field-input::placeholder {
  color: var(--ac-text-placeholder);
}

.field-input:focus {
  background-color: var(--ac-hover-bg);
}

.grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.row {
  display: flex;
  gap: 8px;
}

/* Buttons */
.btn-primary,
.btn-secondary {
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--ac-font-body);
  transition:
    background-color var(--ac-motion-fast),
    transform var(--ac-motion-fast),
    box-shadow var(--ac-motion-fast);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: var(--ac-shadow-float);
}

.btn-secondary:hover {
  background-color: var(--ac-hover-bg);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* Status Banners */
.status-banner {
  margin: 0;
  font-size: 12px;
  padding: 10px 12px;
  border-radius: var(--ac-radius-inner);
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.status-ok {
  background-color: var(--ac-diff-add-bg);
  color: var(--ac-success);
  border: var(--ac-border-width) solid var(--ac-diff-add-border);
}

.status-error {
  background-color: var(--ac-diff-del-bg);
  color: var(--ac-danger);
  border: var(--ac-border-width) solid var(--ac-diff-del-border);
}

@media (max-width: 760px) {
  .grid-two {
    grid-template-columns: 1fr;
  }
}
</style>
