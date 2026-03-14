import { z } from 'zod';

import { type ChatPlatform } from '@/common/chat-platforms';
import { isCancelRequested } from '@/entrypoints/background/record-replay-v3/engine/kernel/run-cancel-registry';
import { createRunsStore } from '@/entrypoints/background/record-replay-v3/storage/runs';
import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import { getConversationStates } from '../conversation-ledger';
import { toErrorResult } from '../utils';
import { ingestConversationInTab } from './ingest-conversation';

const scanAndEnqueueConfigSchema = z.object({
  platform: z.enum(['chatgpt', 'gemini', 'claude', 'deepseek']),
  limit: z.number().int().min(1).max(200).default(100),
});

type ScanAndEnqueueConfig = z.infer<typeof scanAndEnqueueConfigSchema>;

type ConversationListItem = {
  conversationId: string;
  conversationUrl: string;
  conversationTitle: string | null;
};

type ListResult = { items: ConversationListItem[]; nextOffset: number | null };

type ConversationDigestResult = {
  messageCount: number;
  fullDigest: string;
  messageHashes?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  const ms = Math.max(0, Math.floor(timeoutMs));
  if (ms === 0) return;

  await new Promise<void>((resolve, reject) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (pollTimer) clearInterval(pollTimer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (err) reject(err);
      else resolve();
    };

    const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== 'complete') return;
      finish();
    };

    const onRemoved = (removedTabId: number) => {
      if (removedTabId !== tabId) return;
      finish(new Error(`Tab ${tabId} was closed while waiting for load`));
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    timer = setTimeout(() => finish(new Error(`Timed out waiting for tab ${tabId} to load`)), ms);

    const checkStatus = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === 'complete') finish();
      } catch {
        finish(new Error(`Tab ${tabId} not found`));
      }
    };

    pollTimer = setInterval(() => void checkStatus(), 250);
    void checkStatus();
  });
}

function scanScriptPath(platform: ChatPlatform): string {
  return `inject-scripts/ruminer.${platform}-scan.js`;
}

function scanExecutionWorld(platform: ChatPlatform): chrome.scripting.ExecutionWorld {
  // This node calls the injected scanner via chrome.tabs.sendMessage RPC.
  // That requires the injected script to run in the ISOLATED "content script" world.
  // If a platform needs MAIN-world fetch semantics (Origin), add an ISOLATED<->MAIN bridge.
  return 'ISOLATED';
}

function platformHomeUrl(platform: ChatPlatform): string {
  switch (platform) {
    case 'chatgpt':
      return 'https://chatgpt.com/';
    case 'claude':
      return 'https://claude.ai/';
    case 'gemini':
      return 'https://gemini.google.com/';
    case 'deepseek':
      return 'https://chat.deepseek.com/';
    default:
      return 'about:blank';
  }
}

async function probeScanApi(
  tabId: number,
  platform: ChatPlatform,
): Promise<Record<string, unknown> | null> {
  try {
    const res = (await chrome.tabs.sendMessage(
      tabId,
      { action: 'ruminer_scan_probe' },
      { frameId: 0 },
    )) as any;
    return isRecord(res) ? res : null;
  } catch {
    return null;
  }
}

async function injectScanScript(tabId: number, platform: ChatPlatform): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [scanScriptPath(platform)],
    world: scanExecutionWorld(platform),
  });
}

async function pingScanRpc(
  tabId: number,
): Promise<{ ok: true; platform: string; version: string; href: string } | null> {
  try {
    const res = (await chrome.tabs.sendMessage(
      tabId,
      { action: 'ruminer_scan_ping' },
      { frameId: 0 },
    )) as any;
    if (!isRecord(res) || res.ok !== true) return null;
    return {
      ok: true,
      platform: String(res.platform || ''),
      version: String(res.version || ''),
      href: String(res.href || ''),
    };
  } catch {
    return null;
  }
}

async function ensureScanRpcInjected(tabId: number, platform: ChatPlatform): Promise<void> {
  const ping0 = await pingScanRpc(tabId);
  if (ping0?.platform === platform) return;

  await injectScanScript(tabId, platform);

  const ping1 = await pingScanRpc(tabId);
  if (ping1?.platform !== platform) {
    const probe = await probeScanApi(tabId, platform);
    const detail = probe ? JSON.stringify(probe) : 'null';
    throw new Error(`Scan RPC not responding after injection (probe=${detail})`);
  }
}

