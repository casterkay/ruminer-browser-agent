<template>
  <div class="options-page">
    <header class="options-header">
      <h1>System Settings</h1>
      <p>Configure OpenClaw Gateway and EverMemOS API.</p>
    </header>

    <section class="card">
      <h2>OpenClaw Gateway</h2>
      <label>
        Gateway WS URL
        <input v-model="gateway.gatewayWsUrl" type="text" placeholder="ws://127.0.0.1:18789" />
      </label>
      <label>
        Auth Token
        <input v-model="gateway.gatewayAuthToken" type="password" placeholder="gateway token" />
      </label>
      <div class="row">
        <button class="primary" @click="saveGateway">Save</button>
        <button class="secondary" @click="testGateway" :disabled="testingGateway">
          {{ testingGateway ? 'Testing...' : 'Test Connection' }}
        </button>
      </div>
      <p class="status" :class="gatewayStatus.ok ? 'ok' : 'error'" v-if="gatewayStatus.message">
        {{ gatewayStatus.message }}
      </p>
    </section>

    <section class="card">
      <h2>EverMemOS</h2>
      <label>
        Base URL
        <input v-model="emos.baseUrl" type="text" placeholder="http://127.0.0.1:1995" />
      </label>
      <label>
        API Key
        <input v-model="emos.apiKey" type="password" placeholder="emos api key" />
      </label>
      <div class="grid-two">
        <label>
          Tenant ID (optional)
          <input v-model="emos.tenantId" type="text" placeholder="tenant" />
        </label>
        <label>
          Space ID (optional)
          <input v-model="emos.spaceId" type="text" placeholder="space" />
        </label>
      </div>
      <div class="row">
        <button class="primary" @click="saveEmos">Save</button>
        <button class="secondary" @click="testEmos" :disabled="testingEmos">
          {{ testingEmos ? 'Testing...' : 'Test Connection' }}
        </button>
      </div>
      <p class="status" :class="emosStatus.ok ? 'ok' : 'error'" v-if="emosStatus.message">
        {{ emosStatus.message }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
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
import {
  getToolGroupState,
  setToolGroupEnabled,
  type ToolGroupId,
} from '@/entrypoints/shared/utils/tool-groups';

const gateway = reactive({
  gatewayWsUrl: 'ws://127.0.0.1:18789',
  gatewayAuthToken: '',
});

const emos = reactive({
  baseUrl: 'http://127.0.0.1:1995',
  apiKey: '',
  tenantId: '',
  spaceId: '',
});

const toolGroups = reactive({
  observe: true,
  navigate: true,
  interact: false,
  execute: false,
  workflow: true,
});

const testingGateway = ref(false);
const testingEmos = ref(false);

const gatewayStatus = reactive({ ok: true, message: '' });
const emosStatus = reactive({ ok: true, message: '' });

const groupItems = computed(() => [
  { id: 'observe' as ToolGroupId, label: 'Observe', enabled: toolGroups.observe },
  { id: 'navigate' as ToolGroupId, label: 'Navigate', enabled: toolGroups.navigate },
  { id: 'interact' as ToolGroupId, label: 'Interact', enabled: toolGroups.interact },
  { id: 'execute' as ToolGroupId, label: 'Execute', enabled: toolGroups.execute },
  { id: 'workflow' as ToolGroupId, label: 'Workflow', enabled: toolGroups.workflow },
]);

async function loadSettings(): Promise<void> {
  const gatewaySettings = await getGatewaySettings();
  gateway.gatewayWsUrl = gatewaySettings.gatewayWsUrl;
  gateway.gatewayAuthToken = gatewaySettings.gatewayAuthToken;

  const emosSettings = await getEmosSettings();
  emos.baseUrl = emosSettings.baseUrl;
  emos.apiKey = emosSettings.apiKey;
  emos.tenantId = emosSettings.tenantId || '';
  emos.spaceId = emosSettings.spaceId || '';

  const groups = await getToolGroupState();
  toolGroups.observe = groups.observe;
  toolGroups.navigate = groups.navigate;
  toolGroups.interact = groups.interact;
  toolGroups.execute = groups.execute;
  toolGroups.workflow = groups.workflow;
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
    tenantId: emos.tenantId.trim() || null,
    spaceId: emos.spaceId.trim() || null,
  });
  emosStatus.ok = true;
  emosStatus.message = 'EMOS settings saved.';
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

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${emos.apiKey.trim()}`,
    };
    if (emos.tenantId.trim()) headers['X-Tenant-Id'] = emos.tenantId.trim();
    if (emos.spaceId.trim()) headers['X-Space-Id'] = emos.spaceId.trim();

    const response = await fetch(
      `${emos.baseUrl.trim().replace(/\/$/, '')}/api/v1/memories/search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: 'ping', limit: 1 }),
      },
    );

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`EMOS test failed (${response.status}): ${payload}`);
    }

    emosStatus.ok = true;
    emosStatus.message = 'EMOS connection test passed.';
  } catch (reason) {
    emosStatus.ok = false;
    emosStatus.message = reason instanceof Error ? reason.message : String(reason);
  } finally {
    testingEmos.value = false;
  }
}

async function setGroup(groupId: ToolGroupId, enabled: boolean): Promise<void> {
  const next = await setToolGroupEnabled(groupId, enabled);
  toolGroups.observe = next.observe;
  toolGroups.navigate = next.navigate;
  toolGroups.interact = next.interact;
  toolGroups.execute = next.execute;
  toolGroups.workflow = next.workflow;
}

onMounted(() => {
  void loadSettings();
});
</script>

<style scoped>
.options-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 20px;
  display: grid;
  gap: 14px;
  color: #0f172a;
  background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
}

.options-header h1 {
  margin: 0;
  font-size: 26px;
}

.options-header p {
  margin: 4px 0 0;
  color: #475569;
}

.card {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.card h2 {
  margin: 0;
  font-size: 16px;
}

label {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: #334155;
}

input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  color: #0f172a;
}

.grid-two {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.row {
  display: flex;
  gap: 8px;
}

.primary,
.secondary {
  border-radius: 8px;
  padding: 8px 12px;
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

.status {
  margin: 0;
  font-size: 12px;
  padding: 8px;
  border-radius: 8px;
}

.status.ok {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.status.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.group-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

@media (max-width: 760px) {
  .grid-two {
    grid-template-columns: 1fr;
  }
}
</style>
