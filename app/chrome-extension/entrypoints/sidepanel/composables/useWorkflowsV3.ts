/**
 * @fileoverview V3 Workflows Data Layer Composable
 * @description Provides V3 workflows data management for Sidepanel UI
 *
 * This composable wraps the V3 RPC client and provides:
 * - Flow listing, running, and deletion
 * - Run listing and event subscription
 * - Trigger management
 * - Data mapping from V3 types to UI types
 */

import { onMounted, onUnmounted, ref, type Ref } from 'vue';

import type { RunRecordV3 } from '@/entrypoints/background/record-replay-v3/domain/events';
import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import type { FlowId, RunId } from '@/entrypoints/background/record-replay-v3/domain/ids';
import type { TriggerSpec } from '@/entrypoints/background/record-replay-v3/domain/triggers';
import type { RunQueueItem } from '@/entrypoints/background/record-replay-v3/engine/queue/queue';
import { useRRV3Rpc } from './useRRV3Rpc';

// ==================== UI Types ====================

/** Flow type for UI display (compatible with existing WorkflowsView) */
export interface FlowLite {
  id: string;
  name: string;
  description?: string;
  meta?: {
    domain?: string;
    tags?: string[];
    bindings?: Array<{
      kind?: string; // V3 uses 'kind'
      type?: string; // V2 uses 'type'
      value: string;
    }>;
  };
}

/** Run type for UI display (compatible with existing WorkflowsView) */
export interface RunLite {
  id: string;
  flowId: string;
  flowVersionHash?: string;
  startedAt: string;
  finishedAt?: string;
  /**
   * Terminal success status: true=succeeded, false=failed/canceled, undefined=in progress
   * UI should check `isInProgress` first to distinguish in-progress from failed
   */
  success?: boolean;
  /** Whether the run is still in progress (queued/running/paused) */
  isInProgress: boolean;
  status: RunRecordV3['status'];
  args?: RunRecordV3['args'];
  error?: RunRecordV3['error'];
  repair?: RunRecordV3['repair'];
  currentNodeId?: RunRecordV3['currentNodeId'];
  entries: unknown[];
}

/** Trigger type for UI display */
export interface TriggerLite {
  id: string;
  type: string; // UI uses 'type', V3 uses 'kind'
  kind: string; // V3 uses 'kind'
  flowId: string;
  enabled?: boolean;
  match?: Array<{ kind: string; value: string }>; // For URL triggers
  [key: string]: unknown;
}

// ==================== Mappers ====================

/** Convert V3 FlowV3 to UI FlowLite */
function mapFlowV3ToLite(flow: FlowV3): FlowLite {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    meta: {
      tags: flow.meta?.tags,
      bindings: flow.meta?.bindings?.map((b) => ({
        kind: b.kind,
        type: b.kind, // For V2 compatibility
        value: b.value,
      })),
    },
  };
}

/** Convert V3 RunRecordV3 to UI RunLite */
function mapRunV3ToLite(run: RunRecordV3): RunLite {
  // Determine if run is in progress
  const inProgressStatuses = ['queued', 'running', 'paused'];
  const isInProgress = inProgressStatuses.includes(run.status);

  // Map V3 status to success boolean for terminal states only
  let success: boolean | undefined;
  if (run.status === 'succeeded') success = true;
  else if (run.status === 'failed' || run.status === 'canceled') success = false;
  // For in-progress states, success remains undefined

  return {
    id: run.id,
    flowId: run.flowId,
    flowVersionHash: run.flowVersionHash,
    startedAt: run.startedAt
      ? new Date(run.startedAt).toISOString()
      : new Date(run.createdAt).toISOString(),
    finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : undefined,
    success,
    isInProgress,
    status: run.status,
    args: run.args,
    error: run.error,
    repair: run.repair,
    currentNodeId: run.currentNodeId,
    entries: [], // V3 doesn't have entries in RunRecord, use getEvents for details
  };
}

/** Convert V3 TriggerSpec to UI TriggerLite */
function mapTriggerV3ToLite(trigger: TriggerSpec): TriggerLite {
  return {
    ...trigger,
    type: trigger.kind, // Map 'kind' to 'type' for UI compatibility
    kind: trigger.kind,
  } as TriggerLite;
}

// ==================== Composable ====================

export interface UseWorkflowsV3Options {
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshMs?: number;
  /** Auto-connect on mount */
  autoConnect?: boolean;
}

export interface UseWorkflowsV3Return {
  // Connection state
  connected: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;