function isRetryableSendMessageError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('Receiving end does not exist') ||
    msg.includes('Could not establish connection') ||
    msg.includes('The message port closed') ||
    msg.toLowerCase().includes('tab not found')
  );
}

async function callScanRpc<T>(
  tabId: number,
  platform: ChatPlatform,
  action: 'ruminer_scan_listConversations' | 'ruminer_scan_getConversationMessageHashes',
  payload: Record<string, unknown>,
): Promise<T> {
  const MAX_ATTEMPTS = 2;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = (await chrome.tabs.sendMessage(
        tabId,
        { action, payload: { platform, ...payload } },
        { frameId: 0 },
      )) as any;

      if (!isRecord(res)) throw new Error('Scan RPC returned non-object response');
      if (res.ok === false && typeof res.error === 'string') throw new Error(String(res.error));
      if (res.ok !== true) throw new Error('Scan RPC returned invalid response shape');
      const value = (res as any).value as unknown;
      if (
        isRecord(value) &&
        (value as any).ok === false &&
        typeof (value as any).error === 'string'
      ) {
        throw new Error(String((value as any).error || 'Scan RPC call failed'));
      }
      return value as T;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e || '');
      const retryable =
        isRetryableSendMessageError(e) ||
        msg.includes('navigation_started') ||
        msg.includes('__RUMINER_SCAN__ not found on window');
      if (retryable && attempt + 1 < MAX_ATTEMPTS) {
        await waitForTabComplete(tabId, 15_000).catch(() => undefined);
        await ensureScanRpcInjected(tabId, platform).catch(() => undefined);
        continue;
      }
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr || 'Scan RPC failed'));
}

async function callListConversations(
  tabId: number,
  platform: ChatPlatform,
  payload: { offset: number; limit: number },
): Promise<ListResult> {
  const raw = await callScanRpc<unknown>(tabId, platform, 'ruminer_scan_listConversations', {
    offset: payload.offset,
    limit: payload.limit,
  }).catch((e) => {
    throw e instanceof Error ? e : new Error(String(e));
  });

  if (raw === null || raw === undefined) {
    const p0 = await probeScanApi(tabId, platform);
    throw new Error(
      `listConversations returned invalid result (probe=${isRecord(p0) ? JSON.stringify(p0) : 'null'})`,
    );
  }

  // Compatibility: allow returning either `{ items, nextOffset }` or an array of items.
  const normalized = Array.isArray(raw)
    ? { items: raw, nextOffset: raw.length > 0 ? payload.offset + raw.length : null }
    : raw;

  if (!isRecord(normalized)) {
    const p0 = await probeScanApi(tabId, platform);
    throw new Error(
      `listConversations returned non-object result (type=${typeof raw}, probe=${isRecord(p0) ? JSON.stringify(p0) : 'null'})`,
    );
  }

  const itemsRaw = Array.isArray((normalized as any).items)
    ? (normalized as any).items
    : Array.isArray((normalized as any).conversations)
      ? (normalized as any).conversations
      : [];
  const nextOffsetRaw = (normalized as any).nextOffset;
  const nextOffset =
    typeof nextOffsetRaw === 'number' && Number.isFinite(nextOffsetRaw)
      ? Math.floor(nextOffsetRaw)
      : null;

  const items: ConversationListItem[] = itemsRaw
    .map((it: any) => {
      const conversationId = typeof it?.conversationId === 'string' ? it.conversationId.trim() : '';
      const conversationUrl =
        typeof it?.conversationUrl === 'string' ? it.conversationUrl.trim() : '';
      if (!conversationId || !conversationUrl) return null;
      const conversationTitle =
        typeof it?.conversationTitle === 'string' && it.conversationTitle.trim()
          ? it.conversationTitle.trim()
          : null;
      return { conversationId, conversationUrl, conversationTitle };
    })
    .filter(Boolean) as ConversationListItem[];

  return { items, nextOffset };
}

