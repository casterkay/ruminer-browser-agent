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
        <h2 class="settings-card-title">{{ t('settingsCardMcpServerTitle') }}</h2>
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
        <span class="settings-label">{{ t('statusLabel') }}</span>
        <span class="settings-value" :class="mcpServerRunning ? 'ok' : 'warn'">
          {{ mcpServerRunning ? t('settingsStatusRunning') : t('settingsStatusStopped') }}
        </span>
      </div>
      <div v-if="mcpServerPort != null" class="settings-row">
        <span class="settings-label">{{ t('settingsPortLabel') }}</span>
        <span class="settings-value">{{ mcpServerPort }}</span>
      </div>
      <div v-else class="settings-row">
        <span class="settings-label">{{ t('settingsPortLabel') }}</span>
        <span class="settings-value settings-muted">{{ defaultPort }}</span>
      </div>
    </section>

    <!-- Quick Panel card -->
    <section class="settings-card">
      <h2 class="settings-card-title">{{ t('settingsCardQuickChatTitle') }}</h2>
      <label class="settings-checkbox">
        <input v-model="floatingIconEnabled" type="checkbox" @change="saveFloatingIcon" />
        <span>{{ t('settingsQuickChatShowInPageButtonLabel') }}</span>
      </label>
      <div class="settings-field">
        <span class="settings-field-label">{{ t('settingsQuickChatFloatingIconSizeLabel') }}</span>
        <div style="display: flex; gap: 8px; align-items: center">
          <input
            type="range"
            :min="FLOATING_ICON_SIZE_MIN"
            :max="FLOATING_ICON_SIZE_MAX"
            v-model.number="floatingIconSize"
            @change="saveFloatingIconSize"
            style="flex: 1"
          />
          <input
            type="number"
            :min="FLOATING_ICON_SIZE_MIN"
            :max="FLOATING_ICON_SIZE_MAX"
            v-model.number="floatingIconSize"
            @blur="saveFloatingIconSize"
            class="settings-field-input"
            style="width: 84px"
          />
        </div>
      </div>
    </section>

    <!-- OpenClaw Gateway card -->
    <section class="settings-card">
      <div class="settings-card-header">
        <h2 class="settings-card-title">{{ t('settingsCardGatewayTitle') }}</h2>
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
        <span class="settings-field-label">{{ t('settingsFieldGatewayWsUrlLabel') }}</span>
        <input
          v-model="gatewayWsUrl"
          class="settings-field-input"
          type="text"
          :placeholder="t('settingsPlaceholderGatewayWsUrl')"
          @blur="saveGateway"
        />
      </label>
      <label class="settings-field">
        <span class="settings-field-label">{{ t('settingsFieldAuthTokenLabel') }}</span>
        <input
          v-model="gatewayAuthToken"
          class="settings-field-input"
          type="password"
          :placeholder="t('settingsPlaceholderGatewayAuthToken')"
          @blur="saveGateway"
        />
      </label>
      <div v-if="gatewayMessage" class="settings-status" :class="gatewayOk ? 'ok' : 'error'">
        {{ gatewayMessage }}
      </div>
    </section>

    <!-- Memory card -->
    <section class="settings-card">
      <div class="settings-card-header">
        <h2 class="settings-card-title">{{ t('settingsCardMemoryTitle') }}</h2>
        <button
          type="button"
          class="btn-icon"
          :disabled="testingMemory"
          :aria-label="t('testConnectionButtonAria')"
          @click="testMemory"
        >
          <ILucidePlug class="w-4 h-4" />
        </button>
      </div>
      <label class="settings-field">
        <span class="settings-field-label">{{ t('settingsFieldBackendLabel') }}</span>
        <select v-model="memoryBackend" class="settings-field-input" @change="() => saveMemory()">
          <option value="local_markdown_qmd">{{
            t('settingsBackendLocalFileSystemOption')
          }}</option>
          <option value="evermemos">{{ t('settingsBackendEvermemosOption') }}</option>
        </select>
      </label>

      <template v-if="memoryBackend === 'local_markdown_qmd'">
        <label class="settings-field">
          <span class="settings-field-label">{{ t('settingsFieldDirectoryPathLabel') }}</span>
          <input
            v-model="memoryLocalRootPath"
            class="settings-field-input"
            type="text"
            :placeholder="t('settingsPlaceholderMemoryLocalRootPath')"
            @blur="() => saveMemory()"
          />
        </label>
      </template>

      <template v-else>
        <div class="settings-value settings-muted">
          {{ t('settingsMemoryLegacyNotice') }}
        </div>
        <label class="settings-field">
          <span class="settings-field-label">{{ t('settingsFieldBaseUrlLabel') }}</span>
          <input
            v-model="baseUrl"
            class="settings-field-input"
            type="text"
            :placeholder="t('settingsPlaceholderEvermemosBaseUrl')"
            @blur="() => saveEmosCredentials()"
          />
        </label>
        <label class="settings-field">
          <span class="settings-field-label">{{ t('settingsFieldApiKeyLabel') }}</span>
          <input
            v-model="apiKey"
            class="settings-field-input"
            type="password"
            :placeholder="t('settingsPlaceholderEvermemosApiKey')"
            @blur="() => saveEmosCredentials()"
          />
        </label>
      </template>

      <div v-if="memoryMessage" class="settings-status" :class="memoryOk ? 'ok' : 'error'">
        {{ memoryMessage }}
      </div>
    </section>

    <!-- Language card -->
    <section class="settings-card">
      <h2 class="settings-card-title">{{ t('settingsCardLanguageTitle') }}</h2>
      <label class="settings-field">
        <span class="settings-field-label">{{ t('languageSelectorLabel') }}</span>
        <select v-model="uiLanguage" class="settings-field-input" @change="saveUiLanguage">
          <option value="auto">{{ t('settingsLanguageOptionAuto') }}</option>
          <option value="en">{{ t('settingsLanguageOptionEnglish') }}</option>
          <option value="de">{{ t('settingsLanguageOptionGerman') }}</option>
          <option value="ja">{{ t('settingsLanguageOptionJapanese') }}</option>
          <option value="ko">{{ t('settingsLanguageOptionKorean') }}</option>
          <option value="zh_CN">{{ t('settingsLanguageOptionSimplifiedChinese') }}</option>
          <option value="zh_TW">{{ t('settingsLanguageOptionTraditionalChinese') }}</option>
        </select>
      </label>
      <div class="settings-value settings-muted">
        {{ t('settingsLanguageHint') }}
      </div>
    </section>

    <!-- Claude Code card -->
    <section class="settings-card">
      <h2 class="settings-card-title">{{ t('settingsCardClaudeCodeTitle') }}</h2>
      <label class="settings-field">
        <span class="settings-field-label">{{ t('settingsFieldBaseUrlLabel') }}</span>
        <input
          v-model="anthropicBaseUrl"
          class="settings-field-input"
          type="text"
          :placeholder="t('settingsPlaceholderAnthropicBaseUrl')"
          @blur="saveAnthropic"
        />
      </label>
      <label class="settings-field">
        <span class="settings-field-label">{{ t('settingsFieldApiKeyLabel') }}</span>
        <input
          v-model="anthropicAuthToken"
          class="settings-field-input"
          type="password"
          :placeholder="t('settingsPlaceholderAnthropicApiKey')"
          @blur="saveAnthropic"
        />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { NATIVE_HOST } from '@/common/constants';
