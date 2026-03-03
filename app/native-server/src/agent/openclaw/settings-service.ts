import { getDb } from '../db/client';

export interface OpenClawGatewaySettings {
  wsUrl: string;
  authToken: string;
  updatedAt: string;
  lastTestOkAt: string | null;
  lastTestError: string | null;
}

const DEFAULT_SETTINGS: OpenClawGatewaySettings = {
  wsUrl: 'ws://127.0.0.1:18789',
  authToken: '',
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

export async function getOpenClawGatewaySettings(): Promise<OpenClawGatewaySettings> {
  const db = getDb();
  const row = db.get<{
    ws_url?: unknown;
    auth_token?: unknown;
    updated_at?: unknown;
    last_test_ok_at?: unknown;
    last_test_error?: unknown;
  }>(
    'SELECT ws_url, auth_token, updated_at, last_test_ok_at, last_test_error FROM openclaw_gateway_settings WHERE id = ?',
    [SETTINGS_ROW_ID],
  );

  if (!row) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    wsUrl: normalizeString(row.ws_url, DEFAULT_SETTINGS.wsUrl),
    authToken: normalizeString(row.auth_token, ''),
    updatedAt: normalizeString(row.updated_at, DEFAULT_SETTINGS.updatedAt),
    lastTestOkAt: normalizeNullableString(row.last_test_ok_at),
    lastTestError: normalizeNullableString(row.last_test_error),
  };
}

export async function updateOpenClawGatewaySettings(
  patch: Partial<Pick<OpenClawGatewaySettings, 'wsUrl' | 'authToken'>>,
): Promise<OpenClawGatewaySettings> {
  const current = await getOpenClawGatewaySettings();
  const next: OpenClawGatewaySettings = {
    ...current,
    wsUrl: patch.wsUrl ?? current.wsUrl,
    authToken: patch.authToken ?? current.authToken,
    updatedAt: new Date().toISOString(),
  };

  const db = getDb();
  db.run(
    `INSERT INTO openclaw_gateway_settings (id, ws_url, auth_token, updated_at, last_test_ok_at, last_test_error)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       ws_url = excluded.ws_url,
       auth_token = excluded.auth_token,
       updated_at = excluded.updated_at,
       last_test_ok_at = excluded.last_test_ok_at,
       last_test_error = excluded.last_test_error
    `,
    [
      SETTINGS_ROW_ID,
      next.wsUrl,
      next.authToken,
      next.updatedAt,
      next.lastTestOkAt,
      next.lastTestError,
    ],
  );

  return next;
}

export async function recordOpenClawGatewayTestResult(input: {
  ok: boolean;
  message: string | null;
}): Promise<OpenClawGatewaySettings> {
  const current = await getOpenClawGatewaySettings();
  const next: OpenClawGatewaySettings = {
    ...current,
    updatedAt: new Date().toISOString(),
    lastTestOkAt: input.ok ? new Date().toISOString() : current.lastTestOkAt,
    lastTestError: input.ok ? null : input.message || 'Unknown error',
  };

  const db = getDb();
  db.run(
    `INSERT INTO openclaw_gateway_settings (id, ws_url, auth_token, updated_at, last_test_ok_at, last_test_error)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       ws_url = excluded.ws_url,
       auth_token = excluded.auth_token,
       updated_at = excluded.updated_at,
       last_test_ok_at = excluded.last_test_ok_at,
       last_test_error = excluded.last_test_error
    `,
    [
      SETTINGS_ROW_ID,
      next.wsUrl,
      next.authToken,
      next.updatedAt,
      next.lastTestOkAt,
      next.lastTestError,
    ],
  );

  return next;
}