async function callConversationDigest(
  tabId: number,
  platform: ChatPlatform,
  payload: { conversationId: string; conversationUrl: string },
): Promise<ConversationDigestResult> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let raw: unknown = null;
    try {
      raw = await callScanRpc<unknown>(
        tabId,
        platform,
        'ruminer_scan_getConversationMessageHashes',
        {
          conversationId: payload.conversationId,
          conversationUrl: payload.conversationUrl,
        },
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e || '');
      const retryable = err.includes('navigation_started') || isRetryableSendMessageError(e);
      if (retryable && attempt + 1 < MAX_ATTEMPTS) {
        await waitForTabComplete(tabId, 15_000).catch(() => undefined);
        await ensureScanRpcInjected(tabId, platform).catch(() => undefined);
        continue;
      }
      throw new Error(err || 'Scan digest failed');
    }

    if (!isRecord(raw)) {
      throw new Error('getConversationMessageHashes returned invalid result');
    }

    const fullDigest = typeof (raw as any).fullDigest === 'string' ? (raw as any).fullDigest : '';
    const messageCountRaw = (raw as any).messageCount;
    const messageCount =
      typeof messageCountRaw === 'number' && Number.isFinite(messageCountRaw)
        ? Math.floor(messageCountRaw)
        : 0;
    const messageHashesRaw = (raw as any).messageHashes;
    const messageHashes = Array.isArray(messageHashesRaw)
      ? messageHashesRaw.map((h: any) => String(h))
      : undefined;

    if (!fullDigest.trim() || messageCount < 0) {
      throw new Error('getConversationMessageHashes returned invalid digest/count');
    }

    return {
      fullDigest: fullDigest.trim(),
      messageCount,
      ...(messageHashes ? { messageHashes } : {}),
    };
  }

  throw new Error('getConversationMessageHashes retry attempts exhausted');
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.floor(ms))));
}

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

type WorkflowRunStatus = 'running' | 'paused';

type WorkflowProgressPayload = {
  runId: string;
  platform: ChatPlatform;
  status: WorkflowRunStatus;
  percent: number;
  finished: number;
  total: number | null;
  elapsedMs: number;
  estimatedTotalMs: number | null;
};

function createProgressEmitter(args: { tabId: number; runId: string; platform: ChatPlatform }) {
  let lastEmitAt = 0;
  let lastKey = '';

  async function emit(payload: WorkflowProgressPayload, opts?: { force?: boolean }): Promise<void> {
    const force = opts?.force === true;
    const now = Date.now();
    const key = JSON.stringify({
      s: payload.status,
      p: payload.percent,
      f: payload.finished,
      t: payload.total,
      e: Math.floor(payload.elapsedMs / 1000),
      est: payload.estimatedTotalMs === null ? null : Math.floor(payload.estimatedTotalMs / 1000),
    });
    if (!force) {
      if (key === lastKey && now - lastEmitAt < 500) return;
      if (now - lastEmitAt < 200) return;
    }

    lastEmitAt = now;
    lastKey = key;

    try {
      await chrome.tabs.sendMessage(args.tabId, {
        action: 'ruminer_workflow_progress',
        payload,
      });
    } catch {
      // ignore: content script may not be ready or present on this tab
    }
  }

  async function clear(): Promise<void> {
    try {
      await chrome.tabs.sendMessage(args.tabId, {
        action: 'ruminer_workflow_clear',
        payload: { runId: args.runId },
      });
    } catch {
      // ignore
    }
  }

  return { emit, clear };
}

function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export const scanAndEnqueueNodeDefinition: NodeDefinition<
  'ruminer.scan_and_ingest_conversations',
  ScanAndEnqueueConfig