import {
  getAnthropicSettings,
  setAnthropicSettings,
} from '@/entrypoints/shared/utils/anthropic-settings';
import {
  getUiLanguage,
  setUiLanguage,
  type UiLanguage,
} from '@/entrypoints/shared/utils/language-settings';
import {
  getEmosSettings,
  getGatewaySettings,
  getMemorySettings,
  setEmosSettings,
  setGatewaySettings,
  setMemorySettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  loadFloatingIconSize as doLoadFloatingIconSize,
  refreshServerStatus as doRefreshServerStatus,
  saveFloatingIcon as doSaveFloatingIcon,
  saveFloatingIconSize as doSaveFloatingIconSize,
  testGateway as doTestGateway,
  testMemoryBackend as doTestMemoryBackend,
  FLOATING_ICON_SIZE_MAX,
  FLOATING_ICON_SIZE_MIN,
  loadFloatingIcon,
} from '@/entrypoints/shared/utils/system-settings';
import { getMessage } from '@/utils/i18n';
import type { MemoryBackendType } from 'chrome-mcp-shared';
import { onMounted, ref } from 'vue';
import ILucidePlug from '~icons/lucide/plug';
import ILucideRefreshCw from '~icons/lucide/refresh-cw';

const defaultPort = NATIVE_HOST.DEFAULT_PORT;
const t = (key: string, substitutions?: string[]) => getMessage(key, substitutions);

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

// Memory state
const memoryBackend = ref<MemoryBackendType>('local_markdown_qmd');
const memoryLocalRootPath = ref('');
const memoryQmdIndexPath = ref('');
const baseUrl = ref('https://api.evermind.ai');
const apiKey = ref('');
const testingMemory = ref(false);
const memoryOk = ref(true);
const memoryMessage = ref('');

// Anthropic state
const anthropicBaseUrl = ref('https://api.anthropic.com');
const anthropicAuthToken = ref('');

// Language state
const uiLanguage = ref<UiLanguage>('auto');

// Quick Panel state
const floatingIconEnabled = ref(true);
const floatingIconSize = ref(96);

