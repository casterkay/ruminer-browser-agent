import { getNativeServerPort, normalizeString, readJson } from './settings-internals';

export interface HermesSettings {
  baseUrl: string;
  apiKey: string;
  workspaceRoot: string;
  updatedAt: string | null;
  lastTestOkAt: string | null;
  lastTestError: string | null;
}

const DEFAULT_SETTINGS: HermesSettings = {
  baseUrl: 'http://127.0.0.1:8642',
  apiKey: '',
  workspaceRoot: '',
  updatedAt: null,
  lastTestOkAt: null,
  lastTestError: null,
};

function normalizeBaseUrl(value: unknown, fallback = DEFAULT_SETTINGS.baseUrl): string {
  const normalized = normalizeString(value, fallback).trim();
  if (!normalized) return '';
  return normalized.replace(/\/+$/, '').replace(/\/v1$/, '');
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value, '').trim();
  return normalized || null;
}

function normalizeWorkspaceRoot(value: unknown, fallback = DEFAULT_SETTINGS.workspaceRoot): string {
  return normalizeString(value, fallback)
    .trim()
    .replace(/[\\/]+$/, '');
}

async function getHermesSettingsFromLocalStorage(): Promise<HermesSettings> {
  const raw = (await chrome.storage.local.get(['hermesSettings'])).hermesSettings || {};
  return {
    baseUrl: normalizeBaseUrl(raw.baseUrl, DEFAULT_SETTINGS.baseUrl),
    apiKey: normalizeString(raw.apiKey, DEFAULT_SETTINGS.apiKey),
    workspaceRoot: normalizeWorkspaceRoot(raw.workspaceRoot, DEFAULT_SETTINGS.workspaceRoot),
    updatedAt: normalizeNullableString(raw.updatedAt),
    lastTestOkAt: normalizeNullableString(raw.lastTestOkAt),
    lastTestError: normalizeNullableString(raw.lastTestError),
  };
}

async function setHermesSettingsToLocalStorage(
  patch: Partial<Pick<HermesSettings, 'baseUrl' | 'apiKey' | 'workspaceRoot'>>,
): Promise<HermesSettings> {
  const current = await getHermesSettingsFromLocalStorage();
  const next: HermesSettings = {
    ...current,
    baseUrl:
      typeof patch.baseUrl === 'string' ? normalizeBaseUrl(patch.baseUrl, '') : current.baseUrl,
    apiKey: typeof patch.apiKey === 'string' ? patch.apiKey : current.apiKey,
    workspaceRoot:
      typeof patch.workspaceRoot === 'string'
        ? normalizeWorkspaceRoot(patch.workspaceRoot, '')
        : current.workspaceRoot,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ hermesSettings: next });
  return next;
}

export async function getHermesSettings(): Promise<HermesSettings> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/hermes/settings`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await readJson<{ settings?: any }>(response);
    const settings = data?.settings || {};

    return {
      baseUrl: normalizeBaseUrl(settings.baseUrl, DEFAULT_SETTINGS.baseUrl),
      apiKey: normalizeString(settings.apiKey, DEFAULT_SETTINGS.apiKey),
      workspaceRoot: normalizeWorkspaceRoot(settings.workspaceRoot, DEFAULT_SETTINGS.workspaceRoot),
      updatedAt: normalizeNullableString(settings.updatedAt),
      lastTestOkAt: normalizeNullableString(settings.lastTestOkAt),
      lastTestError: normalizeNullableString(settings.lastTestError),
    };
  } catch {
    return await getHermesSettingsFromLocalStorage();
  }
}

export async function setHermesSettings(
  patch: Partial<Pick<HermesSettings, 'baseUrl' | 'apiKey' | 'workspaceRoot'>>,
): Promise<HermesSettings> {
  try {
    const port = await getNativeServerPort();
    const body: Record<string, unknown> = {};

    if (typeof patch.baseUrl === 'string') {
      body.baseUrl = normalizeBaseUrl(patch.baseUrl, '');
    }
    if (typeof patch.apiKey === 'string') {
      body.apiKey = patch.apiKey;
    }
    if (typeof patch.workspaceRoot === 'string') {
      body.workspaceRoot = normalizeWorkspaceRoot(patch.workspaceRoot, '');
    }

    const response = await fetch(`http://127.0.0.1:${port}/agent/hermes/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
    }

    const next = await getHermesSettings();
    await chrome.storage.local.set({ hermesSettings: next });
    return next;
  } catch {
    return await setHermesSettingsToLocalStorage(patch);
  }
}
