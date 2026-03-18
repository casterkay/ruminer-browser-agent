import { z } from 'zod';

import { type ChatPlatform } from '@/common/chat-platforms';
import { isCancelRequested } from '@/entrypoints/background/record-replay-v3/engine/kernel/run-cancel-registry';
import { createRunsStore } from '@/entrypoints/background/record-replay-v3/storage/runs';
import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import {
  registerAutomationTab,
  setAutomationTabLastProgress,
  unregisterAutomationTab,
} from '../automation-tabs';
import { ruminerIngestConversation } from '../builtin-flows/ingest-workflow-rpc';
import {
  computeConversationDigestFromMessages,
  normalizeConversationMessages,
  type ConversationMessage,
} from '../conversation-digest';
import {
  listConversationEntries,
  upsertConversationEntry,
  type ConversationLedgerEntry,
} from '../conversation-ledger';
import { sha256Hex } from '../hash';
import { toErrorResult } from '../utils';

/**
 * Workflow procedure (scan → ingest, fail-fast):
 *
 * - Load the entire conversation ledger into memory.
 * - Scan newest → oldest (build a "to-process" list without mutating the ledger):
 *   - For new conversations (not in ledger): add to `scanned` immediately without fetching messages/digest.
 *   - For existing conversations: fetch messages + compute digest and stop scanning at the first conversation where
 *     `status='ingested'` and `ledger.digest === computedDigest`. If stop criterion isn't met, keep messages+digest
 *     snapshot in `scanned` (to avoid re-fetching during ingest).
 * - Ingest phase processes `scanned` in reverse order (oldest → newest):
 *   - Only fetch messages + compute digest if not already cached in `scanned`.
 *   - If digest mismatches ledger (or ledger missing), run ingestion (EMOS + local session upserts).
 *   - Always upsert ledger `status='ingested'` + digest/count after processing. On ingestion failure, upsert
 *     `status='failed'` (preserving previous digest/count) and fail the workflow run immediately.
 *
 * Progress semantics:
 * - Scan phase: `finished=0`, `total=scanned.length` (total grows, finished fixed).
 * - Ingest phase: `finished=processedCount`, `total=scanned.length` (total fixed, finished grows).
 */
const scanAndIngestConfigSchema = z.object({
  platform: z.enum(['chatgpt', 'gemini', 'claude', 'deepseek']),
  listPageSize: z.number().int().min(1).max(500).default(100),
  digestThrottleMs: z.number().int().min(0).max(5_000).default(0),
  listThrottleMs: z.number().int().min(0).max(2_000).default(0),
});

type ScanAndIngestConfig = z.infer<typeof scanAndIngestConfigSchema>;

type ConversationListItem = {
  conversationId: string;
  conversationUrl: string;
  conversationTitle: string | null;
  /** Optional; only for API platforms that expose an updated time. */
  updatedAtMs?: number | null;
};

type ListResult = { items: ConversationListItem[]; nextOffset: number | null };

type ConversationMessagesResult = {
  conversationId: string;
  conversationUrl: string | null;
  conversationTitle: string | null;
  messages: unknown;
};

type ScannedConversation = {
  groupId: string;
  conversationId: string;
  conversationUrl: string;
  conversationTitle: string | null;
  snapshot?: {
    messages: ConversationMessage[];
    digest: string;
    messageCount: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Math.floor(ms))));
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

function scanScriptPath(platform: ChatPlatform): string {
  return `inject-scripts/ruminer.${platform}-scan.js`;
}

function scanExecutionWorld(): chrome.scripting.ExecutionWorld {
  // Uses chrome.tabs.sendMessage RPC; injected script must run in ISOLATED world.
  return 'ISOLATED';
}

type DomDiagnostics = {
  href: string | null;
  title: string | null;
  ready: {
    chatHistory: boolean;
    transcriptRoot: boolean;
  };
  counts: {
    anchors: number;
    buttons: number;
    forms: number;
  };
  hrefSamples: string[];
};

