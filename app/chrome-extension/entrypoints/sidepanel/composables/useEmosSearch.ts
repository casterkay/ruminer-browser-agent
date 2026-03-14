import {
  emosDeleteMemory,
  emosSearchMemories,
} from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-client';
import { getEmosSettings } from '@/entrypoints/shared/utils/emos-settings';
import { computed, ref, type Ref } from 'vue';

export interface MemoryItem {
  message_id: string;
  /** Raw EverMemOS event/memory id, for delete operations. */
  event_id?: string;
  content: string;
  sender?: string;
  sender_name?: string;
  role?: string;
  create_time?: string;
  group_id?: string;
  group_name?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryFilters {
  query: string;
  platform?: string | string[];
  speakers?: string[];
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
  clearCache: () => void;
  remove: (item: MemoryItem) => Promise<boolean>;
  selectItem: (item: MemoryItem | null) => void;
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

type CachedSearchResult = {
  items: MemoryItem[];
  expiresAt: number;
  lastAccessAt: number;
};

const EMOS_SEARCH_CACHE_TTL_MS = 30_000;
const EMOS_SEARCH_CACHE_MAX_ENTRIES = 50;
const emosSearchCache = new Map<string, CachedSearchResult | Promise<CachedSearchResult>>();
let lastEmosSettingsSignature = '';

function getSpeakerIdsForRequest(speakers?: string[]): string[] {
  return Array.from(
    new Set(
      (speakers && speakers.length > 0 ? speakers : [...DEFAULT_SPEAKER_IDS]).map((v) => v.trim()),
    ),
  ).filter((value) => value.length > 0);
}

function getSpeakerIdsForCache(speakers?: string[]): string[] {
  const ids = getSpeakerIdsForRequest(speakers);
  ids.sort((a, b) => a.localeCompare(b));
  return ids;
}

function buildSearchCacheKey(body: Record<string, unknown>, speakers?: string[]): string {
  const query = toTrimmedString(body.query);
  const startTime = toTrimmedString(body.start_time);
  const endTime = toTrimmedString(body.end_time);
  const limit =
    typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.trunc(body.limit) : 50;
  const speakerKey = getSpeakerIdsForCache(speakers).join(',');
  return [query, startTime, endTime, String(limit), speakerKey].join('\n');
}

function clearEmosSearchCache(): void {
  emosSearchCache.clear();
}

function pruneEmosSearchCache(now = Date.now()): void {
  for (const [key, entry] of emosSearchCache.entries()) {
    if (entry instanceof Promise) continue;
    if (entry.expiresAt <= now) {
      emosSearchCache.delete(key);
    }
  }

  const resolvedEntries = Array.from(emosSearchCache.entries()).filter(
    (candidate): candidate is [string, CachedSearchResult] => !(candidate[1] instanceof Promise),
  );

  if (resolvedEntries.length <= EMOS_SEARCH_CACHE_MAX_ENTRIES) return;

  resolvedEntries.sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const toEvict = resolvedEntries.length - EMOS_SEARCH_CACHE_MAX_ENTRIES;
  for (let i = 0; i < toEvict; i++) {
    emosSearchCache.delete(resolvedEntries[i][0]);
  }
}

async function fetchAndNormalizeSearchResult(
  body: Record<string, unknown>,
  speakers?: string[],
): Promise<MemoryItem[]> {
  const response = await fetchSearchResult(body, speakers);
  const rawList = extractRawItems(response);
  const normalized = rawList
    .map((raw) => normalizeItem(raw))
    .filter((item) => item.content.trim().length > 0);
  return Array.from(new Map(normalized.map((item) => [item.message_id, item])).values());
}

async function getCachedSearchResult(
  cacheKey: string,
  fetcher: () => Promise<MemoryItem[]>,
): Promise<MemoryItem[]> {
  const now = Date.now();
  const cached = emosSearchCache.get(cacheKey);

  if (cached && !(cached instanceof Promise)) {
    if (cached.expiresAt > now) {
      cached.lastAccessAt = now;
      return cached.items;
    }
    emosSearchCache.delete(cacheKey);
  }

  if (cached instanceof Promise) {
    const awaited = await cached;
    awaited.lastAccessAt = Date.now();
    return awaited.items;
  }

  const pending = (async () => {
    const items = await fetcher();
    const entry: CachedSearchResult = {
      items,
      expiresAt: Date.now() + EMOS_SEARCH_CACHE_TTL_MS,
      lastAccessAt: Date.now(),
    };
    return entry;
  })();

  emosSearchCache.set(cacheKey, pending);

  try {
    const entry = await pending;
    emosSearchCache.set(cacheKey, entry);
    pruneEmosSearchCache();
    return entry.items;
  } catch (error) {
    emosSearchCache.delete(cacheKey);
    throw error;
  }
}

function capitalizeSenderId(value: string): string {
  if (!value) return '';
  return value[0].toUpperCase() + value.slice(1);
}

function toDigitsTimestamp(value: string): string {
  const raw = toTrimmedString(value);
  if (!raw) return '';
  if (/^\d{14}$/.test(raw)) return raw;

  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      String(d.getUTCFullYear()),
      pad(d.getUTCMonth() + 1),
      pad(d.getUTCDate()),
      pad(d.getUTCHours()),
      pad(d.getUTCMinutes()),
      pad(d.getUTCSeconds()),
    ].join('');
  }

