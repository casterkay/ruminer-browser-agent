<script setup lang="ts">
import { LINKS } from '@/common/constants';
import { computed, onMounted, ref } from 'vue';

import {
  getEmosSettings,
  getGatewaySettings,
  setEmosSettings,
  setGatewaySettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  testEmos as doTestEmos,
  testGateway as doTestGateway,
} from '@/entrypoints/shared/utils/system-settings';
import ILucideCopy from '~icons/lucide/copy';
import ILucideExternalLink from '~icons/lucide/external-link';
import ILucidePlug from '~icons/lucide/plug';
import '../sidepanel/styles/agent-chat.css';

const COMMANDS = {
  installerBase:
    'curl -fsSL https://raw.githubusercontent.com/casterkay/ruminer-browser-agent/refs/heads/main/scripts/setup.sh | bash -s --',
} as const;

type CopyKey = 'setup' | 'extensionId';
const copiedKey = ref<CopyKey | null>(null);
const extensionId = computed(() => chrome.runtime.id);

const setupCommand = computed(() => {
  return `${COMMANDS.installerBase} --extension-id ${extensionId.value}`;
});

async function copyText(key: CopyKey, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    window.setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 2000);
  } catch (error) {
    console.error('Failed to copy command', error);
  }
}

function copyLabel(key: CopyKey): string {
  return copiedKey.value === key ? 'Copied' : 'Copy';
}

async function openDocs(): Promise<void> {
  try {
    await chrome.tabs.create({ url: LINKS.TROUBLESHOOTING });
  } catch {
    window.open(LINKS.TROUBLESHOOTING, '_blank', 'noopener,noreferrer');
  }
}

const gatewayWsUrl = ref('ws://127.0.0.1:18789');
const gatewayAuthToken = ref('');
const gatewayTesting = ref(false);
const gatewayOk = ref<boolean | null>(null);
const gatewayMessage = ref('');

const emosBaseUrl = ref('https://api.evermind.ai');
const emosApiKey = ref('');
const emosTesting = ref(false);
const emosOk = ref<boolean | null>(null);
const emosMessage = ref('');

async function loadSettings(): Promise<void> {
  const gateway = await getGatewaySettings();
  gatewayWsUrl.value = gateway.gatewayWsUrl;
  gatewayAuthToken.value = gateway.gatewayAuthToken;

  const emos = await getEmosSettings();
  emosBaseUrl.value = emos.baseUrl;
  emosApiKey.value = emos.apiKey;
}

async function saveGateway(): Promise<void> {
  await setGatewaySettings({
    gatewayWsUrl: gatewayWsUrl.value,
    gatewayAuthToken: gatewayAuthToken.value,
  });
}

async function saveEmos(): Promise<void> {
  await setEmosSettings({
    baseUrl: emosBaseUrl.value,
    apiKey: emosApiKey.value,
  });
}

async function testGateway(): Promise<void> {
  gatewayTesting.value = true;
  gatewayMessage.value = '';
  gatewayOk.value = null;
  try {
    await saveGateway();
    const result = await doTestGateway(gatewayWsUrl.value, gatewayAuthToken.value);
    gatewayOk.value = result.ok;
    gatewayMessage.value = result.message;
  } finally {
    gatewayTesting.value = false;
  }
}

