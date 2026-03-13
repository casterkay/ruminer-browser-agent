import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import {
  ruminerIngestConversation,
  type RuminerIngestPlatform,
} from '../builtin-flows/ingest-workflow-rpc';
import { toErrorResult } from '../utils';

const TAB_ID_VAR = '__rr_v2__tabId';

const ingestCurrentConfigSchema = z.object({
  platform: z.enum(['chatgpt', 'gemini', 'claude', 'deepseek']),
  conversationUrlVar: z.string().default('ruminerConversationUrl'),
  closeBackgroundTab: z.boolean().default(true),
});

type IngestCurrentConfig = z.infer<typeof ingestCurrentConfigSchema>;

type InjectedSuccess = {
  conversationId: string;
  conversationTitle: string | null;
  conversationUrl: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string; createTime?: string | null }>;
};

type InjectedFailure = { ok: false; error: string };

type InjectedResult = InjectedSuccess | InjectedFailure;

function readNumberVar(vars: Record<string, unknown>, key: string): number | null {
  const v = vars[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function ingestScriptPath(platform: RuminerIngestPlatform): string {
  return `inject-scripts/ruminer.${platform}-ingest.js`;
}

const LOG_PREFIX = '[ruminer.ingest_current]';

export const ingestCurrentNodeDefinition: NodeDefinition<
  'ruminer.ingest_current_conversation',
  IngestCurrentConfig
> = {
  kind: 'ruminer.ingest_current_conversation',
  schema: ingestCurrentConfigSchema,
  async execute(ctx, node) {
    const vars = ctx.vars as unknown as Record<string, unknown>;
    const backgroundTabId = readNumberVar(vars, TAB_ID_VAR);
    const effectiveTabId = backgroundTabId ?? ctx.tabId;
    const platform = node.config.platform;

    const rawUrlVar = node.config.conversationUrlVar ? String(node.config.conversationUrlVar) : '';
    const conversationUrlRaw =
      rawUrlVar && typeof (vars as any)[rawUrlVar] === 'string'
        ? String((vars as any)[rawUrlVar])
        : '';
    const conversationUrl = conversationUrlRaw.trim() || null;

    console.debug(`${LOG_PREFIX} start`, {
      runId: ctx.runId,
      ctxTabId: ctx.tabId,
      backgroundTabId,
      effectiveTabId,
      platform,
      conversationUrl,
      conversationUrlVar: rawUrlVar,
    });

    try {
      const tab = await chrome.tabs.get(effectiveTabId).catch(() => null);
      ctx.log('debug', `${LOG_PREFIX} resolved tab`, {
        effectiveTabId,
        ctxTabId: ctx.tabId,
        backgroundTabId,
        tabUrl: typeof tab?.url === 'string' ? tab.url : null,
        tabStatus: typeof tab?.status === 'string' ? tab.status : null,
        platform,
        conversationUrl,
      });
    } catch {
      // ignore
    }

    let injectedResult: InjectedResult | null = null;

    try {
      // Step 1: Inject the platform script file
      const scriptPath = ingestScriptPath(platform);
      console.debug(`${LOG_PREFIX} injecting script file`, { path: scriptPath, platform });
      await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        files: [scriptPath],
        world: 'ISOLATED',
      });

      // Step 2: Call the exposed extractor
      console.debug(`${LOG_PREFIX} calling extractor`, { platform });
      const results = await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        world: 'ISOLATED',
        func: (payload: { platform: string; conversationUrl: string | null }) => {
          const api = (window as any).__RUMINER_INGEST__;
          if (!api) return { ok: false, error: '__RUMINER_INGEST__ not found on window' };
          if (api.platform !== payload.platform) {
            return {
              ok: false,
              error: `__RUMINER_INGEST__ platform mismatch (expected=${payload.platform}, got=${String(api.platform || '')})`,
            };
          }
          if (typeof api.extractConversation !== 'function') {
            return { ok: false, error: '__RUMINER_INGEST__.extractConversation is not a function' };
          }
          return api.extractConversation({ conversationUrl: payload.conversationUrl });
        },
        args: [{ platform, conversationUrl }],
      });

      if (!Array.isArray(results) || results.length === 0) {
        ctx.log('error', `${LOG_PREFIX} executeScript returned empty results`, { effectiveTabId });
        console.warn(`${LOG_PREFIX} executeScript returned empty results`, { effectiveTabId });
      } else {
        injectedResult = (results[0] as any)?.result ?? null;
        console.debug(`${LOG_PREFIX} got result`, {
          hasResult: !!injectedResult,
          ok: (injectedResult as any)?.ok,
          error: (injectedResult as any)?.ok === false ? (injectedResult as any).error : undefined,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${LOG_PREFIX} injection exception`, {
        error: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      try {
        ctx.log('error', `${LOG_PREFIX} injection failed`, { effectiveTabId, error: msg });
      } catch {
        // ignore
      }
      return toErrorResult(
        RR_ERROR_CODES.SCRIPT_FAILED,
        `Conversation ingest injection failed: ${msg}`,
        {
          error: msg,
        },
      );
    } finally {
      if (node.config.closeBackgroundTab && backgroundTabId && backgroundTabId !== ctx.tabId) {
        console.debug(`${LOG_PREFIX} closing background tab`, { backgroundTabId });
        await chrome.tabs.remove(backgroundTabId).catch(() => {});
      }
    }

    if (!injectedResult) {
      // Probe to distinguish "no return" from "no access"
      try {
        const probe = await chrome.scripting.executeScript({
          target: { tabId: effectiveTabId },
          world: 'ISOLATED',
          func: () => ({ ok: true, href: String(window.location.href || '') }),
        });
        ctx.log('error', `${LOG_PREFIX} returned no result (probe)`, {
          effectiveTabId,
          probe0: Array.isArray(probe) ? (probe[0]?.result ?? null) : null,
        });
        console.warn(`${LOG_PREFIX} returned no result (probe)`, {
          runId: ctx.runId,
          effectiveTabId,
          probe0: Array.isArray(probe) ? (probe[0]?.result ?? null) : null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ctx.log('error', `${LOG_PREFIX} returned no result (probe failed)`, {
          effectiveTabId,
          error: msg,
        });
        console.warn(`${LOG_PREFIX} returned no result (probe failed)`, {
          runId: ctx.runId,
          effectiveTabId,
          error: msg,
        });
      }
      return toErrorResult(
        RR_ERROR_CODES.SCRIPT_FAILED,
        `Conversation ingest returned no result (tabId=${effectiveTabId}). Check page DevTools console for [ruminer.*-ingest] logs.`,
      );
    }

    if (isRecord(injectedResult) && (injectedResult as any).ok === false) {
      const errorMsg = String((injectedResult as any).error || '');
      console.error(`${LOG_PREFIX} injected script returned failure`, { error: errorMsg });
      try {
        ctx.log('error', `${LOG_PREFIX} injected failure`, { effectiveTabId, error: errorMsg });
      } catch {
        // ignore
      }
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, errorMsg || 'Conversation ingest failed', {
        error: errorMsg || 'Conversation ingest failed',
      });
    }

    if (!isRecord(injectedResult)) {
      return toErrorResult(
        RR_ERROR_CODES.SCRIPT_FAILED,
        'Conversation ingest returned invalid result',
      );
    }

    const extracted = injectedResult as unknown as InjectedSuccess;
    const conversationId = String(extracted.conversationId || '').trim();
    if (!conversationId) {
      return toErrorResult(
        RR_ERROR_CODES.SCRIPT_FAILED,
        'Conversation ingest missing conversationId',
      );
    }
    const messages = Array.isArray(extracted.messages) ? extracted.messages : [];

    const ingestResp = await ruminerIngestConversation({
      platform,
      conversationId,
      runId: ctx.runId,
      conversationTitle: extracted.conversationTitle ?? null,
      conversationUrl: extracted.conversationUrl ?? conversationUrl,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || ''),
        ...(m.createTime !== undefined ? { createTime: m.createTime } : {}),
      })),
    });

    if (!isRecord(ingestResp) || ingestResp.ok !== true) {
      const err =
        isRecord(ingestResp) && typeof ingestResp.error === 'string'
          ? ingestResp.error
          : 'Unknown ingest error';
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, err, { error: err });
    }

    console.log(`${LOG_PREFIX} success`, {
      platform,
      conversationId,
      messageCount: messages.length,
    });
    try {
      ctx.log('info', `${LOG_PREFIX} succeeded`, {
        platform,
        conversationId,
        messageCount: messages.length,
      });
    } catch {
      // ignore
    }

    return {
      status: 'succeeded',
      outputs: {
        conversationId,
        messageCount: messages.length,
      },
    };
  },
};
