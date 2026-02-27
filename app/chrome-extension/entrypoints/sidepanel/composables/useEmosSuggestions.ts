import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { UseOpenClawGateway } from './useOpenClawGateway';

export interface MemorySuggestion {
  id: string;
  content: string;
  sender?: string;
  createTime?: string;
  groupId?: string;
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

function normalizeSuggestion(raw: any): MemorySuggestion {
  return {
    id: String(raw.message_id || raw.id || crypto.randomUUID()),
    content: String(raw.content || raw.text || ''),
    sender: typeof raw.sender === 'string' ? raw.sender : undefined,
    createTime: typeof raw.create_time === 'string' ? raw.create_time : undefined,
    groupId: typeof raw.group_id === 'string' ? raw.group_id : undefined,
  };
}

export function useEmosSuggestions(gateway: UseOpenClawGateway): UseEmosSuggestions {
  const query = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);
  const suggestions = ref<MemorySuggestion[]>([]);

  let timer: ReturnType<typeof setTimeout> | null = null;

  async function runSearch(text: string): Promise<void> {
    if (text.trim().length < MIN_QUERY_LENGTH) {
      suggestions.value = [];
      error.value = null;
      return;
    }

    if (!gateway.connected.value) {
      suggestions.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const response: any = await gateway.request('evermemos.searchMemory', {
        query: text.trim(),
        limit: 5,
      });

      const result = response?.result || response;
      const rawItems = Array.isArray(result?.memories)
        ? result.memories
        : Array.isArray(result?.items)
          ? result.items
          : Array.isArray(result)
            ? result
            : [];

      suggestions.value = rawItems
        .map((item) => normalizeSuggestion(item))
        .filter((item) => item.content);
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
