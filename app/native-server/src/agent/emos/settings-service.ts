import { getDb } from '../db/client';

export interface EmosSettings {
  apiKey: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: EmosSettings = {
  apiKey: '',
  updatedAt: new Date(0).toISOString(),
};

const SETTINGS_ROW_ID = 'default';

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function getEmosSettings(): Promise<EmosSettings> {
  const db = getDb();
  const row = db.get<{ api_key?: unknown; updated_at?: unknown }>(
    'SELECT api_key, updated_at FROM emos_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    apiKey: normalizeString(row.api_key, ''),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
  };
}

export async function updateEmosSettings(
  patch: Partial<Pick<EmosSettings, 'apiKey'>>,
): Promise<EmosSettings> {
  const current = await getEmosSettings();
  const next: EmosSettings = {
    ...current,
    apiKey: patch.apiKey ?? current.apiKey,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO emos_settings (id, api_key, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       api_key = excluded.api_key,
       updated_at = excluded.updated_at
    `,
    [SETTINGS_ROW_ID, next.apiKey, next.updatedAt],
  );

  return next;
}
