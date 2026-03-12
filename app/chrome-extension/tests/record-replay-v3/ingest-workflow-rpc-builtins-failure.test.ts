import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@/common/constants';
import { TOOL_NAMES } from 'chrome-mcp-shared';

vi.mock(
  '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/index',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/index')
      >();

    return {
      ...original,
      ensureBuiltinFlows: vi.fn(original.ensureBuiltinFlows),
    };
  },
);

import { ensureBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/index';
import { initIngestWorkflowRpc } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc';

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
      resolve(undefined);
    }
  });
}

describe('ingest workflow rpc (builtin flow ensure failures)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.onMessage.addListener as any).mockClear?.();

    const flowId = 'chatgpt.conversation_ingest.v1';

    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: '' } };
      }
      if (
        keys === STORAGE_KEYS.FLOW_APPROVALS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.FLOW_APPROVALS))
      ) {
        return {
          [STORAGE_KEYS.FLOW_APPROVALS]: {
            [flowId]: {
              approvedToolsHash: '',
              approvedTools: [TOOL_NAMES.BROWSER.NAVIGATE, TOOL_NAMES.BROWSER.JAVASCRIPT],
              approvedAt: new Date().toISOString(),
            },
          },
        };
      }
      return {};
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
  });

  it('surfaces ensureBuiltinFlows failures and allows retry', async () => {
    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    (ensureBuiltinFlows as any).mockRejectedValueOnce(new Error('boom'));

    const flowId = 'chatgpt.conversation_ingest.v1';
    const conversationId = `c_builtins_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const bad = (await callOnMessage(listener, {
      type: 'ruminer.rr_v3.enqueueRuns',
      items: [
        {
          flowId,
          args: {
            ruminerConversationId: conversationId,
            ruminerConversationUrl: `https://chatgpt.com/c/${conversationId}`,
          },
        },
      ],
    })) as any;

    expect(bad).toEqual({ ok: false, error: 'Failed to ensure builtin flows: boom' });

    const ok = (await callOnMessage(listener, {
      type: 'ruminer.rr_v3.enqueueRuns',
      items: [
        {
          flowId,
          args: {
            ruminerConversationId: conversationId,
            ruminerConversationUrl: `https://chatgpt.com/c/${conversationId}`,
          },
        },
      ],
    })) as any;

    expect(ok.ok).toBe(true);
    expect(ok.result.enqueued).toBe(1);
    expect(ok.result.errors).toEqual([]);
  });
});
