import { computed, ref, type Ref } from 'vue';
import { getEmosSettings } from '@/entrypoints/shared/utils/openclaw-settings';
import { emosSearchMemories } from '@/entrypoints/background/ruminer/emos-client';

export interface MemoryItem {
  id: string;
  message_id: string;
  content: string;
  sender?: string;
  create_time?: string;
  group_id?: string;
  group_name?: string;
  canonical_url?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryFilters {
  query: string;
  platform?: string | string[];
  startDate?: string;
  endDate?: string;
}

export interface UseEmosSearch {
  items: Ref<MemoryItem[]>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  selectedItem: Ref<MemoryItem | null>;
  isConfigured: Ref<boolean>;
  search: (filters: MemoryFilters) => Promise<void>;
  remove: (item: MemoryItem) => Promise<boolean>;
  selectItem: (item: MemoryItem | null) => void;
}

function normalizeItem(raw: any): MemoryItem {
  const content =
    raw?.content ?? raw?.text ?? raw?.summary ?? raw?.memory ?? raw?.message ?? raw?.excerpt ?? '';

  const stableIdCandidate =
    raw?.id ||
    raw?.message_id ||
    raw?.memory_id ||
    (raw?.group_id && (raw?.timestamp || raw?.create_time)
      ? `${raw.group_id}:${raw.timestamp || raw.create_time}`
      : null);

  const id = stableIdCandidate ? String(stableIdCandidate) : crypto.randomUUID();

  return {
    id,
    message_id: String(raw?.message_id || raw?.id || raw?.memory_id || id),
    content: String(content || ''),
    sender: typeof raw?.sender === 'string' ? raw.sender : undefined,
    create_time:
      typeof raw?.create_time === 'string'
        ? raw.create_time
        : typeof raw?.timestamp === 'string'
          ? raw.timestamp
          : undefined,
    group_id: typeof raw?.group_id === 'string' ? raw.group_id : undefined,
    group_name:
      typeof raw?.group_name === 'string'
        ? raw.group_name
        : typeof raw?.group?.name === 'string'
          ? raw.group.name
          : raw?.metadata &&
              typeof raw.metadata === 'object' &&
              typeof raw.metadata.group_name === 'string'
            ? raw.metadata.group_name
            : raw?.metadata &&
                typeof raw.metadata === 'object' &&
                typeof raw.metadata.title === 'string'
              ? raw.metadata.title
              : undefined,
    canonical_url:
      typeof raw?.canonical_url === 'string'
        ? raw.canonical_url
        : typeof raw?.url === 'string'
          ? raw.url
          : undefined,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
  };
}

async function fetchSearchResult(body: Record<string, unknown>): Promise<any> {
  const settings = await getEmosSettings();
  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    throw new Error('EMOS is not configured');
  }

  const userIds = Array.from(
    new Set([settings.userId.trim(), 'me'].filter((value) => value.length > 0)),
  );
  if (userIds.length === 0) {
    throw new Error('EMOS User ID is not configured');
  }

  const requests = userIds.map(async (userId) => {
    return emosSearchMemories({
      ...body,
      query: String(body.query || ''),
      user_id: userId,
    });
  });

  const settled = await Promise.allSettled(requests);
  const fulfilled = settled
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (fulfilled.length === 0) {
    const firstError = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new Error(String(firstError?.reason ?? 'EMOS search failed'));
  }

  return { result: { memories: fulfilled.map((entry) => extractRawItems(entry)).flat() } };
}

