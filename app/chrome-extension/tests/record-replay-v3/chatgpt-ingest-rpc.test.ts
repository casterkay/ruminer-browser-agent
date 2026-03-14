import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@/common/constants';
import { initIngestWorkflowRpc } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc';
import { getConversationEntry } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/conversation-ledger';
import { TOOL_NAMES } from 'chrome-mcp-shared';

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

describe('ingest workflow rpc', () => {
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
      if (
        keys === STORAGE_KEYS.SERVER_STATUS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.SERVER_STATUS))
      ) {
        return {
          [STORAGE_KEYS.SERVER_STATUS]: { isRunning: true, port: 12306, lastUpdated: Date.now() },
        };
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
        if (u.includes('/agent/session/ingest')) {
          return new Response(
            JSON.stringify({
              ok: true,
              projectId: 'ruminer.imported_conversations',
              sessionId: 'chatgpt:unknown',
              messageCount: 0,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
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

  it('ignores unrelated ruminer.* messages (does not claim sendResponse)', async () => {
    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const sendResponse = vi.fn();
    const ret = listener(
      {
        type: 'ruminer.workflow.auth-failure',
        title: 't',
        message: 'm',
      },
      {} as any,
      sendResponse,
    );

    expect(ret).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it('fails fast when EMOS settings are incomplete', async () => {
    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const resp = await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
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

  it('ingests a new conversation and records it in the conversation ledger', async () => {
    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: 'k' } };
      }
      if (
        keys === STORAGE_KEYS.SERVER_STATUS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.SERVER_STATUS))
      ) {
        return {
          [STORAGE_KEYS.SERVER_STATUS]: { isRunning: true, port: 12306, lastUpdated: Date.now() },
        };
      }
      return {};
    });

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const resp = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId: 'c1',
      conversationTitle: 't',
      conversationUrl: 'https://chatgpt.com/c/c1',
      messages: [{ role: 'user', content: 'hi', createTime: '2026-03-10T00:00:00.000Z' }],
    })) as any;

    expect(resp.ok).toBe(true);
    expect(resp.result.upserted).toBe(1);
    expect(resp.result.failed).toBe(0);

    const entry = await getConversationEntry('chatgpt:c1');
    expect(entry?.status).toBe('ingested');
    expect(entry?.message_hashes?.length).toBe(1);
  });

  it('only upserts from the first changed index (LCP incremental)', async () => {
    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: 'k' } };
      }
      if (
        keys === STORAGE_KEYS.SERVER_STATUS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.SERVER_STATUS))
      ) {
        return {
          [STORAGE_KEYS.SERVER_STATUS]: { isRunning: true, port: 12306, lastUpdated: Date.now() },
        };
      }
      return {};
    });

    const fetchSpy = globalThis.fetch as any;
    fetchSpy.mockClear?.();

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const r1 = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId: 'c_lcp',
      conversationTitle: 't',
      conversationUrl: 'https://chatgpt.com/c/c_lcp',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })) as any;
    expect(r1.ok).toBe(true);
    expect(r1.result.upserted).toBe(2);

    const callsAfter1 = (fetchSpy.mock.calls as any[]).filter((c) =>
      String(c?.[0] || '').startsWith('https://emos.test/api/v0/memories'),
    ).length;
    expect(callsAfter1).toBe(2);

    const r2 = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId: 'c_lcp',
      conversationTitle: 't',
      conversationUrl: 'https://chatgpt.com/c/c_lcp',
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'assistant', content: 'new tail' },
      ],
    })) as any;
    expect(r2.ok).toBe(true);
    expect(r2.result.skipped).toBe(2);
    expect(r2.result.upserted).toBe(1);

    const callsAfter2 = (fetchSpy.mock.calls as any[]).filter((c) =>
      String(c?.[0] || '').startsWith('https://emos.test/api/v0/memories'),
    ).length;
    expect(callsAfter2).toBe(3);
  });

  it('marks failed ingestion and forces full re-ingest on next run', async () => {
    const conversationId = `c_fail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    (chrome.storage.local.get as any).mockImplementation(async (keys: any) => {
      if (
        keys === STORAGE_KEYS.EMOS_SETTINGS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.EMOS_SETTINGS))
      ) {
        return { [STORAGE_KEYS.EMOS_SETTINGS]: { baseUrl: 'https://emos.test', apiKey: 'k' } };
      }
      if (
        keys === STORAGE_KEYS.SERVER_STATUS ||
        (Array.isArray(keys) && keys.includes(STORAGE_KEYS.SERVER_STATUS))
      ) {
        return {
          [STORAGE_KEYS.SERVER_STATUS]: { isRunning: true, port: 12306, lastUpdated: Date.now() },
        };
      }
      return {};
    });

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const ok1 = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId,
      conversationTitle: 't',
      conversationUrl: `https://chatgpt.com/c/${conversationId}`,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })) as any;
    expect(ok1.ok).toBe(true);

    const entry1 = await getConversationEntry(`chatgpt:${conversationId}`);
    expect(entry1?.status).toBe('ingested');
    expect(entry1?.message_hashes?.length).toBe(2);

    const fetchSpy = globalThis.fetch as any;
    fetchSpy.mockImplementation(async (url: any, init?: any) => {
      const u = String(url || '');
      if (u.includes('/agent/emos/settings')) {
        return new Response(null, { status: 404 });
      }
      if (u.startsWith('https://emos.test/api/v0/memories')) {
        const body = init && init.body ? JSON.parse(String(init.body)) : {};
        const mid = String(body?.message_id || '');
        // Fail the new tail message (index 2) for this conversation.
        if (mid === `chatgpt:${conversationId}:2`) {
          return new Response(JSON.stringify({ ok: false, error: 'boom' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });

    const bad = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId,
      conversationTitle: 't',
      conversationUrl: `https://chatgpt.com/c/${conversationId}`,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'assistant', content: 'new tail' },
      ],
    })) as any;
    expect(bad.ok).toBe(false);
    expect(bad.result.startIndex).toBe(2);

    const entry2 = await getConversationEntry(`chatgpt:${conversationId}`);
    expect(entry2?.status).toBe('failed');
    // Keep last known-good hashes when failed
    expect(entry2?.message_hashes?.length).toBe(2);

    // Next run should resume from LCP (no forced startIndex=0).
    fetchSpy.mockImplementation(async (url: any) => {
      const u = String(url || '');
      if (u.includes('/agent/emos/settings')) {
        return new Response(null, { status: 404 });
      }
      if (u.includes('/agent/session/ingest')) {
        return new Response(
          JSON.stringify({
            ok: true,
            projectId: 'ruminer.imported_conversations',
            sessionId: `chatgpt:${conversationId}`,
            messageCount: 0,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u.startsWith('https://emos.test/api/v0/memories')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });

    const ok3 = (await callOnMessage(listener, {
      type: 'ruminer.ingest.ingestConversation',
      platform: 'chatgpt',
      conversationId,
      conversationTitle: 't',
      conversationUrl: `https://chatgpt.com/c/${conversationId}`,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'assistant', content: 'new tail' },
      ],
    })) as any;
    expect(ok3.ok).toBe(true);
    expect(ok3.result.startIndex).toBe(2);
    expect(ok3.result.upserted).toBe(1);

    const entry3 = await getConversationEntry(`chatgpt:${conversationId}`);
    expect(entry3?.status).toBe('ingested');
    expect(entry3?.message_hashes?.length).toBe(3);
  });

  it('enqueueRuns best-effort dedupes against active queue items', async () => {
    const flowId = 'auto.conversation_ingest.v1';
    const conversationId = `c_dedupe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Approve required tools so enqueueRun can queue the run in tests.
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

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const r1 = (await callOnMessage(listener, {
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
    expect(r1.ok).toBe(true);
    expect(r1.result.enqueued).toBe(1);
    expect(r1.result.skippedAsDuplicate).toBe(0);

    const r2 = (await callOnMessage(listener, {
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
    expect(r2.ok).toBe(true);
    expect(r2.result.enqueued).toBe(0);
    expect(r2.result.skippedAsDuplicate).toBe(1);
  });

  it('enqueueRuns best-effort dedupes duplicates within the same request batch', async () => {
    const flowId = 'auto.conversation_ingest.v1';
    const conversationId = `c_batch_dedupe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Approve required tools so enqueueRun can queue the run in tests.
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

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const r = (await callOnMessage(listener, {
      type: 'ruminer.rr_v3.enqueueRuns',
      items: [
        {
          flowId,
          args: {
            ruminerConversationId: conversationId,
            ruminerConversationUrl: `https://chatgpt.com/c/${conversationId}`,
          },
        },
        {
          flowId,
          args: {
            ruminerConversationId: conversationId,
            ruminerConversationUrl: `https://chatgpt.com/c/${conversationId}`,
          },
        },
      ],
    })) as any;

    expect(r.ok).toBe(true);
    expect(r.result.enqueued).toBe(1);
    expect(r.result.skippedAsDuplicate).toBe(1);
    expect(r.result.runIds).toHaveLength(1);
  });
});
