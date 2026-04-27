import { STORAGE_KEYS } from '@/common/constants';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import {
  DEFAULT_WORKFLOW_ACCESS_STATE,
  applyHostedWorkflowAccessSnapshot,
  getRuminerHostedUrl,
  hasWorkflowAccess,
  normalizeWorkflowAccessState,
  type HostedWorkflowAccessSnapshot,
  type WorkflowAccessBlockReason,
  type WorkflowAccessLinkPollStatus,
  type WorkflowAccessLinkSession,
  type WorkflowAccessState,
} from '@/common/workflow-access';

const LOG_PREFIX = '[WorkflowAccess]';
const REFRESH_ALARM_NAME = 'workflow_access_refresh';
const REFRESH_INTERVAL_MINUTES = 5;
const REFRESH_STALE_MS = REFRESH_INTERVAL_MINUTES * 60 * 1000;

export type WorkflowAccessDenialReason = WorkflowAccessBlockReason;

let currentState: WorkflowAccessState = { ...DEFAULT_WORKFLOW_ACCESS_STATE };
let hydrated = false;
let hydratePromise: Promise<WorkflowAccessState> | null = null;
let pollPromise: Promise<void> | null = null;
let refreshPromise: Promise<WorkflowAccessState> | null = null;

function cloneState(state: WorkflowAccessState): WorkflowAccessState {
  return {
    ...state,
    user: state.user ? { ...state.user } : null,
    pendingLink: state.pendingLink ? { ...state.pendingLink } : null,
  };
}

async function broadcastWorkflowAccessState(state: WorkflowAccessState): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.WORKFLOW_ACCESS_STATE_CHANGED,
      payload: state,
    });
  } catch {
    // Ignore when no UI listeners are connected.
  }
}

async function persistWorkflowAccessState(
  state: WorkflowAccessState,
): Promise<WorkflowAccessState> {
  currentState = normalizeWorkflowAccessState(state);
  hydrated = true;
  await chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_ACCESS_STATE]: currentState });
  await broadcastWorkflowAccessState(currentState);
  return cloneState(currentState);
}

async function hydrateWorkflowAccessState(): Promise<WorkflowAccessState> {
  if (hydrated) {
    return cloneState(currentState);
  }

  if (!hydratePromise) {
    hydratePromise = Promise.resolve(chrome.storage.local.get([STORAGE_KEYS.WORKFLOW_ACCESS_STATE]))
      .then((result) => {
        currentState = normalizeWorkflowAccessState(result?.[STORAGE_KEYS.WORKFLOW_ACCESS_STATE]);
        hydrated = true;
        return cloneState(currentState);
      })
      .catch((error) => {
        console.warn(`${LOG_PREFIX} Failed to hydrate workflow access state`, error);
        currentState = { ...DEFAULT_WORKFLOW_ACCESS_STATE };
        hydrated = true;
        return cloneState(currentState);
      })
      .finally(() => {
        hydratePromise = null;
      });
  }

  return hydratePromise;
}

async function readWorkflowAccessLinkToken(): Promise<string | null> {
  const result = await Promise.resolve(
    chrome.storage.local.get([STORAGE_KEYS.WORKFLOW_ACCESS_LINK_TOKEN]),
  );
  const token = result?.[STORAGE_KEYS.WORKFLOW_ACCESS_LINK_TOKEN];
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

async function persistWorkflowAccessLinkToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_ACCESS_LINK_TOKEN]: token });
}

async function clearWorkflowAccessLinkToken(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.WORKFLOW_ACCESS_LINK_TOKEN);
}

function isWorkflowAccessStale(state: WorkflowAccessState): boolean {
  return !state.lastSyncedAt || Date.now() - state.lastSyncedAt >= REFRESH_STALE_MS;
}

export async function getWorkflowAccessStateSnapshot(options?: {
  refreshIfStale?: boolean;
}): Promise<WorkflowAccessState> {
  const state = await hydrateWorkflowAccessState();
  if (!options?.refreshIfStale || !isWorkflowAccessStale(state)) {
    return state;
  }

  return refreshWorkflowAccessState();
}

export function getWorkflowAccessDenialReason(
  access: WorkflowAccessState,
): WorkflowAccessDenialReason | null {
  if (hasWorkflowAccess(access)) {
    return null;
  }

  if (access.syncing) {
    return 'link_incomplete';
  }

  if (access.blockReason) {
    if (access.status === 'free' && access.blockReason === 'sign_in_required') {
      return 'pro_required';
    }
    return access.blockReason;
  }

  return access.status === 'free' ? 'pro_required' : 'sign_in_required';
}

