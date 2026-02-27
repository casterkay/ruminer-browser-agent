import { getEmosSettings } from '@/entrypoints/shared/utils/openclaw-settings';

export interface EmosSingleMessage {
  message_id: string;
  create_time: string;
  sender: string;
  content: string;
  group_id: string;
  group_name?: string;
  sender_name?: string;
  role?: string | null;
  refer_list?: string[];
}

export interface EmosSearchRequest {
  query: string;
  group_id?: string;
  limit?: number;
  retrieve_method?: string;
  [key: string]: unknown;
}

export interface EmosSearchResponse {
  memories?: unknown[];
  total?: number;
  [key: string]: unknown;
}

function ensureBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

async function buildHeaders(): Promise<Record<string, string>> {
  const settings = await getEmosSettings();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  };

  if (settings.tenantId) {
    headers['X-Tenant-Id'] = settings.tenantId;
  }
  if (settings.spaceId) {
    headers['X-Space-Id'] = settings.spaceId;
  }

  return headers;
}

async function getBaseUrl(): Promise<string> {
  const settings = await getEmosSettings();
  if (!settings.baseUrl.trim()) {
    throw new Error('EMOS base URL is not configured');
  }
  if (!settings.apiKey.trim()) {
    throw new Error('EMOS API key is not configured');
  }
  return ensureBaseUrl(settings.baseUrl);
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function emosUpsertMemory(message: EmosSingleMessage): Promise<unknown> {
  const baseUrl = await getBaseUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${baseUrl}/api/v1/memories`, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`EMOS upsert failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function emosSearchMemories(body: EmosSearchRequest): Promise<EmosSearchResponse> {
  const baseUrl = await getBaseUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${baseUrl}/api/v1/memories/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const payload = (await parseJsonResponse(response)) as EmosSearchResponse;
  if (!response.ok) {
    throw new Error(`EMOS search failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload || {};
}

export async function emosDeleteMemory(messageId: string): Promise<unknown> {
  const baseUrl = await getBaseUrl();
  const headers = await buildHeaders();

  const response = await fetch(`${baseUrl}/api/v1/memories/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
    headers,
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`EMOS delete failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function emosTestConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await emosSearchMemories({ query: 'ping', limit: 1 });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
