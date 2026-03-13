import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import {
  ruminerEnqueueRuns,
  type RuminerIngestPlatform,
} from '../builtin-flows/ingest-workflow-rpc';
import { getConversationStates } from '../conversation-ledger';
import { toErrorResult } from '../utils';

const TAB_ID_VAR = '__rr_v2__tabId';

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

function readNumberVar(vars: Record<string, unknown>, key: string): number | null {
  const v = vars[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

function platformBaseUrl(platform: RuminerIngestPlatform): string {
  switch (platform) {
    case 'chatgpt':
      return 'https://chatgpt.com/';
    case 'claude':
      return 'https://claude.ai/';
    case 'deepseek':
      return 'https://chat.deepseek.com/';
    case 'gemini':
      return 'https://gemini.google.com/app';
    default:
      return 'about:blank';
  }
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

function scanScriptPath(platform: RuminerIngestPlatform): string {
  return `inject-scripts/ruminer.${platform}-scan.js`;
}

function ingestFlowId(platform: RuminerIngestPlatform): string {
  return `${platform}.conversation_ingest.v1`;
}

async function probeScanApi(tabId: number): Promise<Record<string, unknown> | null> {
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        try {
          const api = (window as any).__RUMINER_SCAN__;
          const apiType = typeof api;
          const keys = api && typeof api === 'object' ? Object.keys(api).slice(0, 20) : [];
          return {
            ok: true,
            href: String(location.href || ''),
            hasApi: Boolean(api),
            apiType,
            apiPlatform: api && typeof api === 'object' ? String((api as any).platform || '') : '',
            apiVersion: api && typeof api === 'object' ? String((api as any).version || '') : '',
            hasList: Boolean(api && typeof api === 'object' && (api as any).listConversations),
            listType:
              api && typeof api === 'object' ? typeof (api as any).listConversations : 'none',
            hasMessageHashes: Boolean(
              api && typeof api === 'object' && (api as any).getConversationMessageHashes,
            ),
            messageHashesType:
              api && typeof api === 'object'
                ? typeof (api as any).getConversationMessageHashes
                : 'none',
            keys,
          };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
    });

    const p0 = Array.isArray(probe) ? (probe[0] as any)?.result : null;
    return isRecord(p0) ? p0 : null;
  } catch {
    return null;
  }
}

async function injectScanScript(tabId: number, platform: RuminerIngestPlatform): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [scanScriptPath(platform)],
    world: 'ISOLATED',
  });
}

async function callListConversations(
  tabId: number,
  platform: RuminerIngestPlatform,
  payload: { offset: number; limit: number },
): Promise<ListResult> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: async (args: { platform: string; offset: number; limit: number }) => {
      try {
        const api = (window as any).__RUMINER_SCAN__;
        if (!api) return { ok: false, error: '__RUMINER_SCAN__ not found on window' };
        if (api.platform !== args.platform) {
          return {
            ok: false,
            error: `__RUMINER_SCAN__ platform mismatch (expected=${args.platform}, got=${String(api.platform || '')})`,
          };
        }
        if (typeof api.listConversations !== 'function') {
          return { ok: false, error: '__RUMINER_SCAN__.listConversations is not a function' };
        }
        return await api.listConversations({ offset: args.offset, limit: args.limit });
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    args: [{ platform, offset: payload.offset, limit: payload.limit }],
  });

  const rawResults = Array.isArray(results) ? results : [];
  const candidates = rawResults.map((r) => (r as any)?.result);

  const firstFailure = candidates.find((x) => isRecord(x) && (x as any).ok === false);
  if (isRecord(firstFailure) && typeof (firstFailure as any).error === 'string') {
    throw new Error((firstFailure as any).error);
  }

  const raw =
    candidates.find((x) => !(isRecord(x) && (x as any).ok === false) && x !== undefined) ?? null;

  if (raw === null || raw === undefined) {
    const p0 = await probeScanApi(tabId);
    throw new Error(
      `listConversations returned invalid result (probe=${isRecord(p0) ? JSON.stringify(p0) : 'null'})`,
    );
  }

  // Compatibility: allow returning either `{ items, nextOffset }` or an array of items.
  const normalized = Array.isArray(raw)
    ? { items: raw, nextOffset: raw.length > 0 ? payload.offset + raw.length : null }
    : raw;

  if (!isRecord(normalized)) {
    const p0 = await probeScanApi(tabId);
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
  platform: RuminerIngestPlatform,
  payload: { conversationId: string; conversationUrl: string },
): Promise<ConversationDigestResult> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: async (args: { platform: string; conversationId: string; conversationUrl: string }) => {
        try {
          const api = (window as any).__RUMINER_SCAN__;
          if (!api) return { ok: false, error: '__RUMINER_SCAN__ not found on window' };
          if (api.platform !== args.platform) {
            return {
              ok: false,
              error: `__RUMINER_SCAN__ platform mismatch (expected=${args.platform}, got=${String(api.platform || '')})`,
            };
          }
          if (typeof api.getConversationMessageHashes !== 'function') {
            return {
              ok: false,
              error: '__RUMINER_SCAN__.getConversationMessageHashes is not a function',
            };
          }
          return await api.getConversationMessageHashes({
            conversationId: args.conversationId,
            conversationUrl: args.conversationUrl,
          });
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
      args: [
        {
          platform,
          conversationId: payload.conversationId,
          conversationUrl: payload.conversationUrl,
        },
      ],
    });

    const rawResults = Array.isArray(results) ? results : [];
    const firstFailure = rawResults
      .map((r) => (r as any)?.result)
      .find((x) => isRecord(x) && (x as any).ok === false);

    if (isRecord(firstFailure) && typeof (firstFailure as any).error === 'string') {
      const err = String((firstFailure as any).error || '');
      const retryable =
        err.includes('navigation_started') || err.includes('__RUMINER_SCAN__ not found on window');
      if (retryable && attempt + 1 < MAX_ATTEMPTS) {
        await waitForTabComplete(tabId, 15_000).catch(() => undefined);
        await injectScanScript(tabId, platform).catch(() => undefined);
        continue;
      }
      throw new Error(err);
    }

    const raw =
      rawResults
        .map((r) => (r as any)?.result)
        .find((x) => isRecord(x) && (x as any).ok !== false) ?? null;

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

