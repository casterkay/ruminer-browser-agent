export type AutomationTabKind = 'ruminer.scan_and_ingest_all';

export type AutomationTabWorkflowProgress = {
  runId: string;
  platform?: string;
  status: 'running' | 'paused';
  percent: number;
  finished: number;
  total: number | null;
  elapsedMs: number;
  estimatedTotalMs: number | null;
};

export type AutomationTabState = {
  kind: AutomationTabKind;
  runId: string | null;
  createdAt: number;
  updatedAt: number;
  lastProgress: AutomationTabWorkflowProgress | null;
};

const SESSION_KEY_AUTOMATION_TABS = 'ruminer.automation_tabs.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function storageArea(): chrome.storage.StorageArea {
  // `chrome.storage.session` is the right persistence level for MV3 service worker restarts.
  // Some environments may not support it (or the typing may lag), so fall back to local.
  return (chrome.storage as any).session ?? chrome.storage.local;
}

let initOnce: Promise<void> | null = null;
let initializedListeners = false;
const tabs = new Map<number, AutomationTabState>();

async function loadFromStorage(): Promise<void> {
  try {
    const raw = (await storageArea().get([SESSION_KEY_AUTOMATION_TABS])) as Record<string, unknown>;
    const stored = raw?.[SESSION_KEY_AUTOMATION_TABS];
    if (!isRecord(stored)) return;

    for (const [tabIdKey, stateRaw] of Object.entries(stored)) {
      const tabId = Number(tabIdKey);
      if (!Number.isFinite(tabId) || tabId <= 0) continue;
      if (!isRecord(stateRaw)) continue;

      const kind = String((stateRaw as any).kind || '').trim() as AutomationTabKind;
      if (kind !== 'ruminer.scan_and_ingest_all') continue;

      const createdAt = Number((stateRaw as any).createdAt);
      const updatedAt = Number((stateRaw as any).updatedAt);
      const runId =
        typeof (stateRaw as any).runId === 'string' ? String((stateRaw as any).runId).trim() : '';

      tabs.set(tabId, {
        kind,
        runId: runId || null,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        lastProgress: null,
      });
    }
  } catch {
    // ignore
  }
}

async function persistToStorage(): Promise<void> {
  try {
    const payload: Record<string, unknown> = {};
    for (const [tabId, state] of tabs.entries()) {
      payload[String(tabId)] = {
        kind: state.kind,
        runId: state.runId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      };
    }
    await storageArea().set({ [SESSION_KEY_AUTOMATION_TABS]: payload });
  } catch {
    // ignore
  }
}

export async function initAutomationTabsRegistry(): Promise<void> {
  if (initOnce) return initOnce;
  initOnce = (async () => {
    await loadFromStorage();

    if (!initializedListeners) {
      initializedListeners = true;
      chrome.tabs.onRemoved.addListener((tabId) => {
        if (!tabs.has(tabId)) return;
        tabs.delete(tabId);
        void persistToStorage();
      });
    }
  })();
  return initOnce;
}

export async function registerAutomationTab(args: {
  tabId: number;
  kind?: AutomationTabKind;
  runId?: string | null;
}): Promise<void> {
  const tabId = args.tabId;
  if (!Number.isFinite(tabId) || tabId <= 0) return;
  await initAutomationTabsRegistry();

  const now = Date.now();
  const existing = tabs.get(tabId);
  const runId = typeof args.runId === 'string' ? args.runId.trim() : '';
  const kind: AutomationTabKind = args.kind ?? 'ruminer.scan_and_ingest_all';

  if (existing) {
    existing.kind = kind;
    existing.runId = runId || existing.runId;
    existing.updatedAt = now;
    return persistToStorage();
  }

  tabs.set(tabId, {
    kind,
    runId: runId || null,
    createdAt: now,
    updatedAt: now,
    lastProgress: null,
  });
  await persistToStorage();
}

export async function unregisterAutomationTab(tabId: number): Promise<void> {
  if (!Number.isFinite(tabId) || tabId <= 0) return;
  await initAutomationTabsRegistry();
  if (!tabs.has(tabId)) return;
  tabs.delete(tabId);
  await persistToStorage();
}

export async function setAutomationTabLastProgress(
  tabId: number,
  progress: AutomationTabWorkflowProgress | null,
): Promise<void> {
  if (!Number.isFinite(tabId) || tabId <= 0) return;
  await initAutomationTabsRegistry();
  const state = tabs.get(tabId);
  if (!state) return;
  state.lastProgress = progress;
  state.updatedAt = Date.now();
}

export async function getAutomationTabStateForSender(
  sender: chrome.runtime.MessageSender,
): Promise<AutomationTabState | null> {
  await initAutomationTabsRegistry();
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return null;
  return tabs.get(tabId) ?? null;
}
