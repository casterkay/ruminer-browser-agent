import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../../domain/errors';
import type { NodeDefinition } from '../../types';
import { toErrorResult } from '../utils';

const TAB_ID_VAR = '__rr_v2__tabId';

const ensureConversationTabConfigSchema = z.object({
  conversationUrlVar: z.string().default('ruminerConversationUrl'),
  active: z.boolean().default(false),
  waitForCompleteMs: z.number().int().min(0).max(60_000).default(15_000),
  skipIfAlreadyOnConversation: z.boolean().default(true),
});

type EnsureConversationTabConfig = z.infer<typeof ensureConversationTabConfigSchema>;

function normalizeConversationKey(urlString: string): string | null {
  const raw = String(urlString || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Ignore query/hash; normalize by origin+pathname.
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

    timer = setTimeout(() => {
      finish(new Error(`Timed out waiting for tab ${tabId} to load`));
    }, ms);

    const checkStatus = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab?.status === 'complete') {
          finish();
        }
      } catch {
        finish(new Error(`Tab ${tabId} not found`));
      }
    };

    pollTimer = setInterval(() => {
      void checkStatus();
    }, 250);

    // Race-proof: the tab may already be complete before the listener is registered.
    void checkStatus();
  });
}

export const ensureConversationTabNodeDefinition: NodeDefinition<
  'ruminer.ensure_conversation_tab',
  EnsureConversationTabConfig
> = {
  kind: 'ruminer.ensure_conversation_tab',
  schema: ensureConversationTabConfigSchema,
  async execute(ctx, node) {
    const vars = ctx.vars as unknown as Record<string, unknown>;
    const rawVar = node.config.conversationUrlVar ? String(node.config.conversationUrlVar) : '';
    const desiredUrlRaw =
      rawVar && typeof (vars as any)[rawVar] === 'string' ? String((vars as any)[rawVar]) : '';
    const desiredUrl = desiredUrlRaw.trim() || null;

    const currentTab = await chrome.tabs.get(ctx.tabId).catch(() => null);
    const currentUrl = typeof currentTab?.url === 'string' ? currentTab.url.trim() : '';

    try {
      ctx.log('debug', 'ruminer.ensure_tab: evaluate', {
        ctxTabId: ctx.tabId,
        currentUrl: currentUrl || null,
        desiredUrl,
      });
    } catch {
      // ignore
    }

    if (node.config.skipIfAlreadyOnConversation) {
      const currentKey = normalizeConversationKey(currentUrl);
      const desiredKey = desiredUrl ? normalizeConversationKey(desiredUrl) : null;
      if (currentKey && desiredKey && currentKey === desiredKey) {
        try {
          ctx.log('info', 'ruminer.ensure_tab: using current tab', {
            tabId: ctx.tabId,
            conversationKey: currentKey,
          });
        } catch {
          // ignore
        }
        return { status: 'succeeded' };
      }
    }

    // Manual/bare run: if we don't know which URL to open, just proceed on current tab.
    if (!desiredUrl) {
      try {
        ctx.log('warn', 'ruminer.ensure_tab: missing desiredUrl; using current tab', {
          tabId: ctx.tabId,
          currentUrl: currentUrl || null,
        });
      } catch {
        // ignore
      }
      return { status: 'succeeded' };
    }

    let tabId: number;
    try {
      const tab = await chrome.tabs.create({ url: desiredUrl, active: node.config.active });
      if (tab.id === undefined) {
        return toErrorResult(RR_ERROR_CODES.TAB_NOT_FOUND, 'Failed to open conversation tab');
      }
      tabId = tab.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toErrorResult(
        RR_ERROR_CODES.NAVIGATION_FAILED,
        `Failed to open conversation tab: ${msg}`,
      );
    }

    try {
      ctx.log('info', 'ruminer.ensure_tab: opened background tab', { tabId, url: desiredUrl });
    } catch {
      // ignore
    }

    try {
      await waitForTabComplete(tabId, node.config.waitForCompleteMs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return toErrorResult(RR_ERROR_CODES.TIMEOUT, msg, { tabId, url: desiredUrl });
    }

    return {
      status: 'succeeded',
      varsPatch: [{ op: 'set', name: TAB_ID_VAR, value: tabId }],
    };
  },
};