export function formatWorkflowAccessDeniedReason(reason: WorkflowAccessDenialReason): string {
  switch (reason) {
    case 'billing_recovery_required':
      return 'Update your Ruminer Pro billing details before using workflows.';
    case 'link_incomplete':
      return 'Finish linking this browser to Ruminer Pro before using workflows.';
    case 'pro_required':
      return 'Ruminer Pro is required to use workflows.';
    case 'sync_failed':
      return 'Sync Ruminer Pro access before using workflows.';
    case 'sign_in_required':
    default:
      return 'Sign in to Ruminer and attach Ruminer Pro before using workflows.';
  }
}

export async function assertWorkflowAccess(options?: { refreshIfStale?: boolean }): Promise<void> {
  const access = await getWorkflowAccessStateSnapshot({
    refreshIfStale: options?.refreshIfStale ?? true,
  });
  const reason = getWorkflowAccessDenialReason(access);
  if (reason) {
    throw new Error(formatWorkflowAccessDeniedReason(reason));
  }
}

export function resetWorkflowAccessStateCache(): void {
  currentState = { ...DEFAULT_WORKFLOW_ACCESS_STATE };
  hydrated = false;
  hydratePromise = null;
  refreshPromise = null;
}

async function fetchWorkflowAccessJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & Record<string, unknown>)
    | null;

  if (!response.ok || payload?.ok !== true) {
    throw new Error(
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error
        : `Workflow access request failed (${response.status})`,
    );
  }

  return payload as T;
}

function applyRefreshFailure(state: WorkflowAccessState, error: unknown): WorkflowAccessState {
  if (!isWorkflowAccessStale(state)) {
    return {
      ...state,
      error: error instanceof Error ? error.message : 'Unable to sync workflow access.',
    };
  }

  return {
    ...state,
    workflowAccess: 'blocked',
    blockReason: 'sync_failed',
    isActive: false,
    error: error instanceof Error ? error.message : 'Unable to sync workflow access.',
  };
}

function hasLinkedWorkflowAccessState(state: WorkflowAccessState): boolean {
  return state.status !== 'guest' || state.user !== null || state.workflowAccess === 'allowed';
}

async function requestWorkflowAccessLink(): Promise<WorkflowAccessLinkSession> {
  const payload = await fetchWorkflowAccessJson<{ ok: true; link: WorkflowAccessLinkSession }>(
    getRuminerHostedUrl('/api/extension/workflow-access/link/start'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ extensionId: chrome.runtime.id }),
    },
  );

  return payload.link;
}

async function pollWorkflowAccessLink(
  pendingLink: WorkflowAccessLinkSession,
): Promise<WorkflowAccessLinkPollStatus> {
  const payload = await fetchWorkflowAccessJson<{ ok: true; status: WorkflowAccessLinkPollStatus }>(
    getRuminerHostedUrl('/api/extension/workflow-access/link/poll'),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: pendingLink.sessionId,
        verifier: pendingLink.verifier,
      }),
    },
  );

  return payload.status;
}

