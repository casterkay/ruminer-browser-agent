import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const DEEPSEEK_PAGE_BINDINGS = [{ kind: 'domain' as const, value: 'chat.deepseek.com' }];

const DEEPSEEK_DEFAULT_REQUIRED_TOOLS = [
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
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : DEEPSEEK_PAGE_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...DEEPSEEK_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createDeepseekBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.scan',
      kind: 'ruminer.scan_and_ingest_conversations',
      name: 'Scan & Ingest (background)',
      config: {
        platform: 'deepseek',
        limit: 100,
      },
      ui: { x: 0, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'deepseek.conversation_scan.v1',
      name: 'DeepSeek - Import All',
      description:
        'Scans DeepSeek conversations in a background tab and ingests new/updated conversations.',
      entryNodeId: 'n.scan',
      nodes: scannerNodes,
      edges: [],
      variables: [],
      meta: { tags: ['deepseek', 'scanner', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
  ];
}
