export type ConversationLedgerStatus = 'ingested' | 'failed';

export interface ConversationLedgerEntry {
  /** Primary key: `${platform}:${conversationId}` */
  group_id: string;
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek';
  conversation_id: string;
  conversation_url: string | null;
  conversation_title: string | null;
  /** Null means "known digest but not promoted to ingested/failed yet" (manual import). */
  status: ConversationLedgerStatus | null;
  /** sha256(stableJson([{ role, content }...])) for the whole message list. */
  messages_digest: string | null;
  message_count: number | null;
  first_seen_at: string;
  last_seen_at: string;
  last_ingested_at: string | null;
  last_error: string | null;
}

export interface ConversationStatesQuery {
  groupIds: string[];
}

export interface ConversationState {
  exists: boolean;
  status?: ConversationLedgerStatus | null;
  messageCount?: number | null;
  fullDigest?: string | null;
}

const DB_NAME = 'ruminer_rr_v3';
const DB_VERSION = 2;
const STORE_NAME = 'conversation_ledger';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      // No migration/backward compatibility: wipe and recreate the store.
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'group_id' });
      store.createIndex('status', 'status', { unique: false });
      store.createIndex('platform', 'platform', { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open conversation ledger DB'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        action(store)
          .then((value) => {
            tx.oncomplete = () => {
              db.close();
              resolve(value);
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error || new Error('Conversation ledger transaction failed'));
            };
          })
          .catch((error) => {
            db.close();
            reject(error);
          });
      }),
  );
}

export async function getConversationEntry(
  groupId: string,
): Promise<ConversationLedgerEntry | null> {
  const gid = groupId.trim();
  if (!gid) return null;

  return withStore('readonly', async (store) => {
    const result = await requestToPromise<ConversationLedgerEntry | undefined>(store.get(gid));
    return result || null;
  });
}

export async function upsertConversationEntry(entry: ConversationLedgerEntry): Promise<void> {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(entry));
  });
}

export async function listConversationEntries(): Promise<ConversationLedgerEntry[]> {
  return withStore('readonly', async (store) => {
    const result = await requestToPromise<ConversationLedgerEntry[]>(store.getAll());
    return Array.isArray(result) ? result : [];
  });
}

export async function getConversationStates(
  query: ConversationStatesQuery,
): Promise<Record<string, ConversationState>> {
  const groupIds = Array.isArray(query.groupIds)
    ? query.groupIds.map((g) => String(g || '').trim()).filter(Boolean)
    : [];

  if (groupIds.length === 0) return {};

  return withStore('readonly', async (store) => {
    const results = await Promise.all(
      groupIds.map(async (gid) => {
        const entry = await requestToPromise<ConversationLedgerEntry | undefined>(store.get(gid));
        if (!entry) return [gid, { exists: false } satisfies ConversationState] as const;

        const messageCount =
          typeof entry.message_count === 'number' && Number.isFinite(entry.message_count)
            ? Math.max(0, Math.floor(entry.message_count))
            : null;
        const fullDigest =
          typeof entry.messages_digest === 'string' && entry.messages_digest.trim()
            ? entry.messages_digest.trim()
            : null;
        return [
          gid,
          {
            exists: true,
            status: entry.status,
            messageCount,
            fullDigest,
          } satisfies ConversationState,
        ] as const;
      }),
    );

    return Object.fromEntries(results);
  });
}
