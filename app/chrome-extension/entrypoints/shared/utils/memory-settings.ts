import { STORAGE_KEYS } from '@/common/constants';
import type {
  GetMemorySettingsResponse,
  MemoryBackendType,
  UpdateMemorySettingsRequest,
} from 'chrome-mcp-shared';

import { getNativeServerPort, normalizeString, readJson } from './settings-internals';

export interface MemoryConnectionSettings {
  backend: MemoryBackendType;
  localRootPath: string;
  qmdIndexPath: string;
  updatedAt: string;
}

const DEFAULT_MEMORY_SETTINGS: MemoryConnectionSettings = {
  backend: 'local_markdown_qmd',
  localRootPath: '',
  qmdIndexPath: '',
  updatedAt: new Date(0).toISOString(),
};

function normalizeMemoryBackend(value: unknown): MemoryBackendType {
  return value === 'evermemos' ? 'evermemos' : 'local_markdown_qmd';
}

async function getMemorySettingsFromLocalStorage(): Promise<MemoryConnectionSettings> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.MEMORY_SETTINGS))[STORAGE_KEYS.MEMORY_SETTINGS] ||
    {};

  return {
    backend: normalizeMemoryBackend(raw.backend),
    localRootPath: normalizeString(raw.localRootPath, DEFAULT_MEMORY_SETTINGS.localRootPath),
    qmdIndexPath: normalizeString(raw.qmdIndexPath, DEFAULT_MEMORY_SETTINGS.qmdIndexPath),
    updatedAt: normalizeString(raw.updatedAt, DEFAULT_MEMORY_SETTINGS.updatedAt),
  };
}

async function setMemorySettingsToLocalStorage(
  patch: Partial<MemoryConnectionSettings>,
): Promise<MemoryConnectionSettings> {
  const current = await getMemorySettingsFromLocalStorage();
  const next: MemoryConnectionSettings = {
    ...current,
    ...patch,
    backend: patch.backend ?? current.backend,
    localRootPath: patch.localRootPath ?? current.localRootPath,
    qmdIndexPath: patch.qmdIndexPath ?? current.qmdIndexPath,
    updatedAt: patch.updatedAt ?? new Date().toISOString(),
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.MEMORY_SETTINGS]: next });
  return next;
}

export async function getMemorySettings(): Promise<MemoryConnectionSettings> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/memory/settings`, {
      method: 'GET',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await readJson<GetMemorySettingsResponse>(response);
    const settings = data?.settings;
    const next: MemoryConnectionSettings = {
      backend: normalizeMemoryBackend(settings?.backend),
      localRootPath: normalizeString(settings?.localRootPath),
      qmdIndexPath: normalizeString(settings?.qmdIndexPath),
      updatedAt: normalizeString(settings?.updatedAt, DEFAULT_MEMORY_SETTINGS.updatedAt),
    };

    await chrome.storage.local.set({ [STORAGE_KEYS.MEMORY_SETTINGS]: next });
    return next;
  } catch {
    return await getMemorySettingsFromLocalStorage();
  }
}

export async function setMemorySettings(
  patch: Partial<Pick<MemoryConnectionSettings, 'backend' | 'localRootPath'>>,
): Promise<MemoryConnectionSettings> {
  try {
    const port = await getNativeServerPort();
    const body: UpdateMemorySettingsRequest = {};

    if (patch.backend) {
      body.backend = patch.backend;
    }
    if (typeof patch.localRootPath === 'string') {
      body.localRootPath = patch.localRootPath;
    }

    const response = await fetch(`http://127.0.0.1:${port}/agent/memory/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
    }

    return await getMemorySettings();
  } catch {
    return await setMemorySettingsToLocalStorage(patch);
  }
}

export function getDefaultMemorySettings(): MemoryConnectionSettings {
  return { ...DEFAULT_MEMORY_SETTINGS };
}
