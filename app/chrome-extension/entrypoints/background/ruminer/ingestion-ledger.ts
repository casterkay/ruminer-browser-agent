export interface IngestionLedgerEntry {
  item_key: string;
  content_hash: string;
  canonical_url: string | null;
  group_id: string;
  sender: string;
  evermemos_message_id: string;
  first_seen_at: string;
  last_seen_at: string;
  last_ingested_at: string | null;
  status: 'ingested' | 'skipped' | 'failed';
  last_error: string | null;
}

export interface LedgerQuery {
  platform?: string;
  group_id?: string;
  status?: IngestionLedgerEntry['status'];
  itemKeyPrefix?: string;
  limit?: number;
}

export interface LedgerStats {
  ingested: number;
  skipped: number;
  failed: number;
  total: number;
  lastUpdatedAt: string | null;
}

const DB_NAME = 'ruminer';
const DB_VERSION = 1;
const STORE_NAME = 'ingestion_ledger';

function openLedgerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'item_key' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('group_id', 'group_id', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open ledger DB'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openLedgerDb().then(
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
              reject(tx.error || new Error('Ledger transaction failed'));
            };
          })
          .catch((error) => {
            db.close();
            reject(error);
          });
      }),
  );
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export async function getLedgerEntry(itemKey: string): Promise<IngestionLedgerEntry | null> {
  return withStore('readonly', async (store) => {
    const result = await requestToPromise<IngestionLedgerEntry | undefined>(store.get(itemKey));
    return result || null;
  });
}

export async function upsertLedgerEntry(entry: IngestionLedgerEntry): Promise<void> {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(entry));
  });
}

export async function deleteLedgerEntry(itemKey: string): Promise<void> {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.delete(itemKey));
  });
}

export async function queryLedgerEntries(query: LedgerQuery = {}): Promise<IngestionLedgerEntry[]> {
  return withStore('readonly', async (store) => {
    const all = await requestToPromise<IngestionLedgerEntry[]>(store.getAll());

    const filtered = all.filter((entry) => {
      if (query.group_id && entry.group_id !== query.group_id) {
        return false;
      }
      if (query.status && entry.status !== query.status) {
        return false;
      }
      if (query.itemKeyPrefix && !entry.item_key.startsWith(query.itemKeyPrefix)) {
        return false;
      }
      if (query.platform) {
        const prefix = `${query.platform}:`;
        if (!entry.item_key.startsWith(prefix)) {
          return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => (a.last_seen_at < b.last_seen_at ? 1 : -1));

    if (typeof query.limit === 'number' && query.limit > 0) {
      return filtered.slice(0, query.limit);
    }

    return filtered;
  });
}

export async function getLedgerStats(): Promise<LedgerStats> {
  const all = await queryLedgerEntries();

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let lastUpdatedAt: string | null = null;

  for (const entry of all) {
    if (entry.status === 'ingested') ingested += 1;
    if (entry.status === 'skipped') skipped += 1;
    if (entry.status === 'failed') failed += 1;
    if (!lastUpdatedAt || entry.last_seen_at > lastUpdatedAt) {
      lastUpdatedAt = entry.last_seen_at;
    }
  }

  return {
    ingested,
    skipped,
    failed,
    total: all.length,
    lastUpdatedAt,
  };
}

export async function hasAnyLedgerEntryForGroup(groupId: string): Promise<boolean> {
  if (!groupId.trim()) {
    return false;
  }

  return withStore('readonly', async (store) => {
    try {
      const index = store.index('group_id');
      const key = await requestToPromise<IDBValidKey | undefined>(index.getKey(groupId));
      return key !== undefined;
    } catch {
      // Defensive fallback: older IndexedDB implementations may not support getKey().
      const all = await requestToPromise<IngestionLedgerEntry[]>(store.getAll());
      return all.some((entry) => entry.group_id === groupId);
    }
  });
}
