import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import { toErrorResult } from '../utils';

const TAB_ID_VAR = '__rr_v2__tabId';

// Path to the compiled inject script (WXT outputs unlisted scripts to extension root)
const CHATGPT_INGEST_SCRIPT_PATH = 'inject-scripts/ruminer.chatgpt-ingest.js';

const ingestCurrentConfigSchema = z.object({
  conversationUrlVar: z.string().default('ruminerConversationUrl'),
  closeBackgroundTab: z.boolean().default(true),
});

type IngestCurrentConfig = z.infer<typeof ingestCurrentConfigSchema>;

type InjectedSuccess = {
  ok: true;
  conversationId: string;
  conversationTitle: string | null;
  conversationUrl: string;
  messageCount: number;
  ingest: unknown;
};

type InjectedFailure = { ok: false; error: string };

type InjectedResult = InjectedSuccess | InjectedFailure;

function readNumberVar(vars: Record<string, unknown>, key: string): number | null {
  const v = vars[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

const LOG_PREFIX = '[chatgpt.ingest_current]';

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
        conversationUrl,
      });
    } catch {
      // ignore
    }

    let injectedResult: InjectedResult | null = null;

    try {
      // Step 1: Inject the compiled script file
      console.debug(`${LOG_PREFIX} injecting script file`, { path: CHATGPT_INGEST_SCRIPT_PATH });
      await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        files: [CHATGPT_INGEST_SCRIPT_PATH],
        world: 'ISOLATED',
      });

      // Step 2: Call the exposed ingestion function
      console.debug(`${LOG_PREFIX} calling ingestion function`);
      const results = await chrome.scripting.executeScript({
        target: { tabId: effectiveTabId },
        world: 'ISOLATED',
        func: (payload: { runId: string; conversationUrl: string | null }) => {
          const ingest = (window as any).__RUMINER_CHATGPT_INGEST__;
          if (!ingest) {
            return { ok: false, error: '__RUMINER_CHATGPT_INGEST__ not found on window' };
          }
          // Return a promise - executeScript will await it
          return ingest(payload);
        },
        args: [{ runId: ctx.runId, conversationUrl }],
      });

      if (!Array.isArray(results) || results.length === 0) {
        ctx.log('error', `${LOG_PREFIX} executeScript returned empty results`, { effectiveTabId });
        console.warn(`${LOG_PREFIX} executeScript returned empty results`, { effectiveTabId });
      } else {
        injectedResult = (results[0] as any)?.result ?? null;
        console.debug(`${LOG_PREFIX} got result`, {
          hasResult: !!injectedResult,
          ok: injectedResult?.ok,
          error: injectedResult?.ok === false ? injectedResult.error : undefined,
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
        `ChatGPT ingest injection failed: ${msg}`,
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
        `ChatGPT ingest returned no result (tabId=${effectiveTabId}). Check page DevTools console for [chatgpt-ingest] logs.`,
      );
    }

    if (!injectedResult.ok) {
      const errorMsg = injectedResult.error;
      console.error(`${LOG_PREFIX} injected script returned failure`, { error: errorMsg });
      try {
        ctx.log('error', `${LOG_PREFIX} injected failure`, { effectiveTabId, error: errorMsg });
      } catch {
        // ignore
      }
      return toErrorResult(RR_ERROR_CODES.SCRIPT_FAILED, errorMsg || 'ChatGPT ingest failed', {
        error: errorMsg || 'ChatGPT ingest failed',
      });
    }

    console.log(`${LOG_PREFIX} success`, {
      conversationId: injectedResult.conversationId,
      messageCount: injectedResult.messageCount,
    });
    try {
      ctx.log('info', `${LOG_PREFIX} succeeded`, {
        conversationId: injectedResult.conversationId,
        messageCount: injectedResult.messageCount,
      });
    } catch {
      // ignore
    }

    return {
      status: 'succeeded',
      outputs: {
        conversationId: injectedResult.conversationId,
        messageCount: injectedResult.messageCount,
      },
    };
  },
};
