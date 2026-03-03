import { computed, ref, type Ref } from 'vue';
import { getEmosSettings } from '@/entrypoints/shared/utils/openclaw-settings';

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
  platform?: string;
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

  if (!settings.userId.trim()) {
    throw new Error('EMOS User ID is not configured');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.apiKey}`,
  };

  // Build query string from body params - always include user_id (required by API).
  const params = new URLSearchParams();
  params.append('user_id', settings.userId.trim());
  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });

  const response = await fetch(
    `${settings.baseUrl.replace(/\/$/, '')}/api/v0/memories/search?${params.toString()}`,
    {
      method: 'GET',
      headers,
    },
  );

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`EMOS search failed (${response.status}) ${JSON.stringify(json)}`);
  }

  return json;
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

function extractRawItems(response: any): any[] {
  const root = response?.result ?? response?.data ?? response;

  const candidates = [
    root?.memories,
    root?.items,
    response?.memories,
    response?.items,
    root,
    response,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      // Some APIs return groups like: [{ episodic_memory: [...] }, ...]
      const flattened: any[] = [];
      for (const entry of candidate) {
        if (Array.isArray(entry)) {
          flattened.push(...entry);
          continue;
        }
        if (entry && typeof entry === 'object') {
          const values = Object.values(entry);
          const arrayValues = values.filter((value) => Array.isArray(value)) as any[][];
          if (arrayValues.length > 0) {
            for (const list of arrayValues) flattened.push(...list);
            continue;
          }
        }
        flattened.push(entry);
      }
      return flattened;
    }
  }

  return [];
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

      const platformPrefix = filters.platform?.trim().toLowerCase();
      const filteredByPlatform = platformPrefix
        ? normalized.filter((item) =>
            (item.group_id || '').toLowerCase().startsWith(`${platformPrefix}:`),
          )
        : normalized;

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
