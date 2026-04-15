import { getNativeServerPort, readJson } from '@/entrypoints/shared/utils/settings-internals';

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
  source_platform?: string;
  conversation_id?: string;
  metadata?: Record<string, unknown>;
}

export type EmosRequestContext = {
  kind: 'native_memory';
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

export interface MemoryStatus {
  backend: 'local_markdown_qmd' | 'evermemos';
  configured: boolean;
  localRootPath: string;
  qmdIndexPath: string;
  qmdAvailable: boolean;
  qmdEnabled: boolean;
  totalDocuments: number;
  totalMessages: number;
  updatedAt: string;
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

async function getNativeServerBaseUrl(): Promise<string> {
  const port = await getNativeServerPort();
  return `http://127.0.0.1:${port}`;
}

async function requestNativeMemoryApi<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = await getNativeServerBaseUrl();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = await readJson<any>(response).catch(async () => {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  });

  if (!response.ok) {
    throw new Error(
      typeof payload === 'string'
        ? payload
        : JSON.stringify(payload?.error ? payload.error : payload),
    );
  }

  return payload as T;
}

export function createEmosRequestContext(_settings: {
  baseUrl: string;
  apiKey: string;
}): EmosRequestContext {
  return { kind: 'native_memory' };
}

export async function getEmosRequestContext(): Promise<EmosRequestContext> {
  return { kind: 'native_memory' };
}

export async function emosUpsertMemory(
  message: EmosSingleMessage,
  _ctx?: EmosRequestContext,
): Promise<unknown> {
  return requestNativeMemoryApi('/agent/memory/upsert', {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function emosSearchMemories(body: EmosSearchRequest): Promise<EmosSearchResponse> {
  return requestNativeMemoryApi<EmosSearchResponse>('/agent/memory/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface EmosDeleteFilters {
  event_id: string;
  user_id?: string;
  group_id?: string;
}

export async function emosDeleteMemory(filters: EmosDeleteFilters): Promise<unknown> {
  return requestNativeMemoryApi('/agent/memory/delete', {
    method: 'POST',
    body: JSON.stringify(filters),
  });
}

export async function emosGetMemories(paramsInput: EmosGetMemoriesRequest = {}): Promise<unknown> {
  return requestNativeMemoryApi('/agent/memory/read', {
    method: 'POST',
    body: JSON.stringify(paramsInput),
  });
}

export async function getMemoryStatus(): Promise<MemoryStatus> {
  const response = await requestNativeMemoryApi<{ status?: MemoryStatus }>('/agent/memory/status', {
    method: 'GET',
  });
  const status = response?.status;
  return {
    backend: status?.backend === 'evermemos' ? 'evermemos' : 'local_markdown_qmd',
    configured: Boolean(status?.configured),
    localRootPath: typeof status?.localRootPath === 'string' ? status.localRootPath : '',
    qmdIndexPath: typeof status?.qmdIndexPath === 'string' ? status.qmdIndexPath : '',
    qmdAvailable: Boolean(status?.qmdAvailable),
    qmdEnabled: Boolean(status?.qmdEnabled),
    totalDocuments:
      typeof status?.totalDocuments === 'number' && Number.isFinite(status.totalDocuments)
        ? status.totalDocuments
        : 0,
    totalMessages:
      typeof status?.totalMessages === 'number' && Number.isFinite(status.totalMessages)
        ? status.totalMessages
        : 0,
    updatedAt: typeof status?.updatedAt === 'string' ? status.updatedAt : new Date(0).toISOString(),
  };
}

export async function emosTestConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const status = await getMemoryStatus();
    if (!status.configured) {
      return { ok: false, error: 'Memory backend is not configured' };
    }
    await emosSearchMemories({ query: 'ping', limit: 1 });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
