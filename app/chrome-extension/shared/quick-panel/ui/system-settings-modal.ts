/**
 * System Settings Modal for Quick Panel
 *
 * Vanilla DOM modal that shows the same Gateway + EverMemOS form as the options page.
 * Renders inside the Quick Panel overlay (content script Shadow DOM).
 * Uses shared logic from system-settings.ts.
 */

import { NATIVE_HOST } from '@/common/constants';
import {
  getEmosSettings,
  getGatewaySettings,
  setEmosSettings,
  setGatewaySettings,
} from '@/entrypoints/shared/utils/openclaw-settings';
import {
  STORAGE_KEY_FLOATING_ICON,
  refreshServerStatus as doRefreshServerStatus,
  saveFloatingIcon as doSaveFloatingIcon,
  testEmos as doTestEmos,
  testGateway as doTestGateway,
} from '@/entrypoints/shared/utils/system-settings';
import { Disposer } from '@/entrypoints/web-editor-v2/utils/disposables';
import { getMessage } from '@/utils/i18n';

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
    baseUrl: 'https://api.evermind.ai',
    apiKey: '',
    userId: '',
    testingGateway: false,
    testingEmos: false,
    gatewayOk: true,
    gatewayMessage: '',
    emosOk: true,
    emosMessage: '',
    lastSavedGateway: { wsUrl: '', authToken: '' },
    lastSavedEmos: { baseUrl: '', apiKey: '', userId: '' },
    lastSavedFloatingIcon: true,
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
    const em = await getEmosSettings();
    const fi = await chrome.storage.local.get(STORAGE_KEY_FLOATING_ICON);
    state.gatewayWsUrl = gw.gatewayWsUrl;
    state.gatewayAuthToken = gw.gatewayAuthToken;
    state.baseUrl = em.baseUrl;
    state.apiKey = em.apiKey;
    state.userId = em.userId;
    state.floatingIconEnabled = fi[STORAGE_KEY_FLOATING_ICON] ?? true;
    state.lastSavedGateway = {
      wsUrl: gw.gatewayWsUrl.trim(),
      authToken: gw.gatewayAuthToken.trim(),
    };
    state.lastSavedEmos = {
      baseUrl: em.baseUrl.trim(),
      apiKey: em.apiKey.trim(),
      userId: em.userId.trim(),
    };
    state.lastSavedFloatingIcon = state.floatingIconEnabled;
    updateInputs();
    updateStatus('gateway', state.gatewayOk, state.gatewayMessage);
    updateStatus('emos', state.emosOk, state.emosMessage);
    await refreshServerStatus();
  }

  function updateInputs(): void {
    const gwInput = getEl('gatewayWsUrl') as HTMLInputElement | null;
    const gwToken = getEl('gatewayAuthToken') as HTMLInputElement | null;
    const baseInput = getEl('baseUrl') as HTMLInputElement | null;
    const apiInput = getEl('apiKey') as HTMLInputElement | null;
    const userInput = getEl('userId') as HTMLInputElement | null;
    const floatingCb = getEl('floatingIconCb') as HTMLInputElement | null;
    if (gwInput) gwInput.value = state.gatewayWsUrl;
    if (gwToken) gwToken.value = state.gatewayAuthToken;
    if (baseInput) baseInput.value = state.baseUrl;
    if (apiInput) apiInput.value = state.apiKey;
    if (userInput) userInput.value = state.userId;
    if (floatingCb) floatingCb.checked = state.floatingIconEnabled;
  }

  const ICON_OK =
    '<svg class="qp-settings-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
  const ICON_ERR =
    '<svg class="qp-settings-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  function updateStatus(which: 'gateway' | 'emos', ok: boolean, message: string): void {
    const el = getEl(which === 'gateway' ? 'gatewayStatus' : 'emosStatus') as HTMLDivElement | null;
    if (!el) return;
    el.innerHTML = (ok ? ICON_OK : ICON_ERR) + (message ? ` ${message}` : '');
    el.className = `qp-settings-status ${ok ? 'qp-settings-status-ok' : 'qp-settings-status-error'}`;
    el.hidden = !message;
  }

  function syncFromInputs(): void {
    const gwInput = getEl('gatewayWsUrl') as HTMLInputElement | null;
    const gwToken = getEl('gatewayAuthToken') as HTMLInputElement | null;
    const baseInput = getEl('baseUrl') as HTMLInputElement | null;
    const apiInput = getEl('apiKey') as HTMLInputElement | null;
    const userInput = getEl('userId') as HTMLInputElement | null;
    if (gwInput) state.gatewayWsUrl = gwInput.value;
    if (gwToken) state.gatewayAuthToken = gwToken.value;
    if (baseInput) state.baseUrl = baseInput.value;
    if (apiInput) state.apiKey = apiInput.value;
    if (userInput) state.userId = userInput.value;
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

  async function saveEmos(): Promise<void> {
    syncFromInputs();
    const baseUrl = state.baseUrl.trim();
    const apiKey = state.apiKey.trim();
    const userId = state.userId.trim();
    if (
      baseUrl === state.lastSavedEmos.baseUrl &&
      apiKey === state.lastSavedEmos.apiKey &&
      userId === state.lastSavedEmos.userId
    ) {
      return;
    }
    await setEmosSettings({ baseUrl, apiKey, userId });
    state.lastSavedEmos = { baseUrl, apiKey, userId };
    state.emosOk = true;
    state.emosMessage = '';
    updateStatus('emos', true, '');
    showToast(getMessage('settingsEmosSavedNotification'));
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

  async function testEmos(): Promise<void> {
    syncFromInputs();
    state.testingEmos = true;
    const testBtn = getEl('testEmos') as HTMLButtonElement | null;
    if (testBtn) testBtn.disabled = true;
    state.emosMessage = '';
    try {
      const result = await doTestEmos(state.baseUrl, state.apiKey, state.userId);
      state.emosOk = result.ok;
      state.emosMessage = result.message;
    } finally {
      state.testingEmos = false;
      const btn = getEl('testEmos') as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
      updateStatus('emos', state.emosOk, state.emosMessage);
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
        <span class="qp-settings-field-label">Auth Token (optional on localhost)</span>
        <input data-id="gatewayAuthToken" class="qp-settings-field-input" type="password" placeholder="gateway token"/>
      </label>
      <div data-id="gatewayStatus" class="qp-settings-status" hidden></div>
    `;

    // EverMemOS card
    const emCard = document.createElement('section');
    emCard.className = 'qp-settings-card';
    emCard.innerHTML = `
      <div class="qp-settings-card-header">
        <h2 class="qp-settings-card-title">EverMemOS</h2>
        <button data-id="testEmos" type="button" class="qp-settings-btn-icon ac-focus-ring" aria-label="${getMessage('testConnectionButtonAria')}">${ICON_PLUG}</button>
      </div>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Base URL</span>
        <input data-id="baseUrl" class="qp-settings-field-input" type="text" placeholder="https://api.evermind.ai"/>
      </label>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">API Key</span>
        <input data-id="apiKey" class="qp-settings-field-input" type="password" placeholder="your EverMemOS API key"/>
      </label>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">User ID</span>
        <input data-id="userId" class="qp-settings-field-input" type="text" placeholder="your user identifier for memory storage"/>
      </label>
      <div data-id="emosStatus" class="qp-settings-status" hidden></div>
    `;

    body.append(mcpCard, qpCard, gwCard, emCard);
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
    disposer.listen(emCard.querySelector('[data-id="testEmos"]')!, 'click', () => void testEmos());

    // Auto-save on blur for Gateway inputs
    for (const id of ['gatewayWsUrl', 'gatewayAuthToken']) {
      const input = gwCard.querySelector(`[data-id="${id}"]`) as HTMLInputElement;
      if (input) disposer.listen(input, 'blur', () => void saveGateway());
    }
    // Auto-save on blur for EverMemOS inputs
    for (const id of ['baseUrl', 'apiKey', 'userId']) {
      const input = emCard.querySelector(`[data-id="${id}"]`) as HTMLInputElement;
      if (input) disposer.listen(input, 'blur', () => void saveEmos());
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
