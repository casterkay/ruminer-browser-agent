/**
 * System Settings Modal for Quick Panel
 *
 * Vanilla DOM modal that shows the same Gateway + EverMemOS form as the options page.
 * Renders inside the Quick Panel overlay (content script Shadow DOM).
 */

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
import { Disposer } from '@/entrypoints/web-editor-v2/utils/disposables';

const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
  };

  function getEl(id: string): HTMLInputElement | HTMLButtonElement | HTMLDivElement | null {
    return backdrop?.querySelector(`[data-id="${id}"]`) ?? null;
  }

  async function loadSettings(): Promise<void> {
    const gw = await getGatewaySettings();
    const em = await getEmosSettings();
    state.gatewayWsUrl = gw.gatewayWsUrl;
    state.gatewayAuthToken = gw.gatewayAuthToken;
    state.baseUrl = em.baseUrl;
    state.apiKey = em.apiKey;
    state.userId = em.userId;
    updateInputs();
    updateStatus('gateway', state.gatewayOk, state.gatewayMessage);
    updateStatus('emos', state.emosOk, state.emosMessage);
  }

  function updateInputs(): void {
    const gwInput = getEl('gatewayWsUrl') as HTMLInputElement | null;
    const gwToken = getEl('gatewayAuthToken') as HTMLInputElement | null;
    const baseInput = getEl('baseUrl') as HTMLInputElement | null;
    const apiInput = getEl('apiKey') as HTMLInputElement | null;
    const userInput = getEl('userId') as HTMLInputElement | null;
    if (gwInput) gwInput.value = state.gatewayWsUrl;
    if (gwToken) gwToken.value = state.gatewayAuthToken;
    if (baseInput) baseInput.value = state.baseUrl;
    if (apiInput) apiInput.value = state.apiKey;
    if (userInput) userInput.value = state.userId;
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

  async function saveGateway(): Promise<void> {
    syncFromInputs();
    await setGatewaySettings({
      gatewayWsUrl: state.gatewayWsUrl.trim(),
      gatewayAuthToken: state.gatewayAuthToken.trim(),
    });
    state.gatewayOk = true;
    state.gatewayMessage = 'Gateway settings saved.';
    updateStatus('gateway', true, state.gatewayMessage);
  }

  async function saveEmos(): Promise<void> {
    syncFromInputs();
    await setEmosSettings({
      baseUrl: state.baseUrl.trim(),
      apiKey: state.apiKey.trim(),
      userId: state.userId.trim(),
    });
    state.emosOk = true;
    state.emosMessage = 'EverMemOS settings saved.';
    updateStatus('emos', true, state.emosMessage);
  }

  async function testGateway(): Promise<void> {
    syncFromInputs();
    state.testingGateway = true;
    (getEl('testGateway') as HTMLButtonElement | null)!.disabled = true;
    state.gatewayMessage = '';

    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(state.gatewayWsUrl.trim());
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('Gateway test timeout'));
        }, 10_000);
        const challengeTimer = setTimeout(() => {
          if (!connectSent) void sendConnect(null).catch(reject);
        }, 6_000);
        let connectSent = false;

        async function sendConnect(challengeNonce: string | null): Promise<void> {
          if (connectSent) return;
          connectSent = true;
          const params = await buildSignedConnectParams({
            role: 'operator',
            authToken: state.gatewayAuthToken.trim(),
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
      state.gatewayOk = true;
      state.gatewayMessage = 'Gateway connection test passed.';
    } catch (reason) {
      state.gatewayOk = false;
      state.gatewayMessage = reason instanceof Error ? reason.message : String(reason);
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
    (getEl('testEmos') as HTMLButtonElement | null)!.disabled = true;
    state.emosMessage = '';

    const baseUrl = state.baseUrl.trim().replace(/\/$/, '');
    const apiKey = state.apiKey.trim();
    const userId = state.userId.trim();

    if (!userId) {
      state.emosOk = false;
      state.emosMessage = 'User ID is required for EverMemOS connection.';
      state.testingEmos = false;
      (getEl('testEmos') as HTMLButtonElement | null)!.disabled = false;
      updateStatus('emos', false, state.emosMessage);
      return;
    }

    const endpoint = `${baseUrl}/api/v0/memories/search?query=ping&user_id=${encodeURIComponent(userId)}&limit=1`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`EverMemOS test failed (${response.status}): ${responseText}`);
      }
      state.emosOk = true;
      state.emosMessage = 'EverMemOS connection test passed.';
    } catch (reason) {
      state.emosOk = false;
      state.emosMessage =
        reason instanceof Error
          ? `${reason.message}\n\nEndpoint: ${endpoint}`
          : `${String(reason)}\n\nEndpoint: ${endpoint}`;
    } finally {
      state.testingEmos = false;
      (getEl('testEmos') as HTMLButtonElement | null)!.disabled = false;
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

    // Gateway card
    const gwCard = document.createElement('section');
    gwCard.className = 'qp-settings-card';
    gwCard.innerHTML = `
      <h2 class="qp-settings-card-title">OpenClaw Gateway</h2>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Gateway WS URL</span>
        <input data-id="gatewayWsUrl" class="qp-settings-field-input" type="text" placeholder="ws://127.0.0.1:18789"/>
      </label>
      <label class="qp-settings-field">
        <span class="qp-settings-field-label">Auth Token (optional on localhost)</span>
        <input data-id="gatewayAuthToken" class="qp-settings-field-input" type="password" placeholder="gateway token"/>
      </label>
      <div class="qp-settings-row">
        <button data-id="saveGateway" type="button" class="qp-settings-btn-primary ac-focus-ring">Save</button>
        <button data-id="testGateway" type="button" class="qp-settings-btn-secondary ac-focus-ring">Test Connection</button>
      </div>
      <div data-id="gatewayStatus" class="qp-settings-status" hidden></div>
    `;

    // EverMemOS card
    const emCard = document.createElement('section');
    emCard.className = 'qp-settings-card';
    emCard.innerHTML = `
      <h2 class="qp-settings-card-title">EverMemOS</h2>
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
      <div class="qp-settings-row">
        <button data-id="saveEmos" type="button" class="qp-settings-btn-primary ac-focus-ring">Save</button>
        <button data-id="testEmos" type="button" class="qp-settings-btn-secondary ac-focus-ring">Test Connection</button>
      </div>
      <div data-id="emosStatus" class="qp-settings-status" hidden></div>
    `;

    body.append(gwCard, emCard);
    modal.append(header, body);
    back.append(style, modal);

    disposer.listen(back, 'click', (e) => {
      if (e.target === back) hide();
    });
    disposer.listen(closeBtn, 'click', hide);
    disposer.listen(
      gwCard.querySelector('[data-id="saveGateway"]')!,
      'click',
      () => void saveGateway(),
    );
    disposer.listen(
      gwCard.querySelector('[data-id="testGateway"]')!,
      'click',
      () => void testGateway(),
    );
    disposer.listen(emCard.querySelector('[data-id="saveEmos"]')!, 'click', () => void saveEmos());
    disposer.listen(emCard.querySelector('[data-id="testEmos"]')!, 'click', () => void testEmos());

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
