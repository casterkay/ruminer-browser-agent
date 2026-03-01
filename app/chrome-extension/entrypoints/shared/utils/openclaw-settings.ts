import { OPENCLAW_DEFAULTS, STORAGE_KEYS } from '@/common/constants';

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

export interface EmosConnectionSettings {
  baseUrl: string;
  apiKey: string;
  lastTestOkAt: string | null;
  lastTestError: string | null;
}

const DEFAULT_GATEWAY_SETTINGS: GatewayConnectionSettings = {
  gatewayWsUrl: OPENCLAW_DEFAULTS.GATEWAY_WS_URL,
  gatewayAuthToken: '',
  lastConnectedAt: null,
  lastConnectionError: null,
  deviceId: null,
};

const DEFAULT_EMOS_SETTINGS: EmosConnectionSettings = {
  baseUrl: 'https://api.evermind.ai',
  apiKey: '',
  lastTestOkAt: null,
  lastTestError: null,
};

const DEFAULT_GATEWAY_STATUS: GatewayConnectionStatus = {
  connected: false,
  lastConnectedAt: null,
  lastConnectionError: null,
  updatedAt: new Date(0).toISOString(),
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export async function getGatewaySettings(): Promise<GatewayConnectionSettings> {
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

export async function setGatewaySettings(
  patch: Partial<GatewayConnectionSettings>,
): Promise<GatewayConnectionSettings> {
  const current = await getGatewaySettings();
  const next: GatewayConnectionSettings = {
    ...current,
    ...patch,
    gatewayWsUrl: patch.gatewayWsUrl ?? current.gatewayWsUrl,
    gatewayAuthToken: patch.gatewayAuthToken ?? current.gatewayAuthToken,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS]: next });
  return next;
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
  return settings.gatewayWsUrl.trim().length > 0 && settings.gatewayAuthToken.trim().length > 0;
}

export async function getEmosSettings(): Promise<EmosConnectionSettings> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.EMOS_SETTINGS))[STORAGE_KEYS.EMOS_SETTINGS] || {};
  return {
    baseUrl: normalizeString(raw.baseUrl, DEFAULT_EMOS_SETTINGS.baseUrl),
    apiKey: normalizeString(raw.apiKey, ''),
    lastTestOkAt: normalizeNullableString(raw.lastTestOkAt),
    lastTestError: normalizeNullableString(raw.lastTestError),
  };
}

export async function setEmosSettings(
  patch: Partial<EmosConnectionSettings>,
): Promise<EmosConnectionSettings> {
  const current = await getEmosSettings();
  const next: EmosConnectionSettings = {
    ...current,
    ...patch,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    apiKey: patch.apiKey ?? current.apiKey,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.EMOS_SETTINGS]: next });
  return next;
}

export function getDefaultGatewaySettings(): GatewayConnectionSettings {
  return { ...DEFAULT_GATEWAY_SETTINGS };
}

export function getDefaultEmosSettings(): EmosConnectionSettings {
  return { ...DEFAULT_EMOS_SETTINGS };
}
