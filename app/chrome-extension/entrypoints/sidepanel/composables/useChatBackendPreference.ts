import { STORAGE_KEYS } from '@/common/constants';
import { onMounted, onUnmounted, ref, type Ref } from 'vue';

export type SidepanelChatBackend = 'openclaw' | 'native';

function normalizeBackend(value: unknown): SidepanelChatBackend {
  return value === 'native' ? 'native' : 'openclaw';
}

export interface UseChatBackendPreference {
  backend: Ref<SidepanelChatBackend>;
  isReady: Ref<boolean>;
  setBackend: (backend: SidepanelChatBackend) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useChatBackendPreference(): UseChatBackendPreference {
  const backend = ref<SidepanelChatBackend>('openclaw');
  const isReady = ref(false);

  async function refresh(): Promise<void> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AGENT_BACKEND);
    backend.value = normalizeBackend(result[STORAGE_KEYS.AGENT_BACKEND]);
    isReady.value = true;
  }

  async function setBackend(next: SidepanelChatBackend): Promise<void> {
    backend.value = next;
    await chrome.storage.local.set({ [STORAGE_KEYS.AGENT_BACKEND]: next });
  }

  function handleStorageChange(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void {
    if (areaName !== 'local') {
      return;
    }
    const change = changes[STORAGE_KEYS.AGENT_BACKEND];
    if (!change) {
      return;
    }
    backend.value = normalizeBackend(change.newValue);
  }

  onMounted(() => {
    void refresh();
    chrome.storage.onChanged.addListener(handleStorageChange);
  });

  onUnmounted(() => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  });

  return {
    backend,
    isReady,
    setBackend,
    refresh,
  };
}