  const digits = raw.replace(/\D/g, '');
  return digits.length >= 14 ? digits.slice(0, 14) : digits;
}

function getRawSenderId(raw: any): string {
  const direct = toTrimmedString(raw?.sender) || toTrimmedString(raw?.user_id);
  if (direct) return direct;

  const metadata = raw?.metadata;
  if (metadata && typeof metadata === 'object') {
    const metaSender =
      toTrimmedString((metadata as any).sender) || toTrimmedString((metadata as any).user_id);
    if (metaSender) return metaSender;
  }

  return '';
}

function normalizeItem(raw: any): MemoryItem {
  const content =
    raw?.content ?? raw?.text ?? raw?.summary ?? raw?.memory ?? raw?.message ?? raw?.excerpt ?? '';

  const rawEventId = toTrimmedString(raw?.message_id || raw?.event_id || raw?.id || raw?.memory_id);
  const explicitMessageId = toTrimmedString(raw?.message_id);

  const createTime =
    typeof raw?.create_time === 'string'
      ? raw.create_time
      : typeof raw?.timestamp === 'string'
        ? raw.timestamp
        : undefined;

  const userId = getRawSenderId(raw);
  const digitsTs = createTime ? toDigitsTimestamp(createTime) : '';

  const messageId =
    explicitMessageId ||
    (rawEventId && userId && digitsTs ? `emos:${userId}:${digitsTs}` : '') ||
    (raw?.group_id && (raw?.timestamp || raw?.create_time)
      ? `${raw.group_id}:${raw.timestamp || raw.create_time}`
      : '') ||
    rawEventId ||
    crypto.randomUUID();

  return {
    message_id: messageId,
    ...(rawEventId ? { event_id: rawEventId } : {}),
    content: String(content || ''),
    sender: (() => {
      const senderId = getRawSenderId(raw);
      return senderId || undefined;
    })(),
    sender_name: (() => {
      const explicit = toTrimmedString(raw?.sender_name);
      if (explicit) return explicit;
      const senderId = getRawSenderId(raw);
      return senderId ? capitalizeSenderId(senderId) : undefined;
    })(),
    role: typeof raw?.role === 'string' ? raw.role : undefined,
    create_time: createTime,
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
    source_url:
      typeof raw?.source_url === 'string'
        ? raw.source_url
        : typeof raw?.url === 'string'
          ? raw.url
          : undefined,
    metadata: raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
  };
}

const DEFAULT_SPEAKER_IDS = ['me', 'bot'] as const;

