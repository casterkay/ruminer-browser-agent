import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@/common/constants';
import { createStoragePort } from '@/entrypoints/background/record-replay-v3';
import { RUN_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/events';
import { initIngestWorkflowRpc } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/ingest-workflow-rpc';

function getLastOnMessageListener(): any {
  const addListener = chrome.runtime.onMessage.addListener as any;
  const calls = addListener.mock.calls as any[];
  if (!calls.length) {
    throw new Error('No chrome.runtime.onMessage listener registered');
  }
  return calls[calls.length - 1][0] as any;
}

async function callOnMessage(listener: any, message: unknown, sender: any): Promise<unknown> {
  return new Promise((resolve) => {
    const ret = listener(message as any, sender as any, (resp: unknown) => resolve(resp));
    if (ret !== true) resolve(undefined);
  });
}

describe('ingest workflow rpc telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (chrome.runtime.onMessage.addListener as any).mockClear?.();

    // Provide valid EMOS settings so ingest handler proceeds far enough to log.
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
        return { [STORAGE_KEYS.SERVER_STATUS]: { isRunning: false, lastUpdated: Date.now() } };
      }
      return {};
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
  });

  it('appends ruminer.ingest.result even when request runId is missing (infer from sender tabId)', async () => {
    const storage = createStoragePort();
    const runId = 'run_telemetry_infer';
    const tabId = 777;

    await storage.runs.save({
      schemaVersion: RUN_SCHEMA_VERSION,
      id: runId,
      flowId: 'chatgpt.conversation_ingest.v1',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempt: 0,
      maxAttempts: 1,
      tabId,
      nextSeq: 0,
    });

    initIngestWorkflowRpc();
    const listener = getLastOnMessageListener();

    const resp = (await callOnMessage(
      listener,
      {
        type: 'ruminer.ingest.ingestConversation',
        platform: 'chatgpt',
        conversationId: 'c1',
        runId: null,
        conversationTitle: 't',
        conversationUrl: 'https://chatgpt.com/c/c1',
        messages: [],
      },
      { tab: { id: tabId }, url: 'https://chatgpt.com/c/c1' },
    )) as any;

    expect(resp.ok).toBe(false);

    const events = await storage.events.list(runId);
    const ingestLogs = events.filter(
      (e: any) => e?.type === 'log' && e?.message === 'ruminer.ingest.result',
    );
    expect(ingestLogs.length).toBeGreaterThan(0);
  });
});
