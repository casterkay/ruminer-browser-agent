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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

let initOnce: Promise<void> | null = null;
let initializedListeners = false;
const tabs = new Map<number, AutomationTabState>();

export async function initAutomationTabsRegistry(): Promise<void> {
  if (initOnce) return initOnce;
  initOnce = (async () => {
    if (!initializedListeners) {
      initializedListeners = true;
      chrome.tabs.onRemoved.addListener((tabId) => {
        if (!tabs.has(tabId)) return;
        tabs.delete(tabId);
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
    return;
  }

  tabs.set(tabId, {
    kind,
    runId: runId || null,
    createdAt: now,
    updatedAt: now,
    lastProgress: null,
  });
}

export async function unregisterAutomationTab(tabId: number): Promise<void> {
  if (!Number.isFinite(tabId) || tabId <= 0) return;
  await initAutomationTabsRegistry();
  if (!tabs.has(tabId)) return;
  tabs.delete(tabId);
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
