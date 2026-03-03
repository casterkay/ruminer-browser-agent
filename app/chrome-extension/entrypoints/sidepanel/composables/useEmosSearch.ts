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
  return {
    id: String(raw.id || raw.message_id || crypto.randomUUID()),
    message_id: String(raw.message_id || raw.id || ''),
    content: String(raw.content || raw.text || ''),
    sender: typeof raw.sender === 'string' ? raw.sender : undefined,
    create_time: typeof raw.create_time === 'string' ? raw.create_time : undefined,
    group_id: typeof raw.group_id === 'string' ? raw.group_id : undefined,
    group_name: typeof raw.group_name === 'string' ? raw.group_name : undefined,
    canonical_url: typeof raw.canonical_url === 'string' ? raw.canonical_url : undefined,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
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

  // Build query string from body params - always include user_id (required by API)
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
  console.log('[EMOS Search] Response:', { status: response.status, json });

  if (!response.ok) {
    throw new Error(`EMOS search failed (${response.status}) ${JSON.stringify(json)}`);
  }

  console.log('[EMOS Search] Memories count:', json?.memories?.length ?? json?.items?.length ?? 0);
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
      console.log('[EMOS Search] Settings:', {
        baseUrl: settings.baseUrl ? '(set)' : '(empty)',
        apiKey: settings.apiKey ? '(set)' : '(empty)',
        userId: settings.userId || '(empty)',
      });
      isConfigured.value =
        !!settings.baseUrl.trim() && !!settings.apiKey.trim() && !!settings.userId.trim();

      console.log('[EMOS Search] isConfigured:', isConfigured.value);

      if (!isConfigured.value) {
        items.value = [];
        return;
      }

      const body: Record<string, unknown> = {
        query: filters.query || '',
        limit: 50,
      };

      if (filters.platform) {
        body.group_id = `${filters.platform}:`;
      }
      if (filters.startDate) {
        body.start_time = filters.startDate;
      }
      if (filters.endDate) {
        body.end_time = filters.endDate;
      }

      const response = await fetchSearchResult(body);
      console.log('[EMOS Search] Raw response:', response);
      console.log('[EMOS Search] Response data:', JSON.stringify(response, null, 2));

      // Extract items from response - check multiple possible locations
      let rawList: any[] = [];

      // Check for memories array
      if (Array.isArray(response.memories)) {
        rawList = response.memories;
      }
      // Check for items array
      else if (Array.isArray(response.items)) {
        rawList = response.items;
      }
      // Check for data.memories array
      else if (Array.isArray(response.data?.memories)) {
        rawList = response.data.memories;
      }
      // Check for data.items array
      else if (Array.isArray(response.data?.items)) {
        rawList = response.data.items;
      }
      // Check for data array (assuming it might be nested)
      else if (Array.isArray(response.data)) {
        rawList = response.data;
      }

      console.log(
        '[EMOS Search] Extracted',
        rawList.length,
        'items from',
        rawList.length,
        ' items',
      );
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
