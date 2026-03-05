import { OPENCLAW_DEFAULTS, STORAGE_KEYS } from '@/common/constants';
import {
  getNativeServerPort,
  normalizeNullableString,
  normalizeString,
  readJson,
} from './settings-internals';

export interface GatewayConnectionSettings {
  gatewayWsUrl: string;
  gatewayAuthToken: string;
  lastConnectedAt: string | null;
  lastConnectionError: string | null;
  deviceId: string | null;
}

export interface GatewayConnectionStatus {
  connected: boolean;
  lastConnectedAt: string | null;
  lastConnectionError: string | null;
  updatedAt: string;
}

const DEFAULT_GATEWAY_SETTINGS: GatewayConnectionSettings = {
  gatewayWsUrl: OPENCLAW_DEFAULTS.GATEWAY_WS_URL,
  gatewayAuthToken: '',
  lastConnectedAt: null,
  lastConnectionError: null,
  deviceId: null,
};

const DEFAULT_GATEWAY_STATUS: GatewayConnectionStatus = {
  connected: false,
  lastConnectedAt: null,
  lastConnectionError: null,
  updatedAt: new Date(0).toISOString(),
};

async function getGatewaySettingsFromLocalStorage(): Promise<GatewayConnectionSettings> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS))[
      STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS
    ] || {};

  return {
    gatewayWsUrl: normalizeString(raw.gatewayWsUrl, DEFAULT_GATEWAY_SETTINGS.gatewayWsUrl),
    gatewayAuthToken: normalizeString(raw.gatewayAuthToken, ''),
    lastConnectedAt: normalizeNullableString(raw.lastConnectedAt),
    lastConnectionError: normalizeNullableString(raw.lastConnectionError),
    deviceId: normalizeNullableString(raw.deviceId),
  };
}

async function setGatewaySettingsToLocalStorage(
  patch: Partial<GatewayConnectionSettings>,
): Promise<GatewayConnectionSettings> {
  const current = await getGatewaySettingsFromLocalStorage();
  const next: GatewayConnectionSettings = {
    ...current,
    ...patch,
    gatewayWsUrl: patch.gatewayWsUrl ?? current.gatewayWsUrl,
    gatewayAuthToken: patch.gatewayAuthToken ?? current.gatewayAuthToken,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS]: next });
  return next;
}

export async function getGatewaySettings(): Promise<GatewayConnectionSettings> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/openclaw/settings`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await readJson<{ settings?: any }>(response);
    const settings = data?.settings || {};

    return {
      gatewayWsUrl: normalizeString(settings.wsUrl, DEFAULT_GATEWAY_SETTINGS.gatewayWsUrl),
      gatewayAuthToken: normalizeString(settings.authToken, ''),
      // Native-server reports last test info; map it to existing UI fields.
      lastConnectedAt: normalizeNullableString(settings.lastTestOkAt),
      lastConnectionError: normalizeNullableString(settings.lastTestError),
      deviceId: normalizeNullableString(settings.deviceId),
    };
  } catch {
    return await getGatewaySettingsFromLocalStorage();
  }
}

export async function setGatewaySettings(
  patch: Partial<GatewayConnectionSettings>,
): Promise<GatewayConnectionSettings> {
  try {
    const port = await getNativeServerPort();

    const body: Record<string, unknown> = {};
    if (typeof patch.gatewayWsUrl === 'string') {
      body.wsUrl = patch.gatewayWsUrl;
    }
    if (typeof patch.gatewayAuthToken === 'string') {
      body.authToken = patch.gatewayAuthToken;
    }

    const response = await fetch(`http://127.0.0.1:${port}/agent/openclaw/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
    }

    return await getGatewaySettings();
  } catch {
    return await setGatewaySettingsToLocalStorage(patch);
  }
}

export async function getGatewayStatus(): Promise<GatewayConnectionStatus> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.OPENCLAW_GATEWAY_STATUS))[
      STORAGE_KEYS.OPENCLAW_GATEWAY_STATUS
    ] || {};

  return {
    connected: raw.connected === true,
    lastConnectedAt: normalizeNullableString(raw.lastConnectedAt),
    lastConnectionError: normalizeNullableString(raw.lastConnectionError),
    updatedAt: normalizeString(raw.updatedAt, DEFAULT_GATEWAY_STATUS.updatedAt),
  };
}

export async function setGatewayStatus(
  patch: Partial<GatewayConnectionStatus>,
): Promise<GatewayConnectionStatus> {
  const current = await getGatewayStatus();
  const next: GatewayConnectionStatus = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.OPENCLAW_GATEWAY_STATUS]: next });

  // Mirror status on settings for options UI convenience.
  await setGatewaySettings({
    lastConnectedAt: next.lastConnectedAt,
    lastConnectionError: next.lastConnectionError,
  });

  return next;
}

export async function getOrCreateGatewayDeviceId(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OPENCLAW_GATEWAY_DEVICE_ID);
  const existing = result[STORAGE_KEYS.OPENCLAW_GATEWAY_DEVICE_ID];
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return existing;
  }

  const deviceId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.OPENCLAW_GATEWAY_DEVICE_ID]: deviceId });
  await setGatewaySettings({ deviceId });
  return deviceId;
}

export async function isGatewayConfigured(): Promise<boolean> {
  const settings = await getGatewaySettings();
  const wsUrl = settings.gatewayWsUrl.trim();
  if (wsUrl.length === 0) {
    return false;
  }

  const token = settings.gatewayAuthToken.trim();
  if (token.length > 0) {
    return true;
  }

  // Auth token may be optional for localhost Gateway deployments.
  try {
    const url = new URL(wsUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

export function getDefaultGatewaySettings(): GatewayConnectionSettings {
  return { ...DEFAULT_GATEWAY_SETTINGS };
}