> = {
  kind: 'ruminer.scan_and_ingest_conversations',
  schema: scanAndEnqueueConfigSchema,
  async execute(ctx, node) {
    const platform = node.config.platform;
    const tabId = ctx.tabId;

    const runsStore = createRunsStore();

    const emitter = createProgressEmitter({ tabId, runId: ctx.runId, platform });

    const runStartedAt = Date.now();
    let lastStepAt = runStartedAt;
    let emaMsPerStep: number | null = null;

    let scanChecked = 0; // steps: evaluated conversations
    let ingestPending = 0; // steps: conversations that will require ingest (determined during scan)
    let ingestDone = 0; // steps: completed ingest attempts
    let totalConversations: number | null = null;
    let aborted = false;
    let paused = false;

    function totalStepsEstimate(): number | null {
      if (totalConversations === null) return null;
      const remaining = Math.max(0, totalConversations - scanChecked);
      return totalConversations + ingestPending + remaining;
    }

    function finishedSteps(): number {
      return scanChecked + ingestDone;
    }

    function computeEstimatedTotalMs(now: number): number | null {
      const total = totalStepsEstimate();
      if (total === null) return null;
      if (emaMsPerStep === null) return null;
      const elapsed = now - runStartedAt;
      const estimate = Math.max(elapsed, Math.floor(emaMsPerStep * total));
      return estimate;
    }

    async function emitProgress(opts?: { force?: boolean }): Promise<void> {
      const now = Date.now();
      const total = totalStepsEstimate();
      const finished = finishedSteps();
      const percent =
        total && total > 0 ? clampInt((finished / total) * 100, 0, 100) : total === 0 ? 100 : 0;
      const estimatedTotalMs = computeEstimatedTotalMs(now);
      await emitter.emit(
        {
          runId: ctx.runId,
          platform,
          status: paused ? 'paused' : 'running',
          percent,
          finished,
          total,
          elapsedMs: now - runStartedAt,
          estimatedTotalMs,
        },
        opts,
      );
    }

    function onStepCompleted(): void {
      const now = Date.now();
      const dt = now - lastStepAt;
      lastStepAt = now;
      // Clamp dt to reduce huge spikes (tab throttling / background timers / etc.)
      const clamped = clampInt(dt, 50, 60_000);
      emaMsPerStep = emaMsPerStep === null ? clamped : emaMsPerStep * 0.8 + clamped * 0.2;
    }

    async function cooperativeGate(): Promise<boolean> {
      if (isCancelRequested(ctx.runId)) return false;

      for (;;) {
        if (isCancelRequested(ctx.runId)) return false;

        const run = await runsStore.get(ctx.runId).catch(() => null);
        const status = run?.status;
        const isPaused = status === 'paused';

        if (isPaused !== paused) {
          paused = isPaused;
          await emitProgress({ force: true });
        }

        if (!isPaused) return true;

        await sleep(250);
      }
    }

    try {
      // Initial UI signal (content script may not be ready yet; best-effort).
      await emitter.emit(
        {
          runId: ctx.runId,
          platform,
          status: 'running',
          percent: 0,
          finished: 0,
          total: null,
          elapsedMs: 0,
          estimatedTotalMs: null,
        },
        { force: true },
      );

      // Ensure the run tab is on the platform origin before injection.
      try {
        await chrome.tabs.update(tabId, { url: platformHomeUrl(platform) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return toErrorResult(RR_ERROR_CODES.NAVIGATION_FAILED, `Failed to open platform: ${msg}`, {
          error: msg,
          platform,
          tabId,
        });
      }

      await waitForTabComplete(tabId, 15_000).catch(() => undefined);

      try {
        await ensureScanRpcInjected(tabId, platform);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `Scan script inject failed: ${msg}`, {
          error: msg,
          platform,
        });
      }

      // ========= Phase 1: list all conversations =========
      const limit = node.config.limit;

      let offset = 0;
      const all: ConversationListItem[] = [];

      for (;;) {
        if (!(await cooperativeGate())) {
          aborted = true;
          break;
        }

        let list: ListResult;
        try {
          list = await callListConversations(tabId, platform, { offset, limit });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return toErrorResult(
            RR_ERROR_CODES.SCRIPT_FAILED,
            `Scan listConversations failed: ${msg}`,
            { error: msg, platform },
          );
        }

        if (list.items.length > 0) {
          all.push(...list.items);
        }

        if (list.nextOffset === null) break;
        offset = list.nextOffset;
      }

      totalConversations = all.length;
      await emitProgress({ force: true });

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: { scanned: totalConversations, ingested: 0, failed: 0 },
        };
      }

      if (totalConversations === 0) {
        return {
          status: 'succeeded',
          outputs: { scanned: 0, ingested: 0, failed: 0 },
        };
      }

      // ========= Phase 2: read ledger states (batched) =========
      const states: Record<string, any> = {};
      const groupIds = all.map((c) => `${platform}:${c.conversationId}`);
      try {
        for (const batch of chunk(groupIds, 100)) {
          if (!(await cooperativeGate())) {
            aborted = true;
            break;
          }
          const resp = await getConversationStates({ groupIds: batch });
          if (isRecord(resp)) Object.assign(states, resp);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return toErrorResult(
          RR_ERROR_CODES.INTERNAL,
          `Failed to read conversation ledger: ${msg}`,
          {
            error: msg,
            platform,
          },
        );
      }

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: { scanned: totalConversations, ingested: 0, failed: 0 },
        };
      }

      // ========= Phase 3: decide what to ingest =========
      const toIngest: ConversationListItem[] = [];

      for (const c of all) {
        if (!(await cooperativeGate())) {
          aborted = true;
          break;
        }

        const groupId = `${platform}:${c.conversationId}`;
        const state =
          isRecord(states) && isRecord(states[groupId])
            ? (states[groupId] as any)
            : { exists: false };

        let needsIngest = false;

        if (!state.exists) {
          needsIngest = true;
        } else if (state.status === 'skipped') {
          needsIngest = false;
        } else if (state.status === 'failed') {
          needsIngest = true;
        } else {
          let digest: ConversationDigestResult;
          try {
            digest = await callConversationDigest(tabId, platform, {
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `Scan message hash failed: ${msg}`, {
              error: msg,
              platform,
              conversationId: c.conversationId,
            });
          }

          const ledgerCount =
            typeof state.messageCount === 'number' && Number.isFinite(state.messageCount)
              ? Math.floor(state.messageCount)
              : null;
          const ledgerDigest = typeof state.fullDigest === 'string' ? state.fullDigest.trim() : '';

          const unchanged =
            ledgerCount !== null &&
            ledgerDigest &&
            ledgerCount === digest.messageCount &&
            ledgerDigest === digest.fullDigest;

          needsIngest = !unchanged;
        }

        scanChecked += 1;
        onStepCompleted();

        if (needsIngest) {
          toIngest.push(c);
          ingestPending += 1;
        }

        await emitProgress();
      }

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: { scanned: totalConversations, ingested: 0, failed: 0 },
        };
      }

      // ========= Phase 4: ingest =========
      let ingested = 0;
      let failed = 0;

      if (toIngest.length > 0) {
        try {
          ctx.log('info', 'workflow.progress', {
            payload: {
              kind: `${platform}.scanner.enqueued`,
              conversations: toIngest.map((c) => ({
                platform,
                sessionId: `${platform}:${c.conversationId}`,
                conversationId: c.conversationId,
                title: c.conversationTitle,
                url: c.conversationUrl,
              })),
            },
          } as any);
        } catch {
          // ignore
        }
      }

      for (const c of toIngest) {
        if (!(await cooperativeGate())) {
          aborted = true;
          break;
        }

        try {
          await chrome.tabs.update(tabId, { url: c.conversationUrl });
          await waitForTabComplete(tabId, 30_000);
          await ingestConversationInTab({
            tabId,
            runId: ctx.runId,
            conversationUrl: c.conversationUrl,
            platformOverride: platform,
            waitForCompleteMs: 0,
          });
          ingested += 1;
        } catch (e) {
          failed += 1;
          const msg = e instanceof Error ? e.message : String(e);
          try {
            ctx.log('error', 'ruminer.scan_and_ingest: ingest failed', {
              platform,
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
              error: msg,
            } as any);
          } catch {
            // ignore
          }
        } finally {
          ingestDone += 1;
          onStepCompleted();
          await emitProgress();
        }
      }

      const scanned = totalConversations;

      try {
        ctx.log('info', 'ruminer.scan_and_ingest: finished', {
          platform,
          scanned,
          ingested,
          failed,
          ...(aborted ? { aborted: true } : {}),
          ...(emaMsPerStep !== null ? { avgMsPerStep: Math.floor(emaMsPerStep) } : {}),
          elapsed: formatDurationShort(Date.now() - runStartedAt),
        });
      } catch {
        // ignore
      }

      return {
        status: 'succeeded',
        outputs: {
          scanned,
          ingested,
          failed,
        },
      };
    } finally {
      await emitter.clear();
    }
  },
};