async function refreshWorkflowAccessFromHosted(
  token: string,
): Promise<HostedWorkflowAccessSnapshot> {
  const payload = await fetchWorkflowAccessJson<{
    ok: true;
    access: HostedWorkflowAccessSnapshot;
  }>(getRuminerHostedUrl('/api/extension/workflow-access/state'), {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  return payload.access;
}

export async function refreshWorkflowAccessState(): Promise<WorkflowAccessState> {
  await hydrateWorkflowAccessState();

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const token = await readWorkflowAccessLinkToken();
    if (!token) {
      if (currentState.syncing || currentState.pendingLink) {
        return cloneState(currentState);
      }

      if (hasLinkedWorkflowAccessState(currentState)) {
        return persistWorkflowAccessState({
          ...DEFAULT_WORKFLOW_ACCESS_STATE,
          error: 'This browser link is missing. Sign in again to unlock workflows.',
        });
      }

      return cloneState(currentState);
    }

    try {
      const access = await refreshWorkflowAccessFromHosted(token);
      return persistWorkflowAccessState(applyHostedWorkflowAccessSnapshot(access));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.toLowerCase().includes('not found') ||
        message.toLowerCase().includes('invalid')
      ) {
        await clearWorkflowAccessLinkToken();
        return persistWorkflowAccessState({
          ...DEFAULT_WORKFLOW_ACCESS_STATE,
          error: 'This browser link is no longer valid. Sign in again to unlock workflows.',
        });
      }
      return persistWorkflowAccessState(applyRefreshFailure(currentState, error));
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolvePendingLink(pendingLink: WorkflowAccessLinkSession): Promise<void> {
  if (pollPromise) {
    return pollPromise;
  }

  pollPromise = (async () => {
    try {
      while (true) {
        if (Date.parse(pendingLink.expiresAt) <= Date.now()) {
          await persistWorkflowAccessState({
            ...currentState,
            syncing: false,
            pendingLink: null,
            error: 'The hosted link expired. Start the workflow unlock flow again.',
          });
          return;
        }

        const status = await pollWorkflowAccessLink(pendingLink);

        if (status.status === 'completed') {
          if (!status.linkToken) {
            await persistWorkflowAccessState({
              ...DEFAULT_WORKFLOW_ACCESS_STATE,
              error: 'This browser link is missing. Sign in again to unlock workflows.',
            });
            return;
          }
          await persistWorkflowAccessLinkToken(status.linkToken);
          await persistWorkflowAccessState(applyHostedWorkflowAccessSnapshot(status.access));
          return;
        }

        if (status.status === 'expired' || status.status === 'not_found') {
          await persistWorkflowAccessState({
            ...currentState,
            syncing: false,
            pendingLink: null,
            error: 'The hosted link expired. Start the workflow unlock flow again.',
          });
          return;
        }

        await delay(pendingLink.pollAfterMs);
      }
    } catch (error) {
      await persistWorkflowAccessState({
        ...currentState,
        syncing: false,
        pendingLink: null,
        error: error instanceof Error ? error.message : 'Unable to sync workflow access.',
      });
    } finally {
      pollPromise = null;
    }
  })();

  return pollPromise;
}

async function startWorkflowAccessLink(): Promise<WorkflowAccessState> {
  await hydrateWorkflowAccessState();

  if (currentState.syncing && currentState.pendingLink) {
    await chrome.tabs.create({ url: currentState.pendingLink.verificationUrl });
    void resolvePendingLink(currentState.pendingLink);
    return cloneState(currentState);
  }

  const pendingLink = await requestWorkflowAccessLink();

  await persistWorkflowAccessState({
    ...currentState,
    syncing: true,
    error: null,
    pendingLink,
  });

  await chrome.tabs.create({ url: pendingLink.verificationUrl });
  void resolvePendingLink(pendingLink);

  return cloneState(currentState);
}

async function resumePendingWorkflowAccessLink(): Promise<void> {
  const state = await hydrateWorkflowAccessState();
  const pendingLink = state.pendingLink;
  if (!pendingLink) {
    return;
  }

  if (Date.parse(pendingLink.expiresAt) <= Date.now()) {
    await persistWorkflowAccessState({
      ...state,
      syncing: false,
      pendingLink: null,
      error: 'The hosted link expired. Start the workflow unlock flow again.',
    });
    return;
  }

  await persistWorkflowAccessState({
    ...state,
    syncing: true,
    error: null,
  });
  void resolvePendingLink(pendingLink);
}

function initWorkflowAccessRefreshAlarm(): void {
  if (!chrome.alarms?.create || !chrome.alarms?.onAlarm?.addListener) {
    return;
  }

  chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name !== REFRESH_ALARM_NAME) {
      return;
    }
    void refreshWorkflowAccessState().catch((error) => {
      console.warn(`${LOG_PREFIX} Failed to refresh workflow access`, error);
    });
  });
}

export function initWorkflowAccessListener(): void {
  void resumePendingWorkflowAccessLink().catch((error) => {
    console.warn(`${LOG_PREFIX} Failed to resume pending workflow access link`, error);
  });
  void refreshWorkflowAccessState().catch((error) => {
    console.warn(`${LOG_PREFIX} Initial workflow access refresh failed`, error);
  });
  initWorkflowAccessRefreshAlarm();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === BACKGROUND_MESSAGE_TYPES.GET_WORKFLOW_ACCESS_STATE) {
      getWorkflowAccessStateSnapshot({ refreshIfStale: true })
        .then((state) => {
          sendResponse({ success: true, state });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            state: cloneState(currentState),
          });
        });
      return true;
    }

    if (message?.type === BACKGROUND_MESSAGE_TYPES.START_WORKFLOW_ACCESS_LINK) {
      startWorkflowAccessLink()
        .then((state) => {
          sendResponse({ success: true, state });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            state: cloneState(currentState),
          });
        });
      return true;
    }

    return false;
  });
}