async function fetchSearchResult(body: Record<string, unknown>, speakers?: string[]): Promise<any> {
  const userIds = getSpeakerIdsForRequest(speakers);
  if (userIds.length === 0) {
    return { result: { memories: [] } };
  }

  const requests = userIds.map(async (userId) => {
    const response = await emosSearchMemories({
      ...body,
      query: String(body.query || ''),
      user_id: userId,
    });
    return { userId, response };
  });

  const settled = await Promise.allSettled(requests);
  const fulfilled = settled
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value as { userId: string; response: any });

  if (fulfilled.length === 0) {
    const firstError = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstError?.reason instanceof Error
      ? firstError.reason
      : new Error(String(firstError?.reason ?? 'EMOS search failed'));
  }

  const merged = fulfilled
    .map(({ userId, response }) => {
      const rawItems = extractRawItems(response);
      return rawItems.map((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;

        // Ensure identity fields exist for UI + delete operations.
        const record = raw as Record<string, unknown>;
        const existingSender = toTrimmedString(record.sender) || toTrimmedString(record.user_id);
        if (!existingSender && userId) {
          record.sender = userId;
        }

        if (!toTrimmedString(record.sender_name)) {
          const senderId =
            toTrimmedString(record.sender) || toTrimmedString(record.user_id) || userId;
          if (senderId) {
            record.sender_name = capitalizeSenderId(senderId);
          }
        }

        return record;
      });
    })
    .flat();

  return { result: { memories: merged } };
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
    item.user_id,
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

function extractPlatformPrefix(item: MemoryItem): string {
  const groupId = (item.group_id || '').toLowerCase();
  if (groupId.includes(':')) return groupId.split(':')[0];
  const messageId = (item.message_id || '').toLowerCase();
  if (messageId.includes(':')) return messageId.split(':')[0];
  return '';
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
      isConfigured.value = !!settings.baseUrl.trim() && !!settings.apiKey.trim();

      if (!isConfigured.value) {
        clearEmosSearchCache();
        items.value = [];
        return;
      }

      const nextSignature = `${settings.baseUrl.trim()}\n${settings.apiKey.trim()}`;
      if (lastEmosSettingsSignature && lastEmosSettingsSignature !== nextSignature) {
        clearEmosSearchCache();
      }
      lastEmosSettingsSignature = nextSignature;

      const body: Record<string, unknown> = {
        query: filters.query || '',
        limit: 10,
      };

      if (filters.startDate) {
        body.start_time = filters.startDate;
      }
      if (filters.endDate) {
        body.end_time = filters.endDate;
      }

      pruneEmosSearchCache();
      const cacheKey = buildSearchCacheKey(body, filters.speakers);
      const deduped = await getCachedSearchResult(cacheKey, async () =>
        fetchAndNormalizeSearchResult(body, filters.speakers),
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
                const prefix = extractPlatformPrefix(item);
                return prefix ? platformFilters.includes(prefix) : false;
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
      if (
        selectedItem.value &&
        !items.value.some((entry) => entry.message_id === selectedItem.value?.message_id)
      ) {
        selectedItem.value = null;
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      items.value = [];
    } finally {
      loading.value = false;
    }
  }

  function clearCache(): void {
    clearEmosSearchCache();
  }

  async function remove(item: MemoryItem): Promise<boolean> {
    try {
      const userId = (() => {
        const direct = toTrimmedString(item.sender);
        if (direct) return direct;
        const meta = item.metadata;
        if (meta && typeof meta === 'object') {
          const fromMeta =
            toTrimmedString((meta as any).user_id) || toTrimmedString((meta as any).sender);
          if (fromMeta) return fromMeta;
        }
        return '';
      })();

      await emosDeleteMemory({
        event_id: item.event_id || item.message_id,
        user_id: userId || undefined,
        group_id: item.group_id,
      });

      for (const [cacheKey, entry] of emosSearchCache.entries()) {
        if (entry instanceof Promise) continue;
        if (entry.items.some((candidate) => candidate.message_id === item.message_id)) {
          entry.items = entry.items.filter((candidate) => candidate.message_id !== item.message_id);
        }
      }

      items.value = items.value.filter((entry) => entry.message_id !== item.message_id);
      if (selectedItem.value?.message_id === item.message_id) {
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
    clearCache,
    remove,
    selectItem,
  };
}
