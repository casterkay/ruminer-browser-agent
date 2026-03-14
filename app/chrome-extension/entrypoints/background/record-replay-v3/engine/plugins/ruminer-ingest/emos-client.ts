import { getEmosSettings } from '@/entrypoints/shared/utils/emos-settings';

export interface EmosSingleMessage {
  message_id: string;
  create_time: string;
  sender: string;
  content: string;
  group_id: string;
  group_name?: string;
  source_url?: string | null;
  sender_name?: string;
  role?: string | null;
  refer_list?: string[];
}

export type EmosRequestContext = {
  baseUrl: string;
  headers: Record<string, string>;
};

export interface EmosSearchRequest {
  query: string;
  user_id?: string;
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

export interface EmosGetMemoriesRequest {
  user_id?: string;
  group_id?: string;
  memory_type?: string;
  limit?: number;
  offset?: number;
  start_time?: string;
  end_time?: string;
  version_range?: string;
  [key: string]: unknown;
}

function ensureBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function createEmosRequestContext(settings: {
  baseUrl: string;
  apiKey: string;
}): EmosRequestContext {
  const baseUrl = ensureBaseUrl(String(settings.baseUrl || '').trim());
  const apiKey = String(settings.apiKey || '').trim();
  if (!baseUrl) throw new Error('EMOS base URL is not configured');
  if (!apiKey) throw new Error('EMOS API key is not configured');
  return {
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

export async function getEmosRequestContext(): Promise<EmosRequestContext> {
  const settings = await getEmosSettings();
  return createEmosRequestContext({ baseUrl: settings.baseUrl, apiKey: settings.apiKey });
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function emosUpsertMemory(
  message: EmosSingleMessage,
  ctx?: EmosRequestContext,
): Promise<unknown> {
  const request = ctx ?? (await getEmosRequestContext());

  const response = await fetch(`${request.baseUrl}/api/v0/memories`, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(message),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`EMOS upsert failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function emosSearchMemories(body: EmosSearchRequest): Promise<EmosSearchResponse> {
  const request = await getEmosRequestContext();

  // Build query string from body params
  const params = new URLSearchParams();
  if (body.query) params.append('query', body.query);
  if (body.group_id) params.append('group_id', body.group_id);
  if (body.limit) params.append('limit', String(body.limit));
  if (body.retrieve_method) params.append('retrieve_method', body.retrieve_method);
  const requestedUserId =
    typeof body.user_id === 'string' && body.user_id.trim() ? body.user_id.trim() : '';
  if (requestedUserId) params.append('user_id', requestedUserId);
  // Add any additional params from body
  Object.entries(body).forEach(([key, value]) => {
    if (
      !['query', 'group_id', 'limit', 'retrieve_method', 'user_id'].includes(key) &&
      value !== undefined
    ) {
      params.append(key, String(value));
    }
  });

  const response = await fetch(`${request.baseUrl}/api/v0/memories/search?${params.toString()}`, {
    method: 'GET',
    headers: request.headers,
  });

  const payload = (await parseJsonResponse(response)) as EmosSearchResponse;
  if (!response.ok) {
    throw new Error(`EMOS search failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload || {};
}

export interface EmosDeleteFilters {
  event_id: string;
  user_id?: string;
  group_id?: string;
}

export async function emosDeleteMemory(filters: EmosDeleteFilters): Promise<unknown> {
  const request = await getEmosRequestContext();

  const body: Record<string, string> = { event_id: filters.event_id };
  if (filters.user_id) body.user_id = filters.user_id;
  if (filters.group_id) body.group_id = filters.group_id;

  const response = await fetch(`${request.baseUrl}/api/v0/memories`, {
    method: 'DELETE',
    headers: request.headers,
    body: JSON.stringify(body),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`EMOS delete failed (${response.status}) ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function emosGetMemories(paramsInput: EmosGetMemoriesRequest = {}): Promise<unknown> {
  const request = await getEmosRequestContext();

  const params = new URLSearchParams();
  if (paramsInput.group_id) params.append('group_id', paramsInput.group_id);
  if (paramsInput.memory_type) params.append('memory_type', paramsInput.memory_type);
  if (typeof paramsInput.limit === 'number') params.append('limit', String(paramsInput.limit));
  if (typeof paramsInput.offset === 'number') params.append('offset', String(paramsInput.offset));
  if (paramsInput.start_time) params.append('start_time', paramsInput.start_time);
  if (paramsInput.end_time) params.append('end_time', paramsInput.end_time);
  if (paramsInput.version_range) params.append('version_range', paramsInput.version_range);

  const requestedUserId =
    typeof paramsInput.user_id === 'string' && paramsInput.user_id.trim()
      ? paramsInput.user_id.trim()
      : '';
  if (requestedUserId) params.append('user_id', requestedUserId);

  Object.entries(paramsInput).forEach(([key, value]) => {
    if (
      ![
        'user_id',
        'group_id',
        'memory_type',
        'limit',
        'offset',
        'start_time',
        'end_time',
        'version_range',
      ].includes(key) &&
      value !== undefined
    ) {
      params.append(key, String(value));
    }
  });

  const response = await fetch(`${request.baseUrl}/api/v0/memories?${params.toString()}`, {
    method: 'GET',
    headers: request.headers,
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`EMOS get memories failed (${response.status}) ${JSON.stringify(payload)}`);
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