async function collectDomDiagnostics(tabId: number): Promise<DomDiagnostics | null> {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: scanExecutionWorld(),
      func: () => {
        const uniq = <T>(arr: T[]) => Array.from(new Set(arr));
        const anchors = Array.from(document.querySelectorAll('a[href]'))
          .map((a) => String(a.getAttribute('href') || '').trim())
          .filter(Boolean);

        const hrefSamples = uniq(anchors)
          .filter((h) => {
            // Prefer links that look like app routes rather than externals.
            if (h.startsWith('http:') || h.startsWith('https:')) {
              try {
                return new URL(h).hostname === location.hostname;
              } catch {
                return false;
              }
            }
            return h.startsWith('/') || h.startsWith('#') || h.startsWith('?') || h.startsWith('.');
          })
          .slice(0, 30);

        return {
          href: typeof location?.href === 'string' ? location.href : null,
          title: typeof document?.title === 'string' ? document.title : null,
          ready: {
            chatHistory: Boolean(document.querySelector('#chat-history')),
            transcriptRoot: Boolean(
              document.querySelector('#chat-history') ||
              document.querySelector('chat-history') ||
              document.querySelector('[data-test-id*="chat-history"]') ||
              document.querySelector('[data-testid*="chat-history"]'),
            ),
          },
          counts: {
            anchors: anchors.length,
            buttons: document.querySelectorAll('button').length,
            forms: document.querySelectorAll('form').length,
          },
          hrefSamples,
        };
      },
    });
    const value = res?.[0]?.result as any;
    if (!isRecord(value)) return null;
    return value as DomDiagnostics;
  } catch {
    return null;
  }
}

async function injectScanScript(tabId: number, platform: ChatPlatform): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [scanScriptPath(platform)],
    world: scanExecutionWorld(),
  });
}

async function probeScanApi(tabId: number): Promise<Record<string, unknown> | null> {
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
    const probe = await probeScanApi(tabId);
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
  action: 'ruminer_scan_listConversations' | 'ruminer_scan_getConversationMessages',
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

  if (!isRecord(raw)) {
    const p0 = await probeScanApi(tabId);
    throw new Error(
      `listConversations returned invalid result (probe=${isRecord(p0) ? JSON.stringify(p0) : 'null'})`,
    );
  }

  const itemsRaw = Array.isArray((raw as any).items)
    ? (raw as any).items
    : Array.isArray((raw as any).conversations)
      ? (raw as any).conversations
      : [];
  const nextOffsetRaw = (raw as any).nextOffset;
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

      const updatedAtRaw = (it as any)?.updatedAtMs ?? (it as any)?.updatedAt ?? null;
      const updatedAtMs =
        typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw)
          ? Math.floor(updatedAtRaw)
          : null;

      return {
        conversationId,
        conversationUrl,
        conversationTitle,
        ...(updatedAtMs !== null ? { updatedAtMs } : {}),
      };
    })
    .filter(Boolean) as ConversationListItem[];

  return { items, nextOffset };
}

async function callConversationMessages(
  tabId: number,
  platform: ChatPlatform,
  payload: { conversationId: string; conversationUrl: string },
): Promise<ConversationMessagesResult> {
  const raw = await callScanRpc<unknown>(tabId, platform, 'ruminer_scan_getConversationMessages', {
    conversationId: payload.conversationId,
    conversationUrl: payload.conversationUrl,
  }).catch((e) => {
    throw e instanceof Error ? e : new Error(String(e));
  });

  if (!isRecord(raw)) {
    throw new Error('getConversationMessages returned invalid result');
  }

  const conversationId =
    typeof (raw as any).conversationId === 'string' ? String((raw as any).conversationId) : '';
  const conversationUrl =
    typeof (raw as any).conversationUrl === 'string' && String((raw as any).conversationUrl).trim()
      ? String((raw as any).conversationUrl).trim()
      : null;
  const conversationTitle =
    typeof (raw as any).conversationTitle === 'string' &&
    String((raw as any).conversationTitle).trim()
      ? String((raw as any).conversationTitle).trim()
      : null;
  const messages = (raw as any).messages as unknown;

  if (!conversationId.trim()) {
    throw new Error('getConversationMessages missing conversationId');
  }

  return {
    conversationId: conversationId.trim(),
    conversationUrl,
    conversationTitle,
    messages,
  };
}

function toGroupId(platform: ChatPlatform, conversationId: string): string {
  return `${platform}:${conversationId}`;
}

