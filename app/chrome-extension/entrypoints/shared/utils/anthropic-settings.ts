import { getNativeServerPort, normalizeString, readJson } from './settings-internals';

export interface AnthropicSettings {
  baseUrl: string;
  authToken: string;
  updatedAt: string | null;
}

const DEFAULT_SETTINGS: AnthropicSettings = {
  baseUrl: '',
  authToken: '',
  updatedAt: null,
};

async function getAnthropicSettingsFromLocalStorage(): Promise<AnthropicSettings> {
  const raw = (await chrome.storage.local.get(['anthropicSettings'])).anthropicSettings || {};
  return {
    baseUrl: normalizeString(raw.baseUrl, DEFAULT_SETTINGS.baseUrl),
    authToken: normalizeString(raw.authToken, DEFAULT_SETTINGS.authToken),
    updatedAt: normalizeString(raw.updatedAt, '') || null,
  };
}

async function setAnthropicSettingsToLocalStorage(
  patch: Partial<Pick<AnthropicSettings, 'baseUrl' | 'authToken'>>,
): Promise<AnthropicSettings> {
  const current = await getAnthropicSettingsFromLocalStorage();
  const next: AnthropicSettings = {
    ...current,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    authToken: patch.authToken ?? current.authToken,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ anthropicSettings: next });
  return next;
}

export async function getAnthropicSettings(): Promise<AnthropicSettings> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/anthropic/settings`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await readJson<{ settings?: any }>(response);
    const settings = data?.settings || {};

    return {
      baseUrl: normalizeString(settings.baseUrl, DEFAULT_SETTINGS.baseUrl),
      authToken: normalizeString(settings.authToken, DEFAULT_SETTINGS.authToken),
      updatedAt: normalizeString(settings.updatedAt, '') || null,
    };
  } catch {
    return await getAnthropicSettingsFromLocalStorage();
  }
}

export async function setAnthropicSettings(
  patch: Partial<Pick<AnthropicSettings, 'baseUrl' | 'authToken'>>,
): Promise<AnthropicSettings> {
  try {
    const port = await getNativeServerPort();

    const body: Record<string, unknown> = {};
    if (typeof patch.baseUrl === 'string') body.baseUrl = patch.baseUrl;
    if (typeof patch.authToken === 'string') body.authToken = patch.authToken;

    const response = await fetch(`http://127.0.0.1:${port}/agent/anthropic/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
    }

    // Keep a local mirror for UX/fallback when native-server isn't available.
    const next = await getAnthropicSettings();
    await chrome.storage.local.set({ anthropicSettings: next });
    return next;
  } catch {
    return await setAnthropicSettingsToLocalStorage(patch);
  }
}
