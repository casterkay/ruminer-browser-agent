import { getDb } from '../db/client';

export interface EmosSettings {
  baseUrl: string;
  apiKey: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: EmosSettings = {
  baseUrl: 'https://api.evermind.ai',
  apiKey: '',
  updatedAt: new Date(0).toISOString(),
};

const SETTINGS_ROW_ID = 'default';

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function getEmosSettings(): Promise<EmosSettings> {
  const db = getDb();
  const row = db.get<{ base_url?: unknown; api_key?: unknown; updated_at?: unknown }>(
    'SELECT base_url, api_key, updated_at FROM emos_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    baseUrl: normalizeString(row.base_url, DEFAULT_SETTINGS.baseUrl),
    apiKey: normalizeString(row.api_key, ''),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
  };
}

export async function updateEmosSettings(
  patch: Partial<Pick<EmosSettings, 'baseUrl' | 'apiKey'>>,
): Promise<EmosSettings> {
  const current = await getEmosSettings();
  const next: EmosSettings = {
    ...current,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    apiKey: patch.apiKey ?? current.apiKey,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO emos_settings (id, base_url, api_key, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       api_key = excluded.api_key,
       updated_at = excluded.updated_at
    `,
    [SETTINGS_ROW_ID, next.baseUrl, next.apiKey, next.updatedAt],
  );

  return next;
}
