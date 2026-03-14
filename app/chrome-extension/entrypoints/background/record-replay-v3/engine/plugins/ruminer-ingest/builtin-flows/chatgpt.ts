import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const CHATGPT_PAGE_BINDINGS = [
  { kind: 'domain' as const, value: 'chatgpt.com' },
  { kind: 'domain' as const, value: 'chat.openai.com' },
];

const CHATGPT_DEFAULT_REQUIRED_TOOLS = [
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.JAVASCRIPT,
] as const;

function createBaseFlow(
  nowIso: string,
  partial: Omit<FlowV3, 'schemaVersion' | 'createdAt' | 'updatedAt'>,
): FlowV3 {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    ...partial,
    meta: {
      ...(partial.meta ?? {}),
      tags: partial.meta?.tags ?? [],
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : CHATGPT_PAGE_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...CHATGPT_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createChatgptBuiltinFlows(nowIso: string): FlowV3[] {
  const scanNodes: NodeV3[] = [
    {
      id: 'n.scan',
      kind: 'ruminer.scan_and_ingest_conversations',
      name: 'Scan & Ingest (background)',
      config: {
        platform: 'chatgpt',
        limit: 100,
        stopAtFirstUnchangedIngested: true,
        digestThrottleMs: 150,
      },
      ui: { x: 0, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'chatgpt.conversation_scan.v1',
      name: 'ChatGPT - Import All',
      description:
        'Scans ChatGPT conversations in a background tab and ingests new/updated conversations.',
      entryNodeId: 'n.scan',
      nodes: scanNodes,
      edges: [],
      variables: [],
      meta: {
        tags: ['chatgpt', 'scanner', 'builtin'],
      },
      policy: {
        runTimeoutMs: 600_000,
      },
    }),
  ];
}
