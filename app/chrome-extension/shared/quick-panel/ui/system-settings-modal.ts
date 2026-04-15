/**
 * System Settings Modal for Quick Panel
 *
 * Vanilla DOM modal that shows the same Gateway + Memory form as the options page.
 * Renders inside the Quick Panel overlay (content script Shadow DOM).
 * Uses shared logic from system-settings.ts.
 */

import { NATIVE_HOST } from '@/common/constants';
import {
  getAnthropicSettings,
  setAnthropicSettings,
} from '@/entrypoints/shared/utils/anthropic-settings';
import {
  getEmosSettings,
  getGatewaySettings,
  getMemorySettings,
  setEmosSettings,
  setGatewaySettings,
  setMemorySettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  loadFloatingIcon as doLoadFloatingIcon,
  refreshServerStatus as doRefreshServerStatus,
  saveFloatingIcon as doSaveFloatingIcon,
  testGateway as doTestGateway,
  testMemoryBackend as doTestMemoryBackend,
} from '@/entrypoints/shared/utils/system-settings';
import { Disposer } from '@/entrypoints/web-editor-v2/utils/disposables';
import { getMessage } from '@/utils/i18n';
import type { MemoryBackendType } from 'chrome-mcp-shared';

const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_REFRESH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`;
const ICON_PLUG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>`;

const MODAL_STYLES = /* css */ `
.qp-settings-modal-backdrop {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
}
.qp-settings-modal {
  width: 100%;
  max-width: 420px;
  max-height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  box-shadow: var(--ac-shadow-float);
}
.qp-settings-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  flex-shrink: 0;
  border-bottom: var(--ac-border-width) solid var(--ac-border);
}
.qp-settings-modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}
.qp-settings-modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--ac-text-muted);
  border-radius: var(--ac-radius-inner);
  transition: background-color var(--ac-motion-fast);
}
.qp-settings-modal-close:hover {
  background-color: var(--ac-hover-bg);
  color: var(--ac-text);
}
.qp-settings-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 16px;
}
.qp-settings-card {
  padding: 16px;
  display: grid;
  gap: 12px;
  background-color: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-card);
  box-shadow: var(--ac-shadow-card);
}
.qp-settings-stack {
  display: grid;
  gap: 12px;
}
.qp-settings-card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--ac-text);
  font-family: var(--ac-font-heading);
}
.qp-settings-field {
  display: grid;
  gap: 4px;
  font-size: 12px;
}
.qp-settings-field-label {
  color: var(--ac-text-muted);
  font-weight: 500;
}
.qp-settings-field-input {
  padding: 9px 12px;
  font-size: 13px;
  outline: none;
  border: none;
  background-color: var(--ac-surface-muted);
  border-radius: var(--ac-radius-inner);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}
.qp-settings-field-input::placeholder {
  color: var(--ac-text-placeholder);
}
.qp-settings-field-input:focus {
  background-color: var(--ac-hover-bg);
}
.qp-settings-row {
  display: flex;
  gap: 8px;
}
.qp-settings-row-label {
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
}
.qp-settings-btn-primary {
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  border-radius: var(--ac-radius-button);
  background-color: var(--ac-accent);
  color: var(--ac-accent-contrast);
  font-family: var(--ac-font-body);
}
.qp-settings-btn-secondary {
  padding: 9px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: var(--ac-border-width) solid var(--ac-border);
  border-radius: var(--ac-radius-button);
  background-color: var(--ac-surface-muted);
  color: var(--ac-text);
  font-family: var(--ac-font-body);
}
.qp-settings-btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.qp-settings-status {
  margin: 0;
  font-size: 12px;
  padding: 10px 12px;
  border-radius: var(--ac-radius-inner);
  display: flex;
  align-items: center;
  gap: 8px;
}
.qp-settings-status-ok {
  background-color: var(--ac-diff-add-bg);
  color: var(--ac-success);
  border: var(--ac-border-width) solid var(--ac-diff-add-border);
}
.qp-settings-status-error {
  background-color: var(--ac-diff-del-bg);
  color: var(--ac-danger);
  border: var(--ac-border-width) solid var(--ac-diff-del-border);
}
.qp-settings-status-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.qp-settings-value {
  font-size: 12px;
  font-weight: 500;
}
.qp-settings-value.ok {
  color: var(--ac-success);
}
.qp-settings-value.warn {
  color: var(--ac-warning);
}
.qp-settings-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--ac-text);
}
.qp-settings-checkbox input {
  accent-color: var(--ac-accent);
}
.qp-settings-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.qp-settings-card-header .qp-settings-card-title {
  margin: 0;
}
.qp-settings-btn-icon {
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
  padding: 0;
}
.qp-settings-btn-icon:hover:not(:disabled) {
  background-color: var(--ac-hover-bg);
}
.qp-settings-btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.qp-settings-btn-icon svg {
  width: 16px;
  height: 16px;
}
.qp-settings-toast {
  position: absolute;
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
  box-shadow: 0 4px 16px color-mix(in srgb, var(--ac-accent) 40%, transparent), 0 1px 4px color-mix(in srgb, var(--ac-accent) 20%, transparent);
  z-index: 101;
}
@keyframes qp-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.qp-settings-btn-icon.spinning svg {
  animation: qp-spin 0.8s linear infinite;
}
`;

