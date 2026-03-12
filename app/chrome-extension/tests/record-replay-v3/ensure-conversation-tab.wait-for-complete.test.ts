import { describe, expect, it, vi } from 'vitest';

import { ensureConversationTabNodeDefinition } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/nodes/ensure-conversation-tab';

describe('ruminer.ensure_conversation_tab (waitForTabComplete)', () => {
  it('does not timeout when tab is already complete (no onUpdated event)', async () => {
    const createdTabId = 999;

    (chrome.tabs.create as any).mockResolvedValue({ id: createdTabId });
    (chrome.tabs.get as any).mockImplementation(async (tabId: number) => {
      if (tabId === 1) {
        return { id: 1, url: 'https://example.com/', status: 'complete' };
      }
      if (tabId === createdTabId) {
        // Simulate a fast/cached navigation where the tab is already complete before we start waiting.
        return { id: createdTabId, url: 'https://chatgpt.com/c/c1', status: 'complete' };
      }
      return null;
    });

    const ctx = {
      tabId: 1,
      vars: { ruminerConversationUrl: 'https://chatgpt.com/c/c1' },
      log: vi.fn(),
    } as any;

    const node = {
      kind: 'ruminer.ensure_conversation_tab',
      config: {
        conversationUrlVar: 'ruminerConversationUrl',
        active: false,
        waitForCompleteMs: 50,
        skipIfAlreadyOnConversation: false,
      },
    } as any;

    const result = await ensureConversationTabNodeDefinition.execute(ctx, node);

    expect(result.status).toBe('succeeded');
    expect(result).toMatchObject({
      status: 'succeeded',
      varsPatch: [{ op: 'set', name: '__rr_v2__tabId', value: createdTabId }],
    });

    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalled();
  });
});
