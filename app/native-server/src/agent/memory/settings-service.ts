import type { MemoryBackendType } from 'chrome-mcp-shared';

import { getDb } from '../db/client';
import { getDefaultMemoryStoreRoot, resolveMemoryStoreRoot } from '../storage';

export interface MemorySettings {
  backend: MemoryBackendType;
  localRootPath: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: MemorySettings = {
  backend: 'local_markdown_qmd',
  localRootPath: getDefaultMemoryStoreRoot(),
  updatedAt: new Date(0).toISOString(),
};

const SETTINGS_ROW_ID = 'default';

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBackend(value: unknown, fallback: MemoryBackendType): MemoryBackendType {
  return value === 'local_markdown_qmd' || value === 'evermemos' ? value : fallback;
}

export async function getMemorySettings(): Promise<MemorySettings> {
  const db = getDb();
  const row = db.get<{ backend?: unknown; local_root_path?: unknown; updated_at?: unknown }>(
    'SELECT backend, local_root_path, updated_at FROM memory_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    backend: normalizeBackend(row.backend, DEFAULT_SETTINGS.backend),
    localRootPath: resolveMemoryStoreRoot(
      normalizeString(row.local_root_path, DEFAULT_SETTINGS.localRootPath),
    ),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
  };
}

export async function updateMemorySettings(
  patch: Partial<Pick<MemorySettings, 'backend' | 'localRootPath'>>,
): Promise<MemorySettings> {
  const current = await getMemorySettings();
  const next: MemorySettings = {
    ...current,
    backend: patch.backend ?? current.backend,
    localRootPath: resolveMemoryStoreRoot(patch.localRootPath ?? current.localRootPath),
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO memory_settings (id, backend, local_root_path, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       backend = excluded.backend,
       local_root_path = excluded.local_root_path,
       updated_at = excluded.updated_at
    `,
    [SETTINGS_ROW_ID, next.backend, next.localRootPath, next.updatedAt],
  );

  return next;
}
