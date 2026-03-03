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
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${settings.apiKey}`,
  };
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

  const response = await fetch(`${baseUrl}/api/v0/memories`, {
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
  const settings = await getEmosSettings();
  const baseUrl = await getBaseUrl();
  const headers = await buildHeaders();

  // Build query string from body params
  const params = new URLSearchParams();
  if (body.query) params.append('query', body.query);
  if (body.group_id) params.append('group_id', body.group_id);
  if (body.limit) params.append('limit', String(body.limit));
  if (body.retrieve_method) params.append('retrieve_method', body.retrieve_method);
  // Always include user_id from settings (required by API)
  if (settings.userId.trim()) {
    params.append('user_id', settings.userId.trim());
  }
  // Add any additional params from body
  Object.entries(body).forEach(([key, value]) => {
    if (
      !['query', 'group_id', 'limit', 'retrieve_method', 'user_id'].includes(key) &&
      value !== undefined
    ) {
      params.append(key, String(value));
    }
  });

  const response = await fetch(`${baseUrl}/api/v0/memories/search?${params.toString()}`, {
    method: 'GET',
    headers,
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

  const response = await fetch(`${baseUrl}/api/v0/memories/${encodeURIComponent(messageId)}`, {
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
