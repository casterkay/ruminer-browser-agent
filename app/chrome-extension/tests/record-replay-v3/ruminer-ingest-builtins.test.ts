import { describe, expect, it } from 'vitest';

import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { createChatgptBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt';
import { createClaudeBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/claude';
import { createDeepseekBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/deepseek';
import { createGeminiBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/gemini';
import { createGrokBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/grok';

function collectBuiltins(nowIso: string): FlowV3[] {
  return [
    ...createChatgptBuiltinFlows(nowIso),
    ...createClaudeBuiltinFlows(nowIso),
    ...createDeepseekBuiltinFlows(nowIso),
    ...createGeminiBuiltinFlows(nowIso),
    ...createGrokBuiltinFlows(nowIso),
  ];
}

function findNode(flow: FlowV3, kind: string): NodeV3 | undefined {
  return (flow.nodes || []).find((n) => n.kind === kind);
}

describe('ruminer ingest builtin flows', () => {
  it('contains no script nodes', () => {
    const flows = collectBuiltins('2026-03-12T00:00:00.000Z');
    for (const flow of flows) {
      expect(flow.nodes.some((n) => n.kind === 'script')).toBe(false);
    }
  });

  it('scan/ingest nodes require config.platform', () => {
    const flows = collectBuiltins('2026-03-12T00:00:00.000Z');

    for (const flow of flows) {
      const scan = findNode(flow, 'ruminer.scan_and_ingest_conversations');
      if (scan) {
        expect((scan.config as any)?.platform).toBeTruthy();
      }

      const ingest = findNode(flow, 'ruminer.ingest_current_conversation');
      if (ingest) {
        expect((ingest.config as any)?.conversationUrlVar).toBeTruthy();
      }
    }
  });

  it('chatgpt builtin relies on scan node early-stop semantics', () => {
    const flows = collectBuiltins('2026-03-12T00:00:00.000Z');
    const chatgpt = flows.find((f) => f.id === 'chatgpt.conversation_scan.v1');
    expect(chatgpt).toBeTruthy();
    const scan = chatgpt ? findNode(chatgpt, 'ruminer.scan_and_ingest_conversations') : undefined;
    expect(scan).toBeTruthy();
    expect((scan!.config as any)?.platform).toBe('chatgpt');
    expect((scan!.config as any)?.stopAtFirstUnchangedIngested).toBeUndefined();
    expect((scan!.config as any)?.limit).toBeUndefined();
    expect(Number((scan!.config as any)?.digestThrottleMs || 0)).toBeGreaterThanOrEqual(0);
  });
});
