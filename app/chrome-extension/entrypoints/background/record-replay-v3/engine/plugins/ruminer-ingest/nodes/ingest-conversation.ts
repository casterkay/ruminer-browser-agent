import { z } from 'zod';

import { inferPlatformFromUrl, type ChatPlatform } from '@/common/chat-platforms';
import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import { ruminerIngestConversation } from '../builtin-flows/ingest-workflow-rpc';
import {
  getConversationEntry,
  upsertConversationEntry,
  type ConversationLedgerEntry,
} from '../conversation-ledger';
import {
  computeConversationDigestFromMessages,
  normalizeConversationContent,
  type ConversationMessage,
} from '../conversation-digest';
import { toErrorResult } from '../utils';

const ingestCurrentConfigSchema = z.object({
  conversationUrlVar: z.string().default('ruminerConversationUrl'),
  tabIdVar: z.string().default(''),
  tabId: z.number().int().positive().optional(),
  ensureTabUrl: z.enum(['none', 'require_match', 'navigate_if_needed']).default('none'),
});

type IngestCurrentConfig = z.infer<typeof ingestCurrentConfigSchema>;

type InjectedSuccess = {
  conversationId: string;
  conversationTitle: string | null;
  conversationUrl: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createTime?: string | null;
    messageId?: string | null;
  }>;
};

type InjectedFailure = { ok: false; error: string };