async function testEmos(): Promise<void> {
  emosTesting.value = true;
  emosMessage.value = '';
  emosOk.value = null;
  try {
    await saveEmos();
    const result = await doTestEmos(emosBaseUrl.value, emosApiKey.value);
    emosOk.value = result.ok;
    emosMessage.value = result.message;
  } finally {
    emosTesting.value = false;
  }
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <div class="agent-theme welcome-root" data-agent-theme="warm-editorial">
    <div class="welcome-container ac-scroll">
      <header class="welcome-header">
        <div class="welcome-badge">Chrome MCP • EverMemOS • OpenClaw • Claude Code • Codex</div>
        <h1 class="welcome-title">Ruminer Browser Agent</h1>
        <p class="welcome-subtitle">
          One browser, one memory, many agents. This page helps you wire up the native host and MCP
          clients so your CLI agents can control Chrome.
        </p>
      </header>

      <main class="welcome-main">
        <section class="welcome-card">
          <div class="welcome-card-title">1) Copy & run one command</div>
          <div class="welcome-card-subtitle">
            This installs/registers the native host, adds the MCP endpoint to Claude Code and Codex,
            and installs the OpenClaw plugin (<span class="mono">openclaw-mcp-client</span>).
          </div>

          <div class="code-row">
            <code class="code">{{ setupCommand }}</code>
            <button class="btn" @click="copyText('setup', setupCommand)">
              <ILucideCopy class="icon" />
              {{ copyLabel('setup') }}
            </button>
          </div>

          <div class="note">
            Tip: you can review the script in your browser first. (Piping scripts into
            <span class="mono">bash</span> is powerful—treat it with care.)
          </div>
        </section>

        <section class="welcome-card">
          <div class="welcome-card-title">2) Your extension ID (already embedded)</div>
          <div class="welcome-card-subtitle">
            The native host must explicitly allow this extension ID for Native Messaging.
          </div>

          <div class="code-row">
            <code class="code">{{ extensionId }}</code>
            <button class="btn" @click="copyText('extensionId', extensionId)">
              <ILucideCopy class="icon" />
              {{ copyLabel('extensionId') }}
            </button>
          </div>
        </section>

        <section class="welcome-grid">
          <div class="welcome-card">
            <div class="settings-header">
              <div>
                <div class="welcome-card-title">3) OpenClaw Gateway</div>
                <div class="welcome-card-subtitle">Used by the sidepanel chat.</div>
              </div>
              <button class="btn" :disabled="gatewayTesting" @click="testGateway">
                <ILucidePlug class="icon" />
                {{ gatewayTesting ? 'Testing…' : 'Test' }}
              </button>
            </div>

            <label class="field">
              <span class="label">Gateway WS URL</span>
              <input v-model="gatewayWsUrl" class="input" type="text" @blur="saveGateway" />
            </label>
            <label class="field">
              <span class="label">Auth token</span>
              <input
                v-model="gatewayAuthToken"
                class="input"
                type="password"
                autocomplete="off"
                @blur="saveGateway"
              />
            </label>

            <div v-if="gatewayMessage" class="status" :class="gatewayOk ? 'ok' : 'error'">
              {{ gatewayMessage }}
            </div>
          </div>

          <div class="welcome-card">
            <div class="settings-header">
              <div>
                <div class="welcome-card-title">4) EverMemOS</div>
                <div class="welcome-card-subtitle">Used by Memory + ingestion workflows.</div>
              </div>
              <button class="btn" :disabled="emosTesting" @click="testEmos">
                <ILucidePlug class="icon" />
                {{ emosTesting ? 'Testing…' : 'Test' }}
              </button>
            </div>

            <label class="field">
              <span class="label">Base URL</span>
              <input v-model="emosBaseUrl" class="input" type="text" @blur="saveEmos" />
            </label>
            <label class="field">
              <span class="label">API key</span>
              <input
                v-model="emosApiKey"
                class="input"
                type="password"
                autocomplete="off"
                @blur="saveEmos"
              />
            </label>

            <div v-if="emosMessage" class="status" :class="emosOk ? 'ok' : 'error'">
              {{ emosMessage }}
            </div>
          </div>
        </section>

        <section class="welcome-card">
          <div class="welcome-card-title">Checklist</div>
          <ol class="checklist">
            <li>Run the one-liner installer.</li>
            <li
              >Open Claude Code / Codex and confirm you see the MCP server
              <span class="mono">ruminer-chrome</span>.</li
            >
            <li>Ask your agent to call <span class="mono">get_windows_and_tabs</span>.</li>
          </ol>
        </section>

        <footer class="welcome-footer">
          <button class="link-btn" @click="openDocs">
            Troubleshooting <ILucideExternalLink class="icon" />
          </button>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.welcome-root {
  min-height: 100vh;
}

