import { describe, expect, it } from 'vitest';

import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { createChatgptBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/chatgpt';
import { createClaudeBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/claude';
import { createDeepseekBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/deepseek';
import { createGeminiBuiltinFlows } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/builtin-flows/gemini';

function collectBuiltins(nowIso: string): FlowV3[] {
  return [
    ...createChatgptBuiltinFlows(nowIso),
    ...createClaudeBuiltinFlows(nowIso),
    ...createDeepseekBuiltinFlows(nowIso),
    ...createGeminiBuiltinFlows(nowIso),
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
      const scan = findNode(flow, 'ruminer.scan_and_enqueue_conversations');
      if (scan) {
        expect((scan.config as any)?.platform).toBeTruthy();
      }

      const ingest = findNode(flow, 'ruminer.ingest_current_conversation');
      if (ingest) {
        expect((ingest.config as any)?.platform).toBeTruthy();
      }
    }
  });
});
