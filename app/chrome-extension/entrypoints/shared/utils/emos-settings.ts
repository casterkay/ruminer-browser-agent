import { STORAGE_KEYS } from '@/common/constants';
import {
  getNativeServerPort,
  normalizeNullableString,
  normalizeString,
  readJson,
} from './settings-internals';

export interface EmosConnectionSettings {
  baseUrl: string;
  apiKey: string;
  lastTestOkAt: string | null;
  lastTestError: string | null;
}

const DEFAULT_EMOS_SETTINGS: EmosConnectionSettings = {
  baseUrl: 'https://api.evermind.ai',
  apiKey: '',
  lastTestOkAt: null,
  lastTestError: null,
};

async function getEmosApiKeyFromNativeServer(): Promise<string | null> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/emos/settings`, {
      method: 'GET',
    });
    if (!response.ok) {
      return null;
    }
    const data = await readJson<{ settings?: any }>(response);
    const apiKey = normalizeString(data?.settings?.apiKey, '');
    return apiKey;
  } catch {
    return null;
  }
}

export async function getEmosSettings(): Promise<EmosConnectionSettings> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.EMOS_SETTINGS))[STORAGE_KEYS.EMOS_SETTINGS] || {};

  const nativeApiKey = await getEmosApiKeyFromNativeServer();
  const storedApiKey = normalizeString(raw.apiKey, '');
  const apiKey = nativeApiKey && nativeApiKey.trim().length > 0 ? nativeApiKey : storedApiKey;

  return {
    baseUrl: normalizeString(raw.baseUrl, DEFAULT_EMOS_SETTINGS.baseUrl),
    apiKey,
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

  // Best-effort: persist API key into native-server for durability across extension reinstalls.
  // Intentionally non-blocking so the UI can still save local settings even when native-server
  // isn't available.
  try {
    const port = await getNativeServerPort();
    await fetch(`http://127.0.0.1:${port}/agent/emos/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: next.apiKey }),
    });
  } catch {
    // ignore
  }

  return next;
}

export function getDefaultEmosSettings(): EmosConnectionSettings {
  return { ...DEFAULT_EMOS_SETTINGS };
}