export const scanAndEnqueueNodeDefinition: NodeDefinition<
  'ruminer.scan_and_enqueue_conversations',
  ScanAndEnqueueConfig
> = {
  kind: 'ruminer.scan_and_enqueue_conversations',
  schema: scanAndEnqueueConfigSchema,
  async execute(ctx, node) {
    const platform = node.config.platform;
    const vars = ctx.vars as unknown as Record<string, unknown>;
    const backgroundTabId = readNumberVar(vars, TAB_ID_VAR);
    let effectiveTabId: number | null = null;
    let createdBackgroundTabId: number | null = null;

    try {
      // Scanning should never run on ctx.tabId because it can scroll/navigate the user's active tab.
      if (backgroundTabId) {
        effectiveTabId = backgroundTabId;
      } else {
        const url = platformBaseUrl(platform);
        const tab = await chrome.tabs.create({ url, active: false });
        if (tab.id === undefined) {
          return toErrorResult(RR_ERROR_CODES.TAB_NOT_FOUND, 'Failed to open background tab', {
            platform,
            url,
          });
        }
        createdBackgroundTabId = tab.id;
        effectiveTabId = tab.id;
        await waitForTabComplete(tab.id, 15_000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toErrorResult(RR_ERROR_CODES.NAVIGATION_FAILED, `Failed to prepare scan tab: ${msg}`, {
        error: msg,
        platform,
      });
    }

    if (!effectiveTabId) {
      return toErrorResult(RR_ERROR_CODES.TAB_NOT_FOUND, 'Failed to resolve scan tab', {
        platform,
        ctxTabId: ctx.tabId,
        backgroundTabId,
      });
    }

    try {
      await injectScanScript(effectiveTabId, platform);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, `Scan script inject failed: ${msg}`, {
        error: msg,
        platform,
      });
    }

    const flowId = ingestFlowId(platform);
    const limit = node.config.limit;

    let offset = 0;
    let scanned = 0;
    let enqueued = 0;

    try {
      while (true) {
        let list: ListResult;
        try {
          list = await callListConversations(effectiveTabId, platform, { offset, limit });
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

        const items = list.items;
        if (items.length === 0) break;

        const groupIds = items.map((c) => `${platform}:${c.conversationId}`);
        let states: Record<string, any> = {};
        try {
          states = await getConversationStates({ groupIds });
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

        const toEnqueue: Array<{ flowId: string; args: Record<string, unknown> }> = [];

        for (const c of items) {
          scanned += 1;
          const groupId = `${platform}:${c.conversationId}`;
          const state =
            isRecord(states) && isRecord(states[groupId])
              ? (states[groupId] as any)
              : { exists: false };

          if (!state.exists) {
            toEnqueue.push({
              flowId,
              args: {
                ruminerPlatform: platform,
                ruminerConversationId: c.conversationId,
                ruminerConversationUrl: c.conversationUrl,
                ...(c.conversationTitle ? { ruminerConversationTitle: c.conversationTitle } : {}),
              },
            });
            continue;
          }

          if (state.status === 'skipped') continue;
          if (state.status === 'failed') {
            toEnqueue.push({
              flowId,
              args: {
                ruminerPlatform: platform,
                ruminerConversationId: c.conversationId,
                ruminerConversationUrl: c.conversationUrl,
                ...(c.conversationTitle ? { ruminerConversationTitle: c.conversationTitle } : {}),
              },
            });
            continue;
          }

          let digest: ConversationDigestResult;
          try {
            digest = await callConversationDigest(effectiveTabId, platform, {
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

          if (!unchanged) {
            toEnqueue.push({
              flowId,
              args: {
                ruminerPlatform: platform,
                ruminerConversationId: c.conversationId,
                ruminerConversationUrl: c.conversationUrl,
                ...(c.conversationTitle ? { ruminerConversationTitle: c.conversationTitle } : {}),
              },
            });
          }
        }

        if (toEnqueue.length > 0) {
          const resp = await ruminerEnqueueRuns(toEnqueue as any);
          if (!isRecord(resp) || resp.ok !== true) {
            const err =
              isRecord(resp) && typeof resp.error === 'string' ? resp.error : 'enqueueRuns failed';
            return toErrorResult(RR_ERROR_CODES.INTERNAL, err, { error: err, platform });
          }
          const r = isRecord(resp.result) ? (resp.result as any) : {};
          const count = typeof r.enqueued === 'number' ? r.enqueued : 0;
          enqueued += count;
        }

        if (list.nextOffset === null) break;
        offset = list.nextOffset;
      }
    } finally {
      if (createdBackgroundTabId && createdBackgroundTabId !== ctx.tabId) {
        await chrome.tabs.remove(createdBackgroundTabId).catch(() => {});
      }
    }

    try {
      ctx.log('info', 'ruminer.scan_and_enqueue: finished', {
        platform,
        scanned,
        enqueued,
      });
    } catch {
      // ignore
    }

    return {
      status: 'succeeded',
      outputs: {
        scanned,
        enqueued,
      },
    };
  },
};