.welcome-container {
  max-width: 920px;
  margin: 0 auto;
  padding: 40px 20px 56px;
}

.welcome-header {
  display: grid;
  gap: 10px;
  padding-bottom: 22px;
  border-bottom: var(--ac-border-width) solid var(--ac-border);
}

.welcome-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--ac-surface-muted);
  border: var(--ac-border-width) solid var(--ac-border);
  color: var(--ac-text-muted);
  font-size: 12px;
}

.welcome-title {
  margin: 0;
  font-family: var(--ac-font-heading);
  font-size: 34px;
  letter-spacing: -0.02em;
  color: var(--ac-text);
}

.welcome-subtitle {
  margin: 0;
  max-width: 66ch;
  color: var(--ac-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.welcome-main {
  display: grid;
  gap: 16px;
  padding-top: 18px;
}

.welcome-grid {
  display: grid;
  gap: 16px;
}

@media (min-width: 860px) {
  .welcome-grid {
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
}

.welcome-card {
  background: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  box-shadow: var(--ac-shadow-card);
  padding: 16px;
  display: grid;
  gap: 10px;
}

.welcome-card-title {
  font-family: var(--ac-font-heading);
  font-weight: 600;
  color: var(--ac-text);
  font-size: 16px;
}

.welcome-card-subtitle {
  color: var(--ac-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.code-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.code {
  flex: 1;
  font-family: var(--ac-font-code);
  font-size: 12px;
  line-height: 1.5;
  background: var(--ac-code-bg);
  border: var(--ac-border-width) solid var(--ac-code-border);
  border-radius: var(--ac-radius-inner);
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ac-code-text);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--ac-radius-button);
  border: var(--ac-border-width) solid var(--ac-border);
  background: var(--ac-surface-muted);
  color: var(--ac-text);
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color var(--ac-motion-fast),
    border-color var(--ac-motion-fast);
  user-select: none;
}

.btn:hover:not(:disabled) {
  background: var(--ac-hover-bg);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.icon {
  width: 14px;
  height: 14px;
}

.mono {
  font-family: var(--ac-font-code);
}

.note {
  color: var(--ac-text-subtle);
  font-size: 12px;
  line-height: 1.6;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.field {
  display: grid;
  gap: 6px;
}

.label {
  color: var(--ac-text-muted);
  font-size: 12px;
  font-weight: 500;
}

.input {
  padding: 9px 12px;
  border-radius: var(--ac-radius-inner);
  border: var(--ac-border-width) solid var(--ac-border);
  background: var(--ac-surface-muted);
  color: var(--ac-text);
  font-size: 13px;
  outline: none;
  font-family: var(--ac-font-body);
}

.input:focus {
  background: var(--ac-hover-bg);
  box-shadow: 0 0 0 2px var(--ac-focus-ring);
}

.status {
  font-size: 12px;
  padding: 10px 12px;
  border-radius: var(--ac-radius-inner);
  border: var(--ac-border-width) solid var(--ac-border);
}

.status.ok {
  background: var(--ac-diff-add-bg);
  color: var(--ac-success);
  border-color: var(--ac-diff-add-border);
}

.status.error {
  background: var(--ac-diff-del-bg);
  color: var(--ac-danger);
  border-color: var(--ac-diff-del-border);
}

.checklist {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  color: var(--ac-text);
  font-size: 13px;
  line-height: 1.6;
}

.welcome-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--ac-link);
  cursor: pointer;
  font-size: 13px;
  padding: 8px 0;
}

.link-btn:hover {
  color: var(--ac-link-hover);
}
</style>
