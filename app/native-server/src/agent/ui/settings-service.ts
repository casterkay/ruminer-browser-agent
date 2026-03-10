import { getDb } from '../db/client';

export interface UiSettings {
  floatingIconEnabled: boolean;
  updatedAt: string;
}

const DEFAULT_SETTINGS: UiSettings = {
  floatingIconEnabled: true,
  updatedAt: new Date(0).toISOString(),
};

const SETTINGS_ROW_ID = 'default';

function normalizeBooleanString(value: unknown, fallback: boolean): boolean {
  if (value === '1' || value === 1 || value === true) return true;
  if (value === '0' || value === 0 || value === false) return false;
  return fallback;
}

function boolToSql(value: boolean): string {
  return value ? '1' : '0';
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export async function getUiSettings(): Promise<UiSettings> {
  const db = getDb();
  const row = db.get<{ floating_icon_enabled?: unknown; updated_at?: unknown }>(
    'SELECT floating_icon_enabled, updated_at FROM ui_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    floatingIconEnabled: normalizeBooleanString(row.floating_icon_enabled, true),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
  };
}

export async function updateUiSettings(
  patch: Partial<Pick<UiSettings, 'floatingIconEnabled'>>,
): Promise<UiSettings> {
  const current = await getUiSettings();
  const next: UiSettings = {
    ...current,
    floatingIconEnabled: patch.floatingIconEnabled ?? current.floatingIconEnabled,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO ui_settings (id, floating_icon_enabled, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       floating_icon_enabled = excluded.floating_icon_enabled,
       updated_at = excluded.updated_at
    `,
    [SETTINGS_ROW_ID, boolToSql(next.floatingIconEnabled), next.updatedAt],
  );

  return next;
}
