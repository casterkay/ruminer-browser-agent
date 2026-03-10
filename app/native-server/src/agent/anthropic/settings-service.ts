import { getDb } from '../db/client';

export interface AnthropicSettings {
  baseUrl: string;
  authToken: string;
  updatedAt: string;
}

const DEFAULT_SETTINGS: AnthropicSettings = {
  baseUrl: '',
  authToken: '',
  updatedAt: new Date(0).toISOString(),
};

const SETTINGS_ROW_ID = 'default';

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function getAnthropicSettings(): Promise<AnthropicSettings> {
  const db = getDb();
  const row = db.get<{ base_url?: unknown; auth_token?: unknown; updated_at?: unknown }>(
    'SELECT base_url, auth_token, updated_at FROM anthropic_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    baseUrl: normalizeString(row.base_url, DEFAULT_SETTINGS.baseUrl),
    authToken: normalizeString(row.auth_token, ''),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
  };
}

export async function updateAnthropicSettings(
  patch: Partial<Pick<AnthropicSettings, 'baseUrl' | 'authToken'>>,
): Promise<AnthropicSettings> {
  const current = await getAnthropicSettings();
  const next: AnthropicSettings = {
    ...current,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    authToken: patch.authToken ?? current.authToken,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO anthropic_settings (id, base_url, auth_token, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       auth_token = excluded.auth_token,
       updated_at = excluded.updated_at
    `,
    [SETTINGS_ROW_ID, next.baseUrl, next.authToken, next.updatedAt],
  );

  return next;
}