  // Data
  flows: Ref<FlowLite[]>;
  runs: Ref<RunLite[]>;
  triggers: Ref<TriggerLite[]>;
  progressByRunId: Ref<Record<string, string>>;
  queueItems: Ref<RunQueueItem[]>;
  queueProgress: Ref<QueueProgressLite>;

  // Actions
  refresh: () => Promise<void>;
  refreshFlows: () => Promise<void>;
  refreshRuns: () => Promise<void>;
  refreshTriggers: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  runFlow: (flowId: string, args?: Record<string, unknown>) => Promise<{ runId: string } | null>;
  cancelQueueItem: (runId: string, reason?: string) => Promise<boolean>;
  cancelRun: (runId: string, reason?: string) => Promise<boolean>;
  pauseRun: (runId: string, reason?: string) => Promise<boolean>;
  resumeRun: (runId: string) => Promise<boolean>;
  pauseQueueWave: (reason?: string) => Promise<void>;
  resumeQueueWave: () => Promise<void>;
  stopQueueWave: (reason?: string) => Promise<void>;
  deleteFlow: (flowId: string) => Promise<boolean>;
  exportFlow: (flowId: string) => Promise<FlowV3 | null>;
  deleteTrigger: (triggerId: string) => Promise<boolean>;
  upsertCronSchedule: (flowId: string, cron: string | null, enabled: boolean) => Promise<boolean>;

  // V3-specific
  getFlowById: (flowId: string) => Promise<FlowV3 | null>;
  getRunEvents: (runId: string) => Promise<unknown[]>;
  onRunEvent: (listener: (event: UiRunEvent) => void) => () => void;
}

export type UiRunEvent = {
  runId: string;
  type: string;
  seq: number;
  ts: number;
  [key: string]: unknown;
};

export type QueueProgressLite = {
  done: number;
  total: number;
  queued: number;
  running: number;
  paused: number;
  queueSize: number;
};

/**
 * V3 Workflows data layer composable
 */