type InjectedResult = InjectedSuccess | InjectedFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readNumberVar(vars: Record<string, unknown>, key: string): number | null {
  const v = vars[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

function normalizeConversationKey(urlString: string): string | null {
  const raw = String(urlString || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
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

function ingestScriptPath(platform: ChatPlatform): string {
  return `inject-scripts/ruminer.${platform}-ingest.js`;
}

function ingestExecutionWorld(platform: ChatPlatform): chrome.scripting.ExecutionWorld {
  // This node calls the injected extractor via chrome.tabs.sendMessage RPC.
  // That requires the injected script to run in the ISOLATED "content script" world.
  // If a platform needs MAIN-world fetch semantics (Origin), add an ISOLATED<->MAIN bridge.
  return 'ISOLATED';
}

async function injectIngestScript(tabId: number, platform: ChatPlatform): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [ingestScriptPath(platform)],
    world: ingestExecutionWorld(platform),
  });
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

async function probeIngestRpc(tabId: number): Promise<Record<string, unknown> | null> {
  try {
    const res = (await chrome.tabs.sendMessage(
      tabId,
      { action: 'ruminer_ingest_probe' },
      { frameId: 0 },
    )) as any;
    return isRecord(res) ? res : null;
  } catch {
    return null;
  }
}

async function pingIngestRpc(
  tabId: number,
): Promise<{ ok: true; platform: string; version: string; href: string } | null> {
  try {
    const res = (await chrome.tabs.sendMessage(
      tabId,
      { action: 'ruminer_ingest_ping' },
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

async function ensureIngestRpcInjected(tabId: number, platform: ChatPlatform): Promise<void> {
  const ping0 = await pingIngestRpc(tabId);
  if (ping0?.platform === platform) return;

  await injectIngestScript(tabId, platform);

  const ping1 = await pingIngestRpc(tabId);
  if (ping1?.platform !== platform) {
    const probe = await probeIngestRpc(tabId);
    const detail = probe ? JSON.stringify(probe) : 'null';
    throw new Error(`Ingest RPC not responding after injection (probe=${detail})`);
  }
}

async function callIngestRpc(
  tabId: number,
  platform: ChatPlatform,
  payload: { conversationUrl: string | null },
): Promise<InjectedResult> {
  const MAX_ATTEMPTS = 2;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = (await chrome.tabs.sendMessage(
        tabId,
        { action: 'ruminer_ingest_extractConversation', payload: { platform, ...payload } },
        { frameId: 0 },
      )) as any;

      if (!isRecord(res)) return { ok: false, error: 'Ingest RPC returned non-object response' };
      if (res.ok === false && typeof res.error === 'string') {
        return { ok: false, error: String(res.error || 'extractConversation failed') };
      }
      if (res.ok !== true)
        return { ok: false, error: 'Ingest RPC returned invalid response shape' };
      return (res as any).value as InjectedResult;
    } catch (e) {
      lastErr = e;
      const retryable = isRetryableSendMessageError(e);
      if (retryable && attempt + 1 < MAX_ATTEMPTS) {
        await waitForTabComplete(tabId, 15_000).catch(() => undefined);
        await ensureIngestRpcInjected(tabId, platform).catch(() => undefined);
        continue;
      }
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e || 'extractConversation failed'),
      };
    }
  }

  return {
    ok: false,
    error:
      lastErr instanceof Error ? lastErr.message : String(lastErr || 'extractConversation failed'),
  };
}

const LOG_PREFIX = '[ruminer.ingest_current]';

class IngestConversationError extends Error {
  readonly code: (typeof RR_ERROR_CODES)[keyof typeof RR_ERROR_CODES];
  readonly data?: unknown;

  constructor(
    code: (typeof RR_ERROR_CODES)[keyof typeof RR_ERROR_CODES],
    message: string,
    data?: unknown,
  ) {
    super(message);
    this.name = 'IngestConversationError';
    this.code = code;
    this.data = data;
  }
}

export type IngestConversationInTabArgs = {
  tabId: number;
  runId?: string | null;
  conversationUrl?: string | null;
  platformOverride?: ChatPlatform;
  waitForCompleteMs?: number;
};

export type IngestConversationInTabResult = {
  platform: ChatPlatform;
  conversationId: string;
  conversationTitle: string | null;
  conversationUrl: string;
  messageCount: number;
  messagesDigest: string;
  sessionId: string | null;
  projectId: string | null;
};

function toGroupId(platform: ChatPlatform, conversationId: string): string {
  return `${platform}:${conversationId}`;
}

function buildManualImportLedgerEntry(args: {
  existing: ConversationLedgerEntry | null;
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
    // Manual import must always clear status to prevent scan-all stop gaps.
    status: null,
    messages_digest: args.digest,
    message_count: args.messageCount,
    first_seen_at: args.existing?.first_seen_at ?? args.nowIso,
    last_seen_at: args.nowIso,
    last_ingested_at: args.nowIso,
    last_error: null,
  };
}

export async function ingestConversationInTab(
  args: IngestConversationInTabArgs,
): Promise<IngestConversationInTabResult> {
  const tabId = Math.floor(args.tabId);
  if (!Number.isFinite(tabId) || tabId <= 0) {
    throw new IngestConversationError(RR_ERROR_CODES.VALIDATION_ERROR, 'Invalid tabId', { tabId });
  }

  const waitMs =
    typeof args.waitForCompleteMs === 'number' && Number.isFinite(args.waitForCompleteMs)
      ? Math.max(0, Math.floor(args.waitForCompleteMs))
      : 15_000;

  try {
    await waitForTabComplete(tabId, waitMs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.toLowerCase().includes('not found')
      ? RR_ERROR_CODES.TAB_NOT_FOUND
      : RR_ERROR_CODES.TIMEOUT;
    throw new IngestConversationError(code, msg, { tabId, timeoutMs: waitMs });
  }

  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) {
    throw new IngestConversationError(
      RR_ERROR_CODES.TAB_NOT_FOUND,
      `Tab not found (tabId=${tabId}).`,
      { tabId },
    );
  }

  const tabUrl = typeof tab.url === 'string' ? tab.url.trim() : '';
  const inferred = tabUrl ? inferPlatformFromUrl(tabUrl) : null;
  const platform = inferred ?? args.platformOverride ?? null;
  if (!platform) {
    throw new IngestConversationError(
      RR_ERROR_CODES.VALIDATION_ERROR,
      `Unsupported conversation platform for tab URL: ${tabUrl || '(missing URL)'}`,
      { tabId, tabUrl: tabUrl || null },
    );
  }

  const conversationUrl =
    typeof args.conversationUrl === 'string' && args.conversationUrl.trim()
      ? args.conversationUrl.trim()
      : tabUrl || null;

  let injectedResult: InjectedResult | null = null;

  try {
    await ensureIngestRpcInjected(tabId, platform);
    injectedResult = await callIngestRpc(tabId, platform, { conversationUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      `Conversation ingest RPC failed: ${msg}`,
      { error: msg, tabId, platform, conversationUrl },
    );
  }

  if (!injectedResult) {
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      `Conversation ingest returned no result (tabId=${tabId}). Check page DevTools console for [ruminer.*-ingest] logs.`,
      { tabId, platform, conversationUrl },
    );
  }

  if (isRecord(injectedResult) && (injectedResult as any).ok === false) {
    const errorMsg = String((injectedResult as any).error || '');
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      errorMsg || 'Conversation ingest failed',
      { error: errorMsg || 'Conversation ingest failed', tabId, platform, conversationUrl },
    );
  }

  if (!isRecord(injectedResult)) {
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      'Conversation ingest returned invalid result',
      { tabId, platform, conversationUrl },
    );
  }

  const extracted = injectedResult as unknown as InjectedSuccess;
  const conversationId = String(extracted.conversationId || '').trim();
  if (!conversationId) {
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      'Conversation ingest missing conversationId',
      { tabId, platform, conversationUrl },
    );
  }
  const messages = Array.isArray(extracted.messages) ? extracted.messages : [];

  const normalizedForIngest = messages
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: normalizeConversationContent(m.content),
      ...(m.createTime !== undefined ? { createTime: m.createTime } : {}),
      ...(m.messageId !== undefined ? { messageId: m.messageId } : {}),
    }))
    .filter((m) => Boolean(m.content));

  const digestMessages: ConversationMessage[] = normalizedForIngest.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (digestMessages.length === 0) {
    throw new IngestConversationError(
      RR_ERROR_CODES.SCRIPT_FAILED,
      `Conversation has no extractable messages (conversationId=${conversationId})`,
      { tabId, platform, conversationId },
    );
  }

  const { digest: messagesDigest, messageCount } =
    await computeConversationDigestFromMessages(digestMessages);

  const ingestResp = await ruminerIngestConversation({
    platform,
    conversationId,
    runId: typeof args.runId === 'string' ? args.runId : null,
    conversationTitle: extracted.conversationTitle ?? null,
    conversationUrl: extracted.conversationUrl ?? conversationUrl,
    messages: normalizedForIngest,
  });

  if (!isRecord(ingestResp) || ingestResp.ok !== true) {
    const err =
      isRecord(ingestResp) && typeof ingestResp.error === 'string'
        ? ingestResp.error
        : 'Unknown ingest error';
    throw new IngestConversationError(RR_ERROR_CODES.SCRIPT_FAILED, err, {
      error: err,
      tabId,
      platform,
      conversationId,
    });
  }

  let sessionId: string | null = null;
  let projectId: string | null = null;
  try {
    const result = isRecord((ingestResp as any).result)
      ? ((ingestResp as any).result as any)
      : null;
    const session = result && isRecord(result.session) ? (result.session as any) : null;
    const sid = session ? String(session.sessionId || '').trim() : '';
    const pid = session ? String(session.projectId || '').trim() : '';
    sessionId = sid || null;
    projectId = pid || null;
  } catch {
    // ignore
  }

  return {
    platform,
    conversationId,
    conversationTitle: extracted.conversationTitle ?? null,
    conversationUrl: extracted.conversationUrl ?? conversationUrl,
    messageCount,
    messagesDigest,
    sessionId,
    projectId,
  };
}

