import { getDb } from '../db/client';

export interface HermesSettings {
  baseUrl: string;
  apiKey: string;
  workspaceRoot: string;
  updatedAt: string;
  lastTestOkAt: string | null;
  lastTestError: string | null;
}

const DEFAULT_SETTINGS: HermesSettings = {
  baseUrl: '',
  apiKey: '',
  workspaceRoot: '',
  updatedAt: new Date(0).toISOString(),
  lastTestOkAt: null,
  lastTestError: null,
};

const SETTINGS_ROW_ID = 'default';

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export async function getHermesSettings(): Promise<HermesSettings> {
  const db = getDb();
  const row = db.get<{
    base_url?: unknown;
    api_key?: unknown;
    workspace_root?: unknown;
    updated_at?: unknown;
    last_test_ok_at?: unknown;
    last_test_error?: unknown;
  }>(
    `SELECT base_url, api_key, workspace_root, updated_at, last_test_ok_at, last_test_error
     FROM hermes_settings
     WHERE id = ?`,
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    baseUrl: normalizeString(row.base_url, DEFAULT_SETTINGS.baseUrl),
    apiKey: normalizeString(row.api_key, DEFAULT_SETTINGS.apiKey),
    workspaceRoot: normalizeString(row.workspace_root, DEFAULT_SETTINGS.workspaceRoot),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
    lastTestOkAt: normalizeNullableString(row.last_test_ok_at),
    lastTestError: normalizeNullableString(row.last_test_error),
  };
}

export async function updateHermesSettings(
  patch: Partial<Pick<HermesSettings, 'baseUrl' | 'apiKey' | 'workspaceRoot'>>,
): Promise<HermesSettings> {
  const current = await getHermesSettings();
  const next: HermesSettings = {
    ...current,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    apiKey: patch.apiKey ?? current.apiKey,
    workspaceRoot: patch.workspaceRoot ?? current.workspaceRoot,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO hermes_settings (
       id, base_url, api_key, workspace_root, updated_at, last_test_ok_at, last_test_error
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       api_key = excluded.api_key,
       workspace_root = excluded.workspace_root,
       updated_at = excluded.updated_at,
       last_test_ok_at = excluded.last_test_ok_at,
       last_test_error = excluded.last_test_error
    `,
    [
      SETTINGS_ROW_ID,
      next.baseUrl,
      next.apiKey,
      next.workspaceRoot,
      next.updatedAt,
      next.lastTestOkAt,
      next.lastTestError,
    ],
  );

  return next;
}

export async function recordHermesTestResult(input: {
  ok: boolean;
  message: string | null;
}): Promise<HermesSettings> {
  const current = await getHermesSettings();
  const next: HermesSettings = {
    ...current,
    updatedAt: new Date().toISOString(),
    lastTestOkAt: input.ok ? new Date().toISOString() : current.lastTestOkAt,
    lastTestError: input.ok ? null : input.message || 'Unknown error',
  };

  const db = getDb();
  db.run(
    `INSERT INTO hermes_settings (
       id, base_url, api_key, workspace_root, updated_at, last_test_ok_at, last_test_error
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       base_url = excluded.base_url,
       api_key = excluded.api_key,
       workspace_root = excluded.workspace_root,
       updated_at = excluded.updated_at,
       last_test_ok_at = excluded.last_test_ok_at,
       last_test_error = excluded.last_test_error
    `,
    [
      SETTINGS_ROW_ID,
      next.baseUrl,
      next.apiKey,
      next.workspaceRoot,
      next.updatedAt,
      next.lastTestOkAt,
      next.lastTestError,
    ],
  );

  return next;
}
