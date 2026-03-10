import { emosSearchMemories } from '@/entrypoints/background/ruminer/emos-client';
import { computed, onUnmounted, ref, type Ref } from 'vue';

export interface MemorySuggestion {
  id: string;
  messageId?: string;
  content: string;
  sender?: string;
  createTime?: string;
  groupId?: string;
  groupName?: string;
  canonicalUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UseEmosSuggestions {
  query: Ref<string>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  suggestions: Ref<MemorySuggestion[]>;
  hasSuggestions: Ref<boolean>;
  updateQuery: (value: string) => void;
  clear: () => void;
}

const DEBOUNCE_MS = 500;
const MIN_QUERY_LENGTH = 3;
const SEARCH_LIMIT = 10;

function normalizeSuggestion(raw: any): MemorySuggestion {
  const content =
    raw.content || raw.text || raw.summary || raw.memory || raw.message || raw.excerpt;
  const fallbackId = [raw.group_id, raw.create_time || raw.timestamp, raw.sender, content]
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .join(':');

  return {
    id: String(raw.message_id || raw.id || raw.memory_id || fallbackId || crypto.randomUUID()),
    messageId:
      typeof raw.message_id === 'string'
        ? raw.message_id
        : typeof raw.id === 'string'
          ? raw.id
          : undefined,
    content: String(content || ''),
    sender: typeof raw.sender === 'string' ? raw.sender : undefined,
    createTime:
      typeof raw.create_time === 'string'
        ? raw.create_time
        : typeof raw.timestamp === 'string'
          ? raw.timestamp
          : undefined,
    groupId: typeof raw.group_id === 'string' ? raw.group_id : undefined,
    groupName:
      typeof raw.group_name === 'string'
        ? raw.group_name
        : typeof raw.group?.name === 'string'
          ? raw.group.name
          : raw.metadata &&
              typeof raw.metadata === 'object' &&
              typeof raw.metadata.group_name === 'string'
            ? raw.metadata.group_name
            : raw.metadata &&
                typeof raw.metadata === 'object' &&
                typeof raw.metadata.title === 'string'
              ? raw.metadata.title
              : undefined,
    canonicalUrl:
      typeof raw.source_url === 'string'
        ? raw.source_url
        : typeof raw.url === 'string'
          ? raw.url
          : undefined,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
  };
}

function looksLikeMemorySuggestion(value: unknown): boolean {
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
    item.create_time,
    item.timestamp,
    item.sender,
    item.group_id,
  ].some((field) => field !== undefined);
}

function collectMemorySuggestions(value: unknown, output: any[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMemorySuggestions(entry, output);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (looksLikeMemorySuggestion(value)) {
    output.push(value);
    return;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    if (Array.isArray(nested) || (nested && typeof nested === 'object')) {
      collectMemorySuggestions(nested, output);
    }
  }
}

export function useEmosSuggestions(): UseEmosSuggestions {
  const query = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const suggestions = ref<MemorySuggestion[]>([]);

  let timer: ReturnType<typeof setTimeout> | null = null;

  const DEFAULT_SPEAKER_IDS = ['me'] as const;

  function getSearchUserIds(): string[] {
    return [...DEFAULT_SPEAKER_IDS];
  }

  function extractRawSuggestions(response: any): any[] {
    const result = response?.result || response;
    const rawItems: any[] = [];
    collectMemorySuggestions(result?.memories, rawItems);
    collectMemorySuggestions(result?.items, rawItems);
    collectMemorySuggestions(result?.pending_messages, rawItems);
    if (rawItems.length === 0) {
      collectMemorySuggestions(result, rawItems);
    }
    return rawItems;
  }

  async function runEmosSearch(queryText: string, userIds: string[]): Promise<any[]> {
    if (userIds.length === 0) {
      return [];
    }

    const requests = userIds.map(async (userId) => {
      const response = await emosSearchMemories({
        query: queryText,
        limit: SEARCH_LIMIT,
        user_id: userId,
      });
      return extractRawSuggestions(response);
    });

    const settled = await Promise.allSettled(requests);
    const fulfilled = settled
      .filter((entry): entry is PromiseFulfilledResult<any[]> => entry.status === 'fulfilled')
      .flatMap((entry) => entry.value);

    if (fulfilled.length === 0) {
      const firstError = settled.find(
        (entry): entry is PromiseRejectedResult => entry.status === 'rejected',
      );
      if (firstError?.reason) {
        throw firstError.reason;
      }
    }

    return fulfilled;
  }

  async function runSearch(text: string): Promise<void> {
    if (text.trim().length < MIN_QUERY_LENGTH) {
      suggestions.value = [];
      error.value = null;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const userIds = getSearchUserIds();
      const queryText = text.trim();
      const allRawItems = await runEmosSearch(queryText, userIds);

      const normalized = allRawItems
        .map((item) => normalizeSuggestion(item))
        .filter((item) => item.content.trim().length > 0);

      const deduped = Array.from(new Map(normalized.map((item) => [item.id, item])).values());
      suggestions.value = deduped.slice(0, SEARCH_LIMIT);
      error.value = null;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      suggestions.value = [];
    } finally {
      loading.value = false;
    }
  }

  function updateQuery(value: string): void {
    query.value = value;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    timer = setTimeout(() => {
      void runSearch(query.value);
    }, DEBOUNCE_MS);
  }

  function clear(): void {
    query.value = '';
    suggestions.value = [];
    error.value = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  onUnmounted(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  return {
    query,
    loading,
    error,
    suggestions,
    hasSuggestions: computed(() => suggestions.value.length > 0),
    updateQuery,
    clear,
  };
}