export const ingestCurrentNodeDefinition: NodeDefinition<
  'ruminer.ingest_current_conversation',
  IngestCurrentConfig
> = {
  kind: 'ruminer.ingest_current_conversation',
  schema: ingestCurrentConfigSchema,
  async execute(ctx, node) {
    const vars = ctx.vars as unknown as Record<string, unknown>;

    const rawUrlVar = node.config.conversationUrlVar ? String(node.config.conversationUrlVar) : '';
    const conversationUrlRaw =
      rawUrlVar && typeof (vars as any)[rawUrlVar] === 'string'
        ? String((vars as any)[rawUrlVar])
        : '';
    const conversationUrlFromVars = conversationUrlRaw.trim() || null;

    const tabId =
      node.config.tabId ??
      (node.config.tabIdVar ? readNumberVar(vars, String(node.config.tabIdVar)) : null) ??
      ctx.tabId;

    const conversationUrl = conversationUrlFromVars;
    const ensureTabUrl = node.config.ensureTabUrl;

    console.debug(`${LOG_PREFIX} start`, {
      runId: ctx.runId,
      tabId,
      conversationUrl,
      conversationUrlVar: rawUrlVar,
      ensureTabUrl,
    });

    const emitToTab = async (action: string, payload: Record<string, unknown>): Promise<void> => {
      if (typeof tabId !== 'number' || !Number.isFinite(tabId) || tabId <= 0) return;
      try {
        await chrome.tabs.sendMessage(tabId, { action, payload });
      } catch {
        // ignore (no content script / restricted URL)
      }
    };

    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      ctx.log('debug', `${LOG_PREFIX} resolved tab`, {
        tabId,
        tabUrl: typeof tab?.url === 'string' ? tab.url : null,
        tabStatus: typeof tab?.status === 'string' ? tab.status : null,
        conversationUrl,
      });
    } catch {
      // ignore
    }

    if (ensureTabUrl !== 'none' && conversationUrl) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const currentUrl = typeof tab?.url === 'string' ? tab.url.trim() : '';

      const currentKey = normalizeConversationKey(currentUrl);
      const desiredKey = normalizeConversationKey(conversationUrl);

      if (desiredKey && currentKey !== desiredKey) {
        if (ensureTabUrl === 'require_match') {
          await emitToTab('ruminer_ingest_current_conversation_failed', {
            runId: ctx.runId,
            error: 'Active tab does not match the conversation URL',
            currentUrl: currentUrl || null,
            desiredUrl: conversationUrl,
          });
          return toErrorResult(
            RR_ERROR_CODES.VALIDATION_ERROR,
            'Active tab does not match the conversation URL',
            { tabId, currentUrl: currentUrl || null, desiredUrl: conversationUrl },
          );
        }

        if (ensureTabUrl === 'navigate_if_needed') {
          try {
            await chrome.tabs.update(tabId, { url: conversationUrl });
            await waitForTabComplete(tabId, 30_000);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await emitToTab('ruminer_ingest_current_conversation_failed', {
              runId: ctx.runId,
              error: `Failed to navigate to conversation URL: ${msg}`,
              desiredUrl: conversationUrl,
            });
            return toErrorResult(
              RR_ERROR_CODES.NAVIGATION_FAILED,
              `Failed to navigate to conversation URL: ${msg}`,
              { tabId, desiredUrl: conversationUrl, error: msg },
            );
          }
        }
      }
    }

    let result: IngestConversationInTabResult;
    try {
      result = await ingestConversationInTab({
        tabId,
        runId: ctx.runId,
        conversationUrl,
      });
    } catch (e) {
      if (e instanceof IngestConversationError) {
        try {
          ctx.log('error', `${LOG_PREFIX} failed`, { tabId, code: e.code, error: e.message });
        } catch {
          // ignore
        }
        await emitToTab('ruminer_ingest_current_conversation_failed', {
          runId: ctx.runId,
          error: e.message,
          code: e.code,
          ...(isRecord(e.data) ? (e.data as Record<string, unknown>) : {}),
        });
        return toErrorResult(e.code, e.message, e.data as any);
      }
      const msg = e instanceof Error ? e.message : String(e);
      await emitToTab('ruminer_ingest_current_conversation_failed', {
        runId: ctx.runId,
        error: msg,
        code: RR_ERROR_CODES.SCRIPT_FAILED,
        tabId,
      });
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, msg, { error: msg, tabId });
    }

    console.log(`${LOG_PREFIX} success`, result);
    try {
      ctx.log('info', `${LOG_PREFIX} succeeded`, result);
    } catch {
      // ignore
    }

    // Manual import: store digest + count, always clear status to avoid scan-all early-stop gaps.
    try {
      const existing = await getConversationEntry(
        toGroupId(result.platform, result.conversationId),
      );
      const nowIso = new Date().toISOString();
      const next = buildManualImportLedgerEntry({
        existing,
        nowIso,
        platform: result.platform,
        conversationId: result.conversationId,
        conversationUrl: result.conversationUrl ?? null,
        conversationTitle: result.conversationTitle,
        digest: result.messagesDigest,
        messageCount: result.messageCount,
      });
      await upsertConversationEntry(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await emitToTab('ruminer_ingest_current_conversation_failed', {
        runId: ctx.runId,
        error: `Ingest succeeded but ledger update failed: ${msg}`,
        code: RR_ERROR_CODES.INTERNAL,
        tabId,
        conversationId: result.conversationId,
      });
      return toErrorResult(RR_ERROR_CODES.INTERNAL, `Ledger update failed: ${msg}`, {
        error: msg,
        conversationId: result.conversationId,
        platform: result.platform,
      });
    }

    await emitToTab('ruminer_ingest_current_conversation_succeeded', {
      runId: ctx.runId,
      platform: result.platform,
      conversationId: result.conversationId,
      conversationTitle: result.conversationTitle,
      conversationUrl: result.conversationUrl,
      messageCount: result.messageCount,
      sessionId: result.sessionId,
      projectId: result.projectId,
    });

    return {
      status: 'succeeded',
      outputs: {
        conversationId: result.conversationId,
        messageCount: result.messageCount,
        ...(result.sessionId ? { sessionId: result.sessionId } : {}),
      },
    };
  },
};