function shouldStopScan(entry: ConversationLedgerEntry | undefined, digest: string): boolean {
  if (!entry) return false;
  if (entry.status !== 'ingested') return false;
  if (typeof entry.messages_digest !== 'string' || !entry.messages_digest.trim()) return false;
  return entry.messages_digest.trim() === digest;
}

function toTrimmedLedgerDigest(entry: ConversationLedgerEntry | undefined): string {
  const raw = entry?.messages_digest;
  return typeof raw === 'string' ? raw.trim() : '';
}

function toLedgerCount(entry: ConversationLedgerEntry | undefined): number | null {
  const n = entry?.message_count;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

let emptyDigestPromise: Promise<string> | null = null;
function emptyConversationDigest(): Promise<string> {
  // The user request is explicit: treat empty conversations as ingested with sha256('').
  // Cache to avoid recomputing during a long scan run.
  emptyDigestPromise ??= sha256Hex('');
  return emptyDigestPromise;
}

function buildIngestedLedgerEntry(args: {
  existing: ConversationLedgerEntry | undefined;
  nowIso: string;
  platform: ChatPlatform;
  conversationId: string;
  conversationUrl: string | null;
  conversationTitle: string | null;
  digest: string;
  messageCount: number;
}): ConversationLedgerEntry {
  const groupId = toGroupId(args.platform, args.conversationId);
  return {
    group_id: groupId,
    platform: args.platform,
    conversation_id: args.conversationId,
    conversation_url: args.conversationUrl,
    conversation_title: args.conversationTitle,
    status: 'ingested',
    messages_digest: args.digest,
    message_count: args.messageCount,
    first_seen_at: args.existing?.first_seen_at ?? args.nowIso,
    last_seen_at: args.nowIso,
    last_ingested_at: args.nowIso,
    last_error: null,
  };
}

function buildFailedLedgerEntry(args: {
  existing: ConversationLedgerEntry | undefined;
  nowIso: string;
  platform: ChatPlatform;
  conversationId: string;
  conversationUrl: string | null;
  conversationTitle: string | null;
  error: string;
}): ConversationLedgerEntry {
  const groupId = toGroupId(args.platform, args.conversationId);
  return {
    group_id: groupId,
    platform: args.platform,
    conversation_id: args.conversationId,
    conversation_url: args.conversationUrl,
    conversation_title: args.conversationTitle,
    status: 'failed',
    // Do not change digest/count on failure.
    messages_digest: args.existing?.messages_digest ?? null,
    message_count: args.existing?.message_count ?? null,
    first_seen_at: args.existing?.first_seen_at ?? args.nowIso,
    last_seen_at: args.nowIso,
    last_ingested_at: args.existing?.last_ingested_at ?? null,
    last_error: args.error,
  };
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
    void setAutomationTabLastProgress(args.tabId, payload);

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
    void setAutomationTabLastProgress(args.tabId, null);
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

function createStructuredProgressLogger(ctx: {
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) => void;
}) {
  let lastAt = 0;
  let lastKey = '';

  function emit(data: Record<string, unknown>): void {
    const now = Date.now();
    const key = JSON.stringify(data);
    if (key === lastKey && now - lastAt < 1_000) return;
    if (now - lastAt < 750) return;
    lastAt = now;
    lastKey = key;
    try {
      ctx.log('info', 'ruminer.scan_and_ingest.progress', data);
    } catch {
      // ignore
    }
  }

  return { emit };
}

export const scanAndEnqueueNodeDefinition: NodeDefinition<
  'ruminer.scan_and_ingest_conversations',
  ScanAndIngestConfig
> = {
  kind: 'ruminer.scan_and_ingest_conversations',
  schema: scanAndIngestConfigSchema,
  async execute(ctx, node) {
    const platform = node.config.platform;
    const tabId = ctx.tabId;
    const digestThrottleMs = clampInt(node.config.digestThrottleMs, 0, 5_000);
    const listThrottleMs = clampInt(node.config.listThrottleMs, 0, 2_000);
    const listPageSize = clampInt(node.config.listPageSize, 1, 500);

    const runsStore = createRunsStore();

    try {
      await registerAutomationTab({ tabId, runId: ctx.runId });
    } catch {
      // ignore
    }

    const emitter = createProgressEmitter({ tabId, runId: ctx.runId, platform });

    const runStartedAt = Date.now();
    let lastStepAt = runStartedAt;
    let emaMsPerStep: number | null = null;

    let aborted = false;
    let paused = false;
    const structuredLogger = createStructuredProgressLogger(ctx);
    let phase: 'scan' | 'ingest' = 'scan';
    let ingestProcessed = 0;
    const scanned: ScannedConversation[] = [];

    function onStepCompleted(): void {
      const now = Date.now();
      const dt = now - lastStepAt;
      lastStepAt = now;
      const clamped = clampInt(dt, 50, 60_000);
      emaMsPerStep = emaMsPerStep === null ? clamped : emaMsPerStep * 0.8 + clamped * 0.2;
    }

    function computeEstimatedTotalMs(now: number): number | null {
      if (phase !== 'ingest') return null;
      if (emaMsPerStep === null) return null;
      const total = scanned.length;
      if (total <= 0) return null;
      const elapsed = now - runStartedAt;
      const estimate = Math.max(elapsed, Math.floor(emaMsPerStep * total));
      return estimate;
    }

    async function emitProgress(opts?: { force?: boolean }): Promise<void> {
      const now = Date.now();
      const total = scanned.length;
      const finished = phase === 'scan' ? 0 : ingestProcessed;
      const percent =
        total > 0 ? clampInt((finished / total) * 100, 0, 100) : phase === 'ingest' ? 100 : 0;
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

      structuredLogger.emit({
        platform,
        mode: platform === 'chatgpt' ? 'api' : 'dom',
        phase,
        scannedTotal: scanned.length,
        convProcessed: phase === 'scan' ? undefined : ingestProcessed,
        convIngested: undefined,
        convSkipped: undefined,
        convFailed: undefined,
        finished,
        total,
        percent,
      });
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
      await emitter.emit(
        {
          runId: ctx.runId,
          platform,
          status: 'running',
          percent: 0,
          finished: 0,
          total: 0,
          elapsedMs: 0,
          estimatedTotalMs: null,
        },
        { force: true },
      );

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

      // ===== Load entire ledger into memory (no mutation) =====
      let ledgerByGroupId: Map<string, ConversationLedgerEntry>;
      try {
        const all = await listConversationEntries();
        ledgerByGroupId = new Map(all.map((e) => [e.group_id, e]));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return toErrorResult(
          RR_ERROR_CODES.INTERNAL,
          `Failed to load conversation ledger: ${msg}`,
          {
            error: msg,
            platform,
          },
        );
      }

      // ===== Build conversation iteration order =====
      const allConversations: ConversationListItem[] = [];

      try {
        if (platform === 'chatgpt') {
          // API list: fetch full metadata list first; sort by updatedAtMs if present; else preserve returned order.
          let offset = 0;
          for (;;) {
            if (!(await cooperativeGate())) {
              aborted = true;
              break;
            }
            const list = await callListConversations(tabId, platform, {
              offset,
              limit: listPageSize,
            });
            if (list.items.length > 0) allConversations.push(...list.items);
            await emitProgress();
            if (listThrottleMs > 0) await sleep(listThrottleMs);
            if (list.nextOffset === null) break;
            offset = list.nextOffset;
          }

          const hasUpdated = allConversations.some(
            (c) => typeof c.updatedAtMs === 'number' && Number.isFinite(c.updatedAtMs),
          );
          if (hasUpdated) {
            allConversations.sort((a, b) => {
              const aT =
                typeof a.updatedAtMs === 'number' && Number.isFinite(a.updatedAtMs)
                  ? a.updatedAtMs
                  : 0;
              const bT =
                typeof b.updatedAtMs === 'number' && Number.isFinite(b.updatedAtMs)
                  ? b.updatedAtMs
                  : 0;
              return bT - aT;
            });
          }

          await emitProgress({ force: true });
        } else {
          // DOM list: do not pre-scroll the entire list; fetch one-by-one by offset.
          // No-op: scanTotal is implicitly `scanned.length`.
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return toErrorResult(
          RR_ERROR_CODES.SCRIPT_FAILED,
          `Scan listConversations failed: ${msg}`,
          {
            error: msg,
            platform,
          },
        );
      }

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: { scanned: 0, ingested: 0, failed: 0, skipped: 0 },
        };
      }

      // ===== Scan phase: build scanned list (new convos without snapshot; existing convos snapshot + stop check) =====
      try {
        if (platform === 'chatgpt') {
          for (const c of allConversations) {
            if (!(await cooperativeGate())) {
              aborted = true;
              break;
            }

            const groupId = toGroupId(platform, c.conversationId);
            const entry = ledgerByGroupId.get(groupId);

            // New conversation: do not fetch messages/digest during scan; just enqueue for ingest phase.
            if (!entry) {
              scanned.push({
                groupId,
                conversationId: c.conversationId,
                conversationUrl: c.conversationUrl,
                conversationTitle: c.conversationTitle,
              });
              onStepCompleted();
              await emitProgress();
              continue;
            }

            if (digestThrottleMs > 0) await sleep(digestThrottleMs);

            const conv = await callConversationMessages(tabId, platform, {
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
            });

            const messages = normalizeConversationMessages(conv.messages);
            if (messages.length === 0) {
              const rawIsEmpty =
                Array.isArray(conv.messages) && (conv.messages as unknown[]).length === 0;
              if (rawIsEmpty) {
                const digest = await emptyConversationDigest();
                const messageCount = 0;

                // Never stop scan on empties; still include in scanned list so ingest phase can persist ledger digest.
                scanned.push({
                  groupId,
                  conversationId: c.conversationId,
                  conversationUrl: c.conversationUrl,
                  conversationTitle: c.conversationTitle,
                  snapshot: { messages: [], digest, messageCount },
                });
                onStepCompleted();
                await emitProgress();
                continue;
              }

              throw new Error(
                `Conversation has no extractable messages (conversationId=${conv.conversationId})`,
              );
            }

            const { digest, messageCount } = await computeConversationDigestFromMessages(messages);

            if (shouldStopScan(entry, digest)) {
              break;
            }

            scanned.push({
              groupId,
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
              conversationTitle: c.conversationTitle,
              snapshot: { messages, digest, messageCount },
            });
            onStepCompleted();
            await emitProgress();
          }
        } else {
          let offset = 0;
          for (;;) {
            if (!(await cooperativeGate())) {
              aborted = true;
              break;
            }

            let list = await callListConversations(tabId, platform, { offset, limit: 1 });
            let c = list.items[0];
            if (!c) {
              if (offset === 0) {
                const dom0 = await collectDomDiagnostics(tabId);
                const shouldRetryForLoadingUi =
                  dom0 !== null &&
                  dom0.counts.anchors === 0 &&
                  dom0.counts.buttons === 0 &&
                  dom0.counts.forms === 0;

                // Some SPAs can render a mostly-empty DOM while the sidebar is still loading.
                // Treat "no conversations at offset=0" as a transient state and retry briefly before failing.
                if (shouldRetryForLoadingUi) {
                  const deadline = Date.now() + 10_000;
                  while (Date.now() < deadline) {
                    if (!(await cooperativeGate())) {
                      aborted = true;
                      break;
                    }
                    await sleep(500);
                    list = await callListConversations(tabId, platform, { offset, limit: 1 });
                    c = list.items[0];
                    if (c) break;
                  }
                }

                if (aborted) break;

                if (!c) {
                  const probe = await probeScanApi(tabId);
                  const dom = dom0 ?? (await collectDomDiagnostics(tabId));
                  const diag = { probe, dom };
                  throw new Error(
                    `No conversations found at offset=0 (diagnostics=${JSON.stringify(diag)})`,
                  );
                }
              }
              if (!c) break;
            }

            const groupId = toGroupId(platform, c.conversationId);
            const entry = ledgerByGroupId.get(groupId);

            // New conversation: do not fetch messages/digest during scan; just enqueue for ingest phase.
            if (!entry) {
              scanned.push({
                groupId,
                conversationId: c.conversationId,
                conversationUrl: c.conversationUrl,
                conversationTitle: c.conversationTitle,
              });
              onStepCompleted();
              await emitProgress();
              offset += 1;
              if (listThrottleMs > 0) await sleep(listThrottleMs);
              continue;
            }

            if (digestThrottleMs > 0) await sleep(digestThrottleMs);

            const conv = await callConversationMessages(tabId, platform, {
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
            });

            const messages = normalizeConversationMessages(conv.messages);
            if (messages.length === 0) {
              const rawIsEmpty =
                Array.isArray(conv.messages) && (conv.messages as unknown[]).length === 0;
              if (rawIsEmpty) {
                const digest = await emptyConversationDigest();
                const messageCount = 0;

                // Never stop scan on empties; still include in scanned list so ingest phase can persist ledger digest.
                scanned.push({
                  groupId,
                  conversationId: c.conversationId,
                  conversationUrl: c.conversationUrl,
                  conversationTitle: c.conversationTitle,
                  snapshot: { messages: [], digest, messageCount },
                });
                onStepCompleted();
                await emitProgress();

                offset += 1;
                if (listThrottleMs > 0) await sleep(listThrottleMs);
                continue;
              }

              const probe = await probeScanApi(tabId);
              const dom = await collectDomDiagnostics(tabId);
              throw new Error(
                `Conversation has no extractable messages (conversationId=${conv.conversationId}, url=${String(
                  conv.conversationUrl || c.conversationUrl || '',
                )}; diagnostics=${JSON.stringify({ probe, dom })})`,
              );
            }

            const { digest, messageCount } = await computeConversationDigestFromMessages(messages);

            if (shouldStopScan(entry, digest)) {
              break;
            }

            scanned.push({
              groupId,
              conversationId: c.conversationId,
              conversationUrl: c.conversationUrl,
              conversationTitle: c.conversationTitle,
              snapshot: { messages, digest, messageCount },
            });
            onStepCompleted();
            await emitProgress();

            offset += 1;
            if (listThrottleMs > 0) await sleep(listThrottleMs);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Scan failures must fail the entire workflow immediately (no ledger writes).
        return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `Scan failed: ${msg}`, {
          error: msg,
          platform,
        });
      }

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: {
            scanned: scanned.length,
            ingested: 0,
            failed: 0,
            skipped: 0,
            aborted: true,
          },
        };
      }

      // ===== Ingest phase: process scanned list in reverse order (oldest → newest) =====
      phase = 'ingest';
      ingestProcessed = 0;
      await emitProgress({ force: true });

      let ingested = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = scanned.length - 1; i >= 0; i--) {
        if (!(await cooperativeGate())) {
          aborted = true;
          break;
        }

        const item = scanned[i];
        const existing = ledgerByGroupId.get(item.groupId);

        try {
          // Only fetch + digest if not already cached in the scan phase.
          if (!item.snapshot) {
            if (digestThrottleMs > 0) await sleep(digestThrottleMs);

            const conv = await callConversationMessages(tabId, platform, {
              conversationId: item.conversationId,
              conversationUrl: item.conversationUrl,
            });

            const messages = normalizeConversationMessages(conv.messages);
            if (messages.length === 0) {
              const rawIsEmpty =
                Array.isArray(conv.messages) && (conv.messages as unknown[]).length === 0;
              if (rawIsEmpty) {
                const digest = await emptyConversationDigest();
                item.snapshot = { messages: [], digest, messageCount: 0 };
              } else {
                const probe = await probeScanApi(tabId);
                const dom = await collectDomDiagnostics(tabId);
                throw new Error(
                  `Conversation has no extractable messages (conversationId=${conv.conversationId}, url=${String(
                    conv.conversationUrl || item.conversationUrl || '',
                  )}; diagnostics=${JSON.stringify({ probe, dom })})`,
                );
              }
            }

            if (!item.snapshot) {
              const computed = await computeConversationDigestFromMessages(messages);
              item.snapshot = {
                messages,
                digest: computed.digest,
                messageCount: computed.messageCount,
              };
            }
          }

          const { messages, digest, messageCount } = item.snapshot;
          const ledgerDigest = toTrimmedLedgerDigest(existing);
          const digestsMatch = Boolean(ledgerDigest && ledgerDigest === digest);

          if (messageCount === 0) {
            // Empty conversations exist (e.g. created then abandoned / deleted content).
            // Persist an "ingested" empty digest to avoid retrying forever.
            skipped += 1;
          } else if (!existing || !digestsMatch) {
            // Prefix-only optimization for appended messages: if old digest matches new prefix, ingest suffix only.
            let baseIndex = 0;
            let messagesToIngest = messages;
            const oldCount = toLedgerCount(existing);
            if (
              existing?.status === 'ingested' &&
              ledgerDigest &&
              oldCount &&
              oldCount <= messageCount
            ) {
              const prefix = messages.slice(0, oldCount);
              const { digest: prefixDigest } = await computeConversationDigestFromMessages(prefix);
              if (prefixDigest === ledgerDigest) {
                baseIndex = oldCount;
                messagesToIngest = messages.slice(oldCount);
              }
            }

            const ingestResp = await ruminerIngestConversation({
              platform,
              conversationId: item.conversationId,
              runId: ctx.runId,
              baseIndex,
              messageCount,
              conversationTitle: item.conversationTitle,
              conversationUrl: item.conversationUrl,
              messages: messagesToIngest.map((m) => ({ role: m.role, content: m.content })),
            });

            if (!isRecord(ingestResp) || (ingestResp as any).ok !== true) {
              const err =
                isRecord(ingestResp) && typeof (ingestResp as any).error === 'string'
                  ? String((ingestResp as any).error || 'Ingest failed')
                  : 'Ingest failed';
              const nowIso = new Date().toISOString();
              const nextFailed = buildFailedLedgerEntry({
                existing,
                nowIso,
                platform,
                conversationId: item.conversationId,
                conversationUrl: item.conversationUrl,
                conversationTitle: item.conversationTitle,
                error: err,
              });
              await upsertConversationEntry(nextFailed);
              ledgerByGroupId.set(item.groupId, nextFailed);
              failed += 1;
              structuredLogger.emit({
                platform,
                mode: platform === 'chatgpt' ? 'api' : 'dom',
                phase,
                scannedTotal: scanned.length,
                convProcessed: ingestProcessed,
                convIngested: ingested,
                convSkipped: skipped,
                convFailed: failed,
              });
              // Ingest failure must fail the entire workflow immediately.
              return toErrorResult(RR_ERROR_CODES.NETWORK_REQUEST_FAILED, `Ingest failed: ${err}`, {
                error: err,
                platform,
                conversationId: item.conversationId,
                conversationUrl: item.conversationUrl,
              });
            }

            ingested += 1;
          } else {
            skipped += 1;
          }

          const nowIso = new Date().toISOString();
          const nextOk = buildIngestedLedgerEntry({
            existing,
            nowIso,
            platform,
            conversationId: item.conversationId,
            conversationUrl: item.conversationUrl,
            conversationTitle: item.conversationTitle,
            digest,
            messageCount,
          });
          await upsertConversationEntry(nextOk);
          ledgerByGroupId.set(item.groupId, nextOk);
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          const nowIso = new Date().toISOString();
          const nextFailed = buildFailedLedgerEntry({
            existing,
            nowIso,
            platform,
            conversationId: item.conversationId,
            conversationUrl: item.conversationUrl,
            conversationTitle: item.conversationTitle,
            error: err,
          });
          await upsertConversationEntry(nextFailed);
          ledgerByGroupId.set(item.groupId, nextFailed);
          failed += 1;
          structuredLogger.emit({
            platform,
            mode: platform === 'chatgpt' ? 'api' : 'dom',
            phase,
            scannedTotal: scanned.length,
            convProcessed: ingestProcessed,
            convIngested: ingested,
            convSkipped: skipped,
            convFailed: failed,
          });
          return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `Ingest failed: ${err}`, {
            error: err,
            platform,
            conversationId: item.conversationId,
            conversationUrl: item.conversationUrl,
          });
        } finally {
          ingestProcessed += 1;
          onStepCompleted();
          await emitProgress();
          structuredLogger.emit({
            platform,
            mode: platform === 'chatgpt' ? 'api' : 'dom',
            phase,
            scannedTotal: scanned.length,
            convProcessed: ingestProcessed,
            convIngested: ingested,
            convSkipped: skipped,
            convFailed: failed,
          });
        }
      }

      if (aborted) {
        return {
          status: 'succeeded',
          outputs: {
            scanned: scanned.length,
            ingested,
            skipped,
            failed,
            aborted: true,
          },
        };
      }

      return {
        status: 'succeeded',
        outputs: {
          scanned: scanned.length,
          ingested,
          skipped,
          failed,
        },
      };
    } finally {
      await unregisterAutomationTab(tabId).catch(() => undefined);
      await emitter.clear();
    }
  },
};