// Last saved values (to avoid toast when nothing changed)
const lastSavedGateway = ref({ wsUrl: '', authToken: '' });
const lastSavedMemory = ref<{ backend: MemoryBackendType; localRootPath: string }>({
  backend: 'local_markdown_qmd',
  localRootPath: '',
});
const lastSavedEmos = ref({ baseUrl: '', apiKey: '' });
const lastSavedFloatingIcon = ref(true);
const lastSavedFloatingIconSize = ref(96);
const lastSavedAnthropic = ref({ baseUrl: '', authToken: '' });
const lastSavedUiLanguage = ref<UiLanguage>('auto');

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
  const [gw, memory, em, fi, an, language] = await Promise.all([
    getGatewaySettings(),
    getMemorySettings(),
    getEmosSettings(),
    loadFloatingIcon(),
    getAnthropicSettings(),
    getUiLanguage(),
  ]);
  gatewayWsUrl.value = gw.gatewayWsUrl;
  gatewayAuthToken.value = gw.gatewayAuthToken;
  memoryBackend.value = memory.backend;
  memoryLocalRootPath.value = memory.localRootPath;
  memoryQmdIndexPath.value = memory.qmdIndexPath;
  baseUrl.value = em.baseUrl;
  apiKey.value = em.apiKey;
  floatingIconEnabled.value = fi;
  anthropicBaseUrl.value = an.baseUrl;
  anthropicAuthToken.value = an.authToken;
  uiLanguage.value = language;
  lastSavedGateway.value = { wsUrl: gw.gatewayWsUrl.trim(), authToken: gw.gatewayAuthToken.trim() };
  lastSavedMemory.value = {
    backend: memory.backend,
    localRootPath: memory.localRootPath.trim(),
  };
  lastSavedEmos.value = {
    baseUrl: em.baseUrl.trim(),
    apiKey: em.apiKey.trim(),
  };
  lastSavedFloatingIcon.value = fi;
  lastSavedAnthropic.value = { baseUrl: an.baseUrl.trim(), authToken: an.authToken.trim() };
  lastSavedUiLanguage.value = language;
  try {
    const size = await doLoadFloatingIconSize();
    floatingIconSize.value = size;
    lastSavedFloatingIconSize.value = size;
  } catch {
    // ignore
  }
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

async function saveMemory(showNotification = true): Promise<void> {
  const backend = memoryBackend.value;
  const localRootPath = memoryLocalRootPath.value.trim();
  if (
    backend === lastSavedMemory.value.backend &&
    localRootPath === lastSavedMemory.value.localRootPath
  ) {
    return;
  }

  const next = await setMemorySettings({ backend, localRootPath });
  memoryBackend.value = next.backend;
  memoryLocalRootPath.value = next.localRootPath;
  memoryQmdIndexPath.value = next.qmdIndexPath;
  lastSavedMemory.value = {
    backend: next.backend,
    localRootPath: next.localRootPath.trim(),
  };
  memoryOk.value = true;
  memoryMessage.value = '';
  if (showNotification) {
    showToast(t('settingsEmosSavedNotification'));
  }
}

async function saveEmosCredentials(showNotification = true): Promise<void> {
  const base = baseUrl.value.trim();
  const key = apiKey.value.trim();
  if (base === lastSavedEmos.value.baseUrl && key === lastSavedEmos.value.apiKey) {
    return;
  }
  await setEmosSettings({ baseUrl: base, apiKey: key });
  lastSavedEmos.value = { baseUrl: base, apiKey: key };
  memoryOk.value = true;
  memoryMessage.value = '';
  if (showNotification) {
    showToast(t('settingsEmosSavedNotification'));
  }
}

async function saveFloatingIcon(): Promise<void> {
  const enabled = floatingIconEnabled.value;
  if (enabled === lastSavedFloatingIcon.value) return;
  await doSaveFloatingIcon(enabled);
  lastSavedFloatingIcon.value = enabled;
  showToast(t('settingsQuickPanelSavedNotification'));
}

async function saveFloatingIconSize(): Promise<void> {
  const size = Math.round(floatingIconSize.value);
  if (size === lastSavedFloatingIconSize.value) return;
  await doSaveFloatingIconSize(size);
  lastSavedFloatingIconSize.value = size;
  showToast(t('settingsFloatingIconSizeSavedNotification', [String(size)]));
}

async function saveUiLanguage(): Promise<void> {
  if (uiLanguage.value === lastSavedUiLanguage.value) return;
  const next = await setUiLanguage(uiLanguage.value);
  uiLanguage.value = next;
  lastSavedUiLanguage.value = next;
  showToast(t('settingsLanguageSavedNotification'));
}

async function saveAnthropic(): Promise<void> {
  const base = anthropicBaseUrl.value.trim();
  const token = anthropicAuthToken.value.trim();
  if (base === lastSavedAnthropic.value.baseUrl && token === lastSavedAnthropic.value.authToken) {
    return;
  }
  await setAnthropicSettings({ baseUrl: base, authToken: token });
  lastSavedAnthropic.value = { baseUrl: base, authToken: token };
  showToast(t('settingsAnthropicSavedNotification'));
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

async function testMemory(): Promise<void> {
  testingMemory.value = true;
  memoryMessage.value = '';
  try {
    await saveMemory(false);
    if (memoryBackend.value === 'evermemos') {
      await saveEmosCredentials(false);
    }
    const result = await doTestMemoryBackend(memoryBackend.value);
    memoryOk.value = result.ok;
    memoryMessage.value = result.message;
  } finally {
    testingMemory.value = false;
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
