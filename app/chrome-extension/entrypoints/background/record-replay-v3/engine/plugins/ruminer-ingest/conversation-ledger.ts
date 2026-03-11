export type ConversationLedgerStatus = 'ingested' | 'skipped' | 'failed';

export interface ConversationLedgerEntry {
  /** Primary key: `${platform}:${conversationId}` */
  group_id: string;
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek';
  conversation_id: string;
  conversation_url: string | null;
  conversation_title: string | null;
  status: ConversationLedgerStatus;
  /** Ordered list of sha256(stableJson({ role, content })) for each message index */
  message_hashes: string[];
  first_seen_at: string;
  last_seen_at: string;
  last_ingested_at: string | null;
  last_error: string | null;
}

export interface ConversationStatesQuery {
  groupIds: string[];
  tailSize: number;
}

export interface ConversationState {
  exists: boolean;
  status?: ConversationLedgerStatus;
  tailHashes?: string[];
}

const DB_NAME = 'ruminer_rr_v3';
const DB_VERSION = 1;
const STORE_NAME = 'conversation_ledger';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'group_id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('platform', 'platform', { unique: false });
      }
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

export async function getConversationStates(
  query: ConversationStatesQuery,
): Promise<Record<string, ConversationState>> {
  const groupIds = Array.isArray(query.groupIds)
    ? query.groupIds.map((g) => String(g || '').trim()).filter(Boolean)
    : [];
  const tailSizeRaw =
    typeof query.tailSize === 'number' && Number.isFinite(query.tailSize) ? query.tailSize : 0;
  const tailSize = Math.max(0, Math.floor(tailSizeRaw));

  if (groupIds.length === 0) return {};

  return withStore('readonly', async (store) => {
    const results = await Promise.all(
      groupIds.map(async (gid) => {
        const entry = await requestToPromise<ConversationLedgerEntry | undefined>(store.get(gid));
        if (!entry) return [gid, { exists: false } satisfies ConversationState] as const;

        const hashes = Array.isArray(entry.message_hashes) ? entry.message_hashes : [];
        const tailHashes = tailSize > 0 ? hashes.slice(-tailSize) : [];
        return [
          gid,
          {
            exists: true,
            status: entry.status,
            ...(tailSize > 0 ? { tailHashes } : {}),
          } satisfies ConversationState,
        ] as const;
      }),
    );

    return Object.fromEntries(results);
  });
}