export function useWorkflowsV3(options: UseWorkflowsV3Options = {}): UseWorkflowsV3Return {
  const { autoRefreshMs = 0, autoConnect = true } = options;

  // RPC client
  const rpc = useRRV3Rpc({ autoConnect });

  // State
  const loading = ref(false);
  const error = ref<string | null>(null);
  const flows = ref<FlowLite[]>([]);
  const runs = ref<RunLite[]>([]);
  const triggers = ref<TriggerLite[]>([]);
  const progressByRunId = ref<Record<string, string>>({});
  const queueItems = ref<RunQueueItem[]>([]);
  const queueWaveRunIds = ref<Set<string>>(new Set());

  const queueProgress = ref<QueueProgressLite>({
    done: 0,
    total: 0,
    queued: 0,
    running: 0,
    paused: 0,
    queueSize: 0,
  });

  // Auto-refresh timer
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  // Event subscription cleanup function
  let eventUnsubscribe: (() => void) | null = null;

  // ==================== Actions ====================

  async function refreshFlows(): Promise<void> {
    try {
      const result = (await rpc.request('rr_v3.listFlows')) as FlowV3[] | null;
      flows.value = (result || []).map(mapFlowV3ToLite);
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to refresh flows:', e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function refreshRuns(): Promise<void> {
    try {
      const result = (await rpc.request('rr_v3.listRuns')) as RunRecordV3[] | null;
      // Sort by createdAt descending (newest first)
      const sorted = (result || []).slice().sort((a, b) => b.createdAt - a.createdAt);
      runs.value = sorted.map(mapRunV3ToLite);
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to refresh runs:', e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function refreshTriggers(): Promise<void> {
    try {
      const result = (await rpc.request('rr_v3.listTriggers')) as TriggerSpec[] | null;
      triggers.value = (result || []).map(mapTriggerV3ToLite);
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to refresh triggers:', e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([refreshFlows(), refreshRuns(), refreshTriggers(), refreshQueue()]);
    } finally {
      loading.value = false;
    }
  }

  function recomputeQueueProgress(): void {
    const items = queueItems.value;
    const queueSize = items.length;
    if (queueSize === 0) {
      queueWaveRunIds.value = new Set();
      queueProgress.value = {
        done: 0,
        total: 0,
        queued: 0,
        running: 0,
        paused: 0,
        queueSize: 0,
      };
      return;
    }

    const nextWave = new Set(queueWaveRunIds.value);
    for (const item of items) nextWave.add(String(item.id));
    queueWaveRunIds.value = nextWave;

    let queued = 0;
    let running = 0;
    let paused = 0;
    for (const item of items) {
      if (item.status === 'queued') queued += 1;
      else if (item.status === 'running') running += 1;
      else if (item.status === 'paused') paused += 1;
    }

    let done = 0;
    for (const run of runs.value) {
      if (!nextWave.has(run.id)) continue;
      if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'canceled') {
        done += 1;
      }
    }

    queueProgress.value = {
      done,
      total: nextWave.size,
      queued,
      running,
      paused,
      queueSize,
    };
  }

  async function refreshQueue(): Promise<void> {
    try {
      const result = (await rpc.request('rr_v3.listQueue')) as RunQueueItem[] | null;
      queueItems.value = Array.isArray(result) ? (result as RunQueueItem[]) : [];
      recomputeQueueProgress();
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to refresh queue:', e);
      error.value = e instanceof Error ? e.message : String(e);
    }
  }

  async function runFlow(
    flowId: string,
    args?: Record<string, unknown>,
  ): Promise<{ runId: string } | null> {
    try {
      const result = (await rpc.request('rr_v3.enqueueRun', {
        flowId: flowId as FlowId,
        ...(args ? { args: args as any } : {}),
      })) as { runId: RunId; position: number } | null;
      // Refresh runs to show the new run
      void Promise.all([refreshRuns(), refreshQueue()]);
      return result ? { runId: result.runId } : null;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to run flow:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async function cancelQueueItem(runId: string, reason?: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.cancelQueueItem', {
        runId: runId as RunId,
        ...(reason ? { reason } : {}),
      });
      void Promise.all([refreshRuns(), refreshQueue()]);
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to cancel queue item:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function cancelRun(runId: string, reason?: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.cancelRun', {
        runId: runId as RunId,
        ...(reason ? { reason } : {}),
      });
      void Promise.all([refreshRuns(), refreshQueue()]);
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to cancel run:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function pauseRun(runId: string, reason?: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.pauseRun', {
        runId: runId as RunId,
        ...(reason ? { reason } : {}),
      });
      void Promise.all([refreshRuns(), refreshQueue()]);
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to pause run:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function resumeRun(runId: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.resumeRun', {
        runId: runId as RunId,
      });
      void Promise.all([refreshRuns(), refreshQueue()]);
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to resume run:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function pauseQueueWave(reason: string = 'Paused by user'): Promise<void> {
    const items = queueItems.value;
    const running = items.filter((i) => i.status === 'running').map((i) => String(i.id));
    for (const runId of running) {
      // Best-effort: pause what we can

      await pauseRun(runId, reason);
    }
    await refreshQueue();
  }

  async function resumeQueueWave(): Promise<void> {
    const items = queueItems.value;
    const paused = items.filter((i) => i.status === 'paused').map((i) => String(i.id));
    for (const runId of paused) {
      await resumeRun(runId);
    }
    await refreshQueue();
  }

  async function stopQueueWave(reason: string = 'Stopped by user'): Promise<void> {
    const items = queueItems.value;
    const queued = items.filter((i) => i.status === 'queued').map((i) => String(i.id));
    const active = items
      .filter((i) => i.status === 'running' || i.status === 'paused')
      .map((i) => String(i.id));

    for (const runId of queued) {
      await cancelQueueItem(runId, reason);
    }
    for (const runId of active) {
      await cancelRun(runId, reason);
    }
    await Promise.all([refreshRuns(), refreshQueue()]);
  }

  const cronTriggerIdForFlow = (flowId: string): string => `cron:${flowId}`;

  async function upsertCronSchedule(
    flowId: string,
    cron: string | null,
    enabled: boolean,
  ): Promise<boolean> {
    const triggerId = cronTriggerIdForFlow(flowId);
    const existing = triggers.value.find((t) => t.id === triggerId) as TriggerSpec | undefined;

    try {
      if (!cron) {
        if (!existing) return true;
        await rpc.request('rr_v3.disableTrigger', { triggerId });
        void refreshTriggers();
        return true;
      }

      const next: TriggerSpec = {
        ...(existing ?? ({} as TriggerSpec)),
        id: triggerId,
        kind: 'cron',
        flowId: flowId as FlowId,
        enabled,
        cron,
      } as TriggerSpec;

      if (existing) {
        await rpc.request('rr_v3.updateTrigger', { trigger: next as any });
      } else {
        await rpc.request('rr_v3.createTrigger', { trigger: next as any });
      }

      if (enabled) {
        await rpc.request('rr_v3.enableTrigger', { triggerId });
      } else {
        await rpc.request('rr_v3.disableTrigger', { triggerId });
      }

      void refreshTriggers();
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to upsert cron schedule:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function deleteFlow(flowId: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.deleteFlow', { flowId: flowId as FlowId });
      // Refresh flows after deletion
      void refreshFlows();
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to delete flow:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function exportFlow(flowId: string): Promise<FlowV3 | null> {
    try {
      const result = (await rpc.request('rr_v3.getFlow', {
        flowId: flowId as FlowId,
      })) as FlowV3 | null;
      return result;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to export flow:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return null;
    }
  }

  async function deleteTrigger(triggerId: string): Promise<boolean> {
    try {
      await rpc.request('rr_v3.deleteTrigger', { triggerId });
      // Refresh triggers after deletion
      void refreshTriggers();
      return true;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to delete trigger:', e);
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    }
  }

  async function getFlowById(flowId: string): Promise<FlowV3 | null> {
    try {
      return (await rpc.request('rr_v3.getFlow', {
        flowId: flowId as FlowId,
      })) as FlowV3 | null;
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to get flow:', e);
      return null;
    }
  }

  async function getRunEvents(runId: string): Promise<unknown[]> {
    try {
      return (await rpc.request('rr_v3.getEvents', {
        runId: runId as RunId,
      })) as unknown[];
    } catch (e) {
      console.warn('[useWorkflowsV3] Failed to get run events:', e);
      return [];
    }
  }

  // ==================== Lifecycle ====================

  function setRunProgress(runId: string, message: string): void {
    const rid = String(runId || '').trim();
    const msg = String(message || '').trim();
    if (!rid || !msg) return;
    progressByRunId.value = { ...progressByRunId.value, [rid]: msg };
  }

  function clearRunProgress(runId: string): void {
    const rid = String(runId || '').trim();
    if (!rid || !progressByRunId.value[rid]) return;
    const next = { ...progressByRunId.value };
    delete next[rid];
    progressByRunId.value = next;
  }

  onMounted(async () => {
    if (autoConnect) {
      await rpc.ensureConnected();
      await refresh();
    }

    // Setup auto-refresh
    if (autoRefreshMs > 0) {
      refreshTimer = setInterval(() => {
        void refresh();
      }, autoRefreshMs);
    }

    // Subscribe to all run events for real-time updates
    void rpc.subscribe(null);
    eventUnsubscribe = rpc.onEvent((event: any) => {
      // Refresh runs when run status changes
      const runStatusEvents = [
        'run.queued',
        'run.started',
        'run.succeeded',
        'run.failed',
        'run.canceled',
        'run.paused',
        'run.resumed',
        'run.recovered',
      ];
      if (runStatusEvents.includes(event.type)) {
        void Promise.all([refreshRuns(), refreshQueue()]);
      }

      // Track last seen progress per run (shown on the active-run list item).
      if (event.type === 'log' && typeof event.message === 'string' && event.message.trim()) {
        setRunProgress(event.runId, event.message);
      } else if (event.type === 'node.started') {
        setRunProgress(event.runId, `Running: ${event.nodeId}`);
      } else if (event.type === 'run.queued') {
        setRunProgress(event.runId, 'Queued');
      } else if (event.type === 'run.started') {
        setRunProgress(event.runId, 'Started');
      } else if (event.type === 'run.paused') {
        setRunProgress(event.runId, 'Paused');
      } else if (event.type === 'run.resumed') {
        setRunProgress(event.runId, 'Resumed');
      }

      // Clear progress when run is terminal.
      if (
        event.type === 'run.succeeded' ||
        event.type === 'run.failed' ||
        event.type === 'run.canceled'
      ) {
        clearRunProgress(event.runId);
      }
    });
  });

  onUnmounted(() => {
    // Cleanup auto-refresh timer
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    // Cleanup event subscription
    if (eventUnsubscribe) {
      eventUnsubscribe();
      eventUnsubscribe = null;
    }
    // Unsubscribe from run events
    void rpc.unsubscribe(null);
  });

  return {
    connected: rpc.connected,
    loading,
    error,
    flows,
    runs,
    triggers,
    progressByRunId,
    queueItems,
    queueProgress,
    refresh,
    refreshFlows,
    refreshRuns,
    refreshTriggers,
    refreshQueue,
    runFlow,
    cancelQueueItem,
    cancelRun,
    pauseRun,
    resumeRun,
    pauseQueueWave,
    resumeQueueWave,
    stopQueueWave,
    deleteFlow,
    exportFlow,
    deleteTrigger,
    upsertCronSchedule,
    getFlowById,
    getRunEvents,
    onRunEvent: (listener: (event: UiRunEvent) => void) => rpc.onEvent(listener as any),
  } as unknown as UseWorkflowsV3Return;
}
