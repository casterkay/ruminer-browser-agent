import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initChatgptWorkflowRpc } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt-workflow-rpc';
import { STORAGE_KEYS } from '@/common/constants';

function getLastOnMessageListener(): any {
  const addListener = chrome.runtime.onMessage.addListener as any;
  const calls = addListener.mock.calls as any[];
  if (!calls.length) {
    throw new Error('No chrome.runtime.onMessage listener registered');
  }
  return calls[calls.length - 1][0] as any;
}

async function callOnMessage(listener: any, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const ret = listener(message as any, {} as any, (resp: unknown) => resolve(resp));
    if (ret !== true) {
      // Synchronous path (shouldn’t happen for our handlers)
      resolve(undefined);
    }
  });
}

describe('chatgpt workflow rpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.onMessage.addListener as any).mockClear?.();

    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      // Default: no EMOS apiKey set
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: '' } };
      }
      return {};
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: any) => {
        const u = String(url || '');
        if (u.includes('/agent/emos/settings')) {
          return new Response(null, { status: 404 });
        }
        if (u.startsWith('https://emos.test/api/v0/memories')) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(null, { status: 404 });
      }),
    );
  });

  it('fails fast when EMOS settings are incomplete', async () => {
    initChatgptWorkflowRpc();
    const listener = getLastOnMessageListener();

    const resp = await callOnMessage(listener, {
      type: 'ruminer.chatgpt.ingestConversation',
      platform: 'chatgpt',
      conversationId: 'c1',
      conversationTitle: 't',
      conversationUrl: 'https://chatgpt.com/c/c1',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(resp).toEqual({
      ok: false,
      error: 'EMOS settings incomplete (missing baseUrl/apiKey)',
    });
  });

  it('ingests a new message and records it in the ledger', async () => {
    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: 'k' } };
      }
      return {};
    });

    initChatgptWorkflowRpc();
    const listener = getLastOnMessageListener();

    const resp = (await callOnMessage(listener, {
      type: 'ruminer.chatgpt.ingestConversation',
      platform: 'chatgpt',
      conversationId: 'c1',
      conversationTitle: 't',
      conversationUrl: 'https://chatgpt.com/c/c1',
      messages: [{ role: 'user', content: 'hi', createTime: '2026-03-10T00:00:00.000Z' }],
    })) as any;

    expect(resp.ok).toBe(true);
    expect(resp.result.ingested).toBe(1);
    expect(resp.result.failed).toBe(0);
  });
});