export interface SystemSettingsModalManager {
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

/**
 * Create a System Settings modal (same content as options page).
 * Mounts inside the given parent (typically the Quick Panel overlay).
 */
export function createSystemSettingsModal(parent: HTMLElement): SystemSettingsModalManager {
  const disposer = new Disposer();

  let backdrop: HTMLDivElement | null = null;
  let disposed = false;

  const state = {
    mcpServerRunning: false,
    mcpServerPort: null as number | null,
    refreshing: false,
    floatingIconEnabled: true,
    gatewayWsUrl: 'ws://127.0.0.1:18789',
    gatewayAuthToken: '',
    memoryBackend: 'local_markdown_qmd' as MemoryBackendType,
    memoryLocalRootPath: '',
    memoryQmdIndexPath: '',
    baseUrl: 'https://api.evermind.ai',
    apiKey: '',
    anthropicBaseUrl: '',
    anthropicAuthToken: '',
    testingGateway: false,
    testingMemory: false,
    gatewayOk: true,
    gatewayMessage: '',
    memoryOk: true,
    memoryMessage: '',
    lastSavedGateway: { wsUrl: '', authToken: '' },
    lastSavedMemory: {
      backend: 'local_markdown_qmd' as MemoryBackendType,
      localRootPath: '',
    },
    lastSavedEmos: { baseUrl: '', apiKey: '' },
    lastSavedFloatingIcon: true,
    lastSavedAnthropic: { baseUrl: '', authToken: '' },
  };

  function getEl(id: string): HTMLInputElement | HTMLButtonElement | HTMLDivElement | null {
    return backdrop?.querySelector(`[data-id="${id}"]`) ?? null;
  }

  async function refreshServerStatus(): Promise<void> {
    state.refreshing = true;
    const refreshBtn = getEl('refreshServer') as HTMLButtonElement | null;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('spinning');
    }
    try {
      const status = await doRefreshServerStatus();
      state.mcpServerRunning = status.isRunning;
      state.mcpServerPort = status.port;
    } finally {
      state.refreshing = false;
      const btn = getEl('refreshServer') as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('spinning');
      }
      updateMcpStatus();
    }
  }

  function updateMcpStatus(): void {
    const statusEl = getEl('mcpStatus') as HTMLSpanElement | null;
    const portEl = getEl('mcpPort') as HTMLSpanElement | null;
    if (statusEl) statusEl.textContent = state.mcpServerRunning ? 'Running' : 'Stopped';
    if (statusEl)
      statusEl.className = `qp-settings-value ${state.mcpServerRunning ? 'ok' : 'warn'}`;
    if (portEl)
      portEl.textContent =
        state.mcpServerPort != null
          ? String(state.mcpServerPort)
          : `Default: ${NATIVE_HOST.DEFAULT_PORT}`;
  }

  async function saveFloatingIcon(): Promise<void> {
    const cb = getEl('floatingIconCb') as HTMLInputElement | null;
    if (!cb) return;
    state.floatingIconEnabled = cb.checked;
    if (state.floatingIconEnabled === state.lastSavedFloatingIcon) return;
    await doSaveFloatingIcon(state.floatingIconEnabled);
    state.lastSavedFloatingIcon = state.floatingIconEnabled;
    showToast(getMessage('settingsQuickPanelSavedNotification'));
  }

  async function loadSettings(): Promise<void> {
    const gw = await getGatewaySettings();
    const memory = await getMemorySettings();
    const em = await getEmosSettings();
    const an = await getAnthropicSettings();
    const floatingIconEnabled = await doLoadFloatingIcon();
    state.gatewayWsUrl = gw.gatewayWsUrl;
    state.gatewayAuthToken = gw.gatewayAuthToken;
    state.memoryBackend = memory.backend;
    state.memoryLocalRootPath = memory.localRootPath;
    state.memoryQmdIndexPath = memory.qmdIndexPath;
    state.baseUrl = em.baseUrl;
    state.apiKey = em.apiKey;
    state.anthropicBaseUrl = an.baseUrl;
    state.anthropicAuthToken = an.authToken;
    state.floatingIconEnabled = floatingIconEnabled;
    state.lastSavedGateway = {
      wsUrl: gw.gatewayWsUrl.trim(),
      authToken: gw.gatewayAuthToken.trim(),
    };
    state.lastSavedMemory = {
      backend: memory.backend,
      localRootPath: memory.localRootPath.trim(),
    };
    state.lastSavedEmos = {
      baseUrl: em.baseUrl.trim(),
      apiKey: em.apiKey.trim(),
    };
    state.lastSavedFloatingIcon = state.floatingIconEnabled;
    state.lastSavedAnthropic = {
      baseUrl: an.baseUrl.trim(),
      authToken: an.authToken.trim(),
    };
    updateInputs();
    updateStatus('gateway', state.gatewayOk, state.gatewayMessage);
    updateStatus('memory', state.memoryOk, state.memoryMessage);
    await refreshServerStatus();
  }

  function updateInputs(): void {
    const gwInput = getEl('gatewayWsUrl') as HTMLInputElement | null;
    const gwToken = getEl('gatewayAuthToken') as HTMLInputElement | null;
    const memoryBackend = getEl('memoryBackend') as HTMLSelectElement | null;
    const memoryLocalRootPath = getEl('memoryLocalRootPath') as HTMLInputElement | null;
    const memoryQmdIndexPath = getEl('memoryQmdIndexPath') as HTMLInputElement | null;
    const baseInput = getEl('baseUrl') as HTMLInputElement | null;
    const apiInput = getEl('apiKey') as HTMLInputElement | null;
    const anBaseInput = getEl('anthropicBaseUrl') as HTMLInputElement | null;
    const anTokenInput = getEl('anthropicAuthToken') as HTMLInputElement | null;
    const floatingCb = getEl('floatingIconCb') as HTMLInputElement | null;
    if (gwInput) gwInput.value = state.gatewayWsUrl;
    if (gwToken) gwToken.value = state.gatewayAuthToken;
    if (memoryBackend) memoryBackend.value = state.memoryBackend;
    if (memoryLocalRootPath) memoryLocalRootPath.value = state.memoryLocalRootPath;
    if (memoryQmdIndexPath) memoryQmdIndexPath.value = state.memoryQmdIndexPath;
    if (baseInput) baseInput.value = state.baseUrl;
    if (apiInput) apiInput.value = state.apiKey;
    if (anBaseInput) anBaseInput.value = state.anthropicBaseUrl;
    if (anTokenInput) anTokenInput.value = state.anthropicAuthToken;
    if (floatingCb) floatingCb.checked = state.floatingIconEnabled;
    updateMemoryFieldVisibility();
  }

  function updateMemoryFieldVisibility(): void {
    const localFields = getEl('memoryLocalFields') as HTMLDivElement | null;
    const legacyFields = getEl('evermemosFields') as HTMLDivElement | null;
    const isLocal = state.memoryBackend === 'local_markdown_qmd';

    if (localFields) localFields.hidden = !isLocal;
    if (legacyFields) legacyFields.hidden = isLocal;
  }

  const ICON_OK =
    '<svg class="qp-settings-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
  const ICON_ERR =
    '<svg class="qp-settings-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  function updateStatus(which: 'gateway' | 'memory', ok: boolean, message: string): void {
    const el = getEl(
      which === 'gateway' ? 'gatewayStatus' : 'memoryStatus',
    ) as HTMLDivElement | null;
    if (!el) return;
    el.innerHTML = (ok ? ICON_OK : ICON_ERR) + (message ? ` ${message}` : '');
    el.className = `qp-settings-status ${ok ? 'qp-settings-status-ok' : 'qp-settings-status-error'}`;
    el.hidden = !message;
  }

  function syncFromInputs(): void {
    const gwInput = getEl('gatewayWsUrl') as HTMLInputElement | null;
    const gwToken = getEl('gatewayAuthToken') as HTMLInputElement | null;
    const memoryBackend = getEl('memoryBackend') as HTMLSelectElement | null;
    const memoryLocalRootPath = getEl('memoryLocalRootPath') as HTMLInputElement | null;
    const baseInput = getEl('baseUrl') as HTMLInputElement | null;
    const apiInput = getEl('apiKey') as HTMLInputElement | null;
    const anBaseInput = getEl('anthropicBaseUrl') as HTMLInputElement | null;
    const anTokenInput = getEl('anthropicAuthToken') as HTMLInputElement | null;
    if (gwInput) state.gatewayWsUrl = gwInput.value;
    if (gwToken) state.gatewayAuthToken = gwToken.value;
    if (memoryBackend) state.memoryBackend = memoryBackend.value as MemoryBackendType;
    if (memoryLocalRootPath) state.memoryLocalRootPath = memoryLocalRootPath.value;
    if (baseInput) state.baseUrl = baseInput.value;
    if (apiInput) state.apiKey = apiInput.value;
    if (anBaseInput) state.anthropicBaseUrl = anBaseInput.value;
    if (anTokenInput) state.anthropicAuthToken = anTokenInput.value;
    updateMemoryFieldVisibility();
  }

  function showToast(message: string): void {
    const toast = getEl('toast') as HTMLDivElement | null;
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout((toast as any).__toastTimer);
    (toast as any).__toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2500);
  }

  async function saveGateway(): Promise<void> {
    syncFromInputs();
    const wsUrl = state.gatewayWsUrl.trim();
    const authToken = state.gatewayAuthToken.trim();
    if (wsUrl === state.lastSavedGateway.wsUrl && authToken === state.lastSavedGateway.authToken) {
      return;
    }
    await setGatewaySettings({ gatewayWsUrl: wsUrl, gatewayAuthToken: authToken });
    state.lastSavedGateway = { wsUrl, authToken };
    state.gatewayOk = true;
    state.gatewayMessage = '';
    updateStatus('gateway', true, '');
    showToast(getMessage('settingsGatewaySavedNotification'));
  }

  async function saveMemory(showNotification = true): Promise<void> {
    syncFromInputs();
    const backend = state.memoryBackend;
    const localRootPath = state.memoryLocalRootPath.trim();
    if (
      backend === state.lastSavedMemory.backend &&
      localRootPath === state.lastSavedMemory.localRootPath
    ) {
      return;
    }

    const next = await setMemorySettings({ backend, localRootPath });
    state.memoryBackend = next.backend;
    state.memoryLocalRootPath = next.localRootPath;
    state.memoryQmdIndexPath = next.qmdIndexPath;
    state.lastSavedMemory = {
      backend: next.backend,
      localRootPath: next.localRootPath.trim(),
    };
    state.memoryOk = true;
    state.memoryMessage = '';
    updateInputs();
    updateStatus('memory', true, '');
    if (showNotification) {
      showToast(getMessage('settingsEmosSavedNotification'));
    }
  }

  async function saveEmosCredentials(showNotification = true): Promise<void> {
    syncFromInputs();
    const baseUrl = state.baseUrl.trim();
    const apiKey = state.apiKey.trim();
    if (baseUrl === state.lastSavedEmos.baseUrl && apiKey === state.lastSavedEmos.apiKey) {
      return;
    }
    await setEmosSettings({ baseUrl, apiKey });
    state.lastSavedEmos = { baseUrl, apiKey };
    state.memoryOk = true;
    state.memoryMessage = '';
    updateStatus('memory', true, '');
    if (showNotification) {
      showToast(getMessage('settingsEmosSavedNotification'));
    }
  }

  async function saveAnthropic(): Promise<void> {
    syncFromInputs();
    const baseUrl = state.anthropicBaseUrl.trim();
    const authToken = state.anthropicAuthToken.trim();
    if (
      baseUrl === state.lastSavedAnthropic.baseUrl &&
      authToken === state.lastSavedAnthropic.authToken
    ) {
      return;
    }
    await setAnthropicSettings({ baseUrl, authToken });
    state.lastSavedAnthropic = { baseUrl, authToken };
    showToast(getMessage('settingsAnthropicSavedNotification'));
  }

  async function testGateway(): Promise<void> {
    syncFromInputs();
    state.testingGateway = true;
    const testBtn = getEl('testGateway') as HTMLButtonElement | null;
    if (testBtn) testBtn.disabled = true;
    state.gatewayMessage = '';
    try {
      const result = await doTestGateway(state.gatewayWsUrl, state.gatewayAuthToken);
      state.gatewayOk = result.ok;
      state.gatewayMessage = result.message;
    } finally {
      state.testingGateway = false;
      const btn = getEl('testGateway') as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
      updateStatus('gateway', state.gatewayOk, state.gatewayMessage);
    }
  }

  async function testMemory(): Promise<void> {
    syncFromInputs();
    state.testingMemory = true;
    const testBtn = getEl('testMemory') as HTMLButtonElement | null;
    if (testBtn) testBtn.disabled = true;
    state.memoryMessage = '';
    try {
      await saveMemory(false);
      if (state.memoryBackend === 'evermemos') {
        await saveEmosCredentials(false);
      }
      const result = await doTestMemoryBackend(state.memoryBackend);
      state.memoryOk = result.ok;
      state.memoryMessage = result.message;
    } finally {
      state.testingMemory = false;
      const btn = getEl('testMemory') as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
      updateStatus('memory', state.memoryOk, state.memoryMessage);
    }
  }

  function buildModal(): HTMLDivElement {
    const style = document.createElement('style');
    style.textContent = MODAL_STYLES;

    const back = document.createElement('div');
    back.className = 'qp-settings-modal-backdrop';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-labelledby', 'qp-settings-title');

    const modal = document.createElement('div');
    modal.className = 'qp-settings-modal';

    const header = document.createElement('div');
    header.className = 'qp-settings-modal-header';
    const title = document.createElement('h2');
    title.id = 'qp-settings-title';
    title.className = 'qp-settings-modal-title';
    title.textContent = 'System Settings';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'qp-settings-modal-close ac-focus-ring';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = ICON_CLOSE;
    header.append(title, closeBtn);

    const body = document.createElement('div');
    body.className = 'qp-settings-modal-body ac-scroll';

    // Toast
    const toast = document.createElement('div');
    toast.id = 'qp-settings-toast';
    toast.setAttribute('data-id', 'toast');
    toast.className = 'qp-settings-toast';
    toast.hidden = true;

    // MCP Server card
    const mcpCard = document.createElement('section');
    mcpCard.className = 'qp-settings-card';
    mcpCard.innerHTML = `
      <div class="qp-settings-card-header">
        <h2 class="qp-settings-card-title">MCP Server</h2>
        <button data-id="refreshServer" type="button" class="qp-settings-btn-icon ac-focus-ring" aria-label="${getMessage('refreshStatusButtonAria')}">${ICON_REFRESH}</button>
      </div>
      <div class="qp-settings-row qp-settings-row-label">
        <span>Status</span>
        <span data-id="mcpStatus" class="qp-settings-value warn">Stopped</span>
      </div>
      <div class="qp-settings-row qp-settings-row-label">
        <span>Port</span>
        <span data-id="mcpPort" class="qp-settings-value">Default: ${NATIVE_HOST.DEFAULT_PORT}</span>
      </div>
    `;

    // Quick Panel card
    const qpCard = document.createElement('section');
    qpCard.className = 'qp-settings-card';
    qpCard.innerHTML = `
      <h2 class="qp-settings-card-title">Quick Panel</h2>
      <label class="qp-settings-checkbox">
        <input data-id="floatingIconCb" type="checkbox" checked/>
        <span>Show in-page button</span>
      </label>
    `;

    // Gateway card
    const gwCard = document.createElement('section');
    gwCard.className = 'qp-settings-card';
    gwCard.innerHTML = `
      <div class="qp-settings-card-header">
        <h2 class="qp-settings-card-title">OpenClaw Gateway</h2>
        <button data-id="testGateway" type="button" class="qp-settings-btn-icon ac-focus-ring" aria-label="${getMessage('testConnectionButtonAria')}">${ICON_PLUG}</button>
      </div>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Gateway WS URL</span>
        <input data-id="gatewayWsUrl" class="qp-settings-field-input" type="text" placeholder="ws://127.0.0.1:18789"/>
      </label>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Auth Token</span>
        <input data-id="gatewayAuthToken" class="qp-settings-field-input" type="password" placeholder="gateway token"/>
      </label>
      <div data-id="gatewayStatus" class="qp-settings-status" hidden></div>
    `;

    // Memory card
    const memoryCard = document.createElement('section');
    memoryCard.className = 'qp-settings-card';
    memoryCard.innerHTML = `
      <div class="qp-settings-card-header">
        <h2 class="qp-settings-card-title">Memory</h2>
        <button data-id="testMemory" type="button" class="qp-settings-btn-icon ac-focus-ring" aria-label="${getMessage('testConnectionButtonAria')}">${ICON_PLUG}</button>
      </div>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Backend</span>
        <select data-id="memoryBackend" class="qp-settings-field-input">
          <option value="local_markdown_qmd">Local File System</option>
          <option value="evermemos">EverMemOS (legacy)</option>
        </select>
      </label>
      <div data-id="memoryLocalFields" class="qp-settings-stack">
        <label class="qp-settings-field">
          <span class="qp-settings-field-label">Directory Path</span>
          <input data-id="memoryLocalRootPath" class="qp-settings-field-input" type="text" placeholder="User-global app data directory"/>
        </label>
        <label class="qp-settings-field">
          <span class="qp-settings-field-label">QMD Index</span>
          <input data-id="memoryQmdIndexPath" class="qp-settings-field-input" type="text" readonly/>
        </label>
      </div>
      <div data-id="evermemosFields" class="qp-settings-stack" hidden>
        <div class="qp-settings-value">
          Legacy remote backend. Ruminer still routes memory operations through the native server.
        </div>
        <label class="qp-settings-field">
          <span class="qp-settings-field-label">Base URL</span>
          <input data-id="baseUrl" class="qp-settings-field-input" type="text" placeholder="https://api.evermind.ai"/>
        </label>
        <label class="qp-settings-field">
          <span class="qp-settings-field-label">API Key</span>
          <input data-id="apiKey" class="qp-settings-field-input" type="password" placeholder="legacy EverMemOS API key"/>
        </label>
      </div>
      <div data-id="memoryStatus" class="qp-settings-status" hidden></div>
    `;

    // Anthropic card
    const anCard = document.createElement('section');
    anCard.className = 'qp-settings-card';
    anCard.innerHTML = `
      <h2 class="qp-settings-card-title">Anthropic (Claude Code)</h2>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Base URL</span>
        <input data-id="anthropicBaseUrl" class="qp-settings-field-input" type="text" placeholder="(optional)"/>
      </label>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Auth Token</span>
        <input data-id="anthropicAuthToken" class="qp-settings-field-input" type="password" placeholder="(optional)"/>
      </label>
    `;

    body.append(mcpCard, qpCard, gwCard, memoryCard, anCard);
    modal.append(header, body);
    back.append(style, modal, toast);

    disposer.listen(back, 'click', (e) => {
      if (e.target === back) hide();
    });
    disposer.listen(closeBtn, 'click', hide);
    disposer.listen(
      mcpCard.querySelector('[data-id="refreshServer"]')!,
      'click',
      () => void refreshServerStatus(),
    );
    disposer.listen(
      qpCard.querySelector('[data-id="floatingIconCb"]')!,
      'change',
      () => void saveFloatingIcon(),
    );
    disposer.listen(
      gwCard.querySelector('[data-id="testGateway"]')!,
      'click',
      () => void testGateway(),
    );
    disposer.listen(
      memoryCard.querySelector('[data-id="testMemory"]')!,
      'click',
      () => void testMemory(),
    );

    // Auto-save on blur for Gateway inputs
    for (const id of ['gatewayWsUrl', 'gatewayAuthToken']) {
      const input = gwCard.querySelector(`[data-id="${id}"]`) as HTMLInputElement;
      if (input) disposer.listen(input, 'blur', () => void saveGateway());
    }
    const memoryBackendSelect = memoryCard.querySelector(
      '[data-id="memoryBackend"]',
    ) as HTMLSelectElement | null;
    if (memoryBackendSelect) {
      disposer.listen(memoryBackendSelect, 'change', () => {
        syncFromInputs();
        updateMemoryFieldVisibility();
        void saveMemory();
      });
    }
    const memoryLocalRootPathInput = memoryCard.querySelector(
      '[data-id="memoryLocalRootPath"]',
    ) as HTMLInputElement | null;
    if (memoryLocalRootPathInput) {
      disposer.listen(memoryLocalRootPathInput, 'blur', () => void saveMemory());
    }
    // Auto-save on blur for legacy EverMemOS inputs
    for (const id of ['baseUrl', 'apiKey']) {
      const input = memoryCard.querySelector(`[data-id="${id}"]`) as HTMLInputElement;
      if (input) disposer.listen(input, 'blur', () => void saveEmosCredentials());
    }

    // Auto-save on blur for Anthropic inputs
    for (const id of ['anthropicBaseUrl', 'anthropicAuthToken']) {
      const input = anCard.querySelector(`[data-id="${id}"]`) as HTMLInputElement;
      if (input) disposer.listen(input, 'blur', () => void saveAnthropic());
    }

    return back;
  }

  function show(): void {
    if (disposed) return;
    if (backdrop) {
      backdrop.hidden = false;
      return;
    }
    backdrop = buildModal();
    parent.append(backdrop);
    void loadSettings();
  }

  function hide(): void {
    if (backdrop) backdrop.hidden = true;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    backdrop?.remove();
    backdrop = null;
    disposer.dispose();
  }

  return { show, hide, dispose };
}