async function deleteMemory(messageId: string): Promise<void> {
  const settings = await getEmosSettings();
  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    throw new Error('EMOS is not configured');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
  };

  const response = await fetch(
    `${settings.baseUrl.replace(/\/$/, '')}/api/v0/memories/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(`EMOS delete failed (${response.status}) ${JSON.stringify(json)}`);
  }
}

function looksLikeMemoryItem(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return [
    item.message_id,
    item.id,
    item.memory_id,
    item.content,
    item.text,
    item.summary,
    item.memory,
    item.message,
    item.excerpt,
    item.timestamp,
    item.create_time,
    item.sender,
    item.group_id,
  ].some((field) => field !== undefined);
}

function collectMemoryItems(value: unknown, output: any[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMemoryItems(entry, output);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (looksLikeMemoryItem(value)) {
    output.push(value);
    return;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested) || (nested && typeof nested === 'object')) {
      collectMemoryItems(nested, output);
    }
  }
}

function extractRawItems(response: any): any[] {
  const root = response?.result ?? response?.data ?? response;
  const primaryCandidates = [
    root?.memories,
    root?.pending_messages,
    root?.items,
    response?.memories,
    response?.pending_messages,
    response?.items,
  ];

  const collected: any[] = [];
  for (const candidate of primaryCandidates) {
    collectMemoryItems(candidate, collected);
  }

  if (collected.length === 0) {
    collectMemoryItems(root, collected);
    collectMemoryItems(response, collected);
  }

  return collected;
}

function safeParseDate(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function useEmosSearch(): UseEmosSearch {
  const items = ref<MemoryItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedItem = ref<MemoryItem | null>(null);
  const isConfigured = ref(false);

  async function search(filters: MemoryFilters): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const settings = await getEmosSettings();
      isConfigured.value =
        !!settings.baseUrl.trim() && !!settings.apiKey.trim() && !!settings.userId.trim();

      if (!isConfigured.value) {
        items.value = [];
        return;
      }

      const body: Record<string, unknown> = {
        query: filters.query || '',
        limit: 50,
      };

      if (filters.startDate) {
        body.start_time = filters.startDate;
      }
      if (filters.endDate) {
        body.end_time = filters.endDate;
      }

      const response = await fetchSearchResult(body);

      const rawList = extractRawItems(response);
      const normalized = rawList
        .map((raw) => normalizeItem(raw))
        .filter((item) => item.content.trim().length > 0);
      const deduped = Array.from(
        new Map(normalized.map((item) => [item.message_id || item.id, item])).values(),
      );

      const explicitPlatformArray = Array.isArray(filters.platform);
      const platformFilters = (
        Array.isArray(filters.platform) ? filters.platform : [filters.platform || '']
      )
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

      const filteredByPlatform =
        explicitPlatformArray && platformFilters.length === 0
          ? []
          : platformFilters.length > 0
            ? deduped.filter((item) => {
                const groupId = (item.group_id || '').toLowerCase();
                return platformFilters.some((platform) => groupId.startsWith(`${platform}:`));
              })
            : deduped;

      const startMs = filters.startDate ? safeParseDate(`${filters.startDate}T00:00:00Z`) : null;
      const endMs = filters.endDate ? safeParseDate(`${filters.endDate}T23:59:59Z`) : null;

      const filteredByDate =
        startMs || endMs
          ? filteredByPlatform.filter((item) => {
              const createdMs = safeParseDate(item.create_time);
              if (createdMs === null) return true;
              if (startMs !== null && createdMs < startMs) return false;
              if (endMs !== null && createdMs > endMs) return false;
              return true;
            })
          : filteredByPlatform;

      items.value = filteredByDate;
      if (selectedItem.value && !items.value.some((entry) => entry.id === selectedItem.value?.id)) {
        selectedItem.value = null;
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      items.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function remove(item: MemoryItem): Promise<boolean> {
    try {
      await deleteMemory(item.message_id || item.id);
      items.value = items.value.filter((entry) => entry.id !== item.id);
      if (selectedItem.value?.id === item.id) {
        selectedItem.value = null;
      }
      return true;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      return false;
    }
  }

  function selectItem(item: MemoryItem | null): void {
    selectedItem.value = item;
  }

  return {
    items,
    loading,
    error,
    selectedItem,
    isConfigured: computed(() => isConfigured.value),
    search,
    remove,
    selectItem,
  };
}
