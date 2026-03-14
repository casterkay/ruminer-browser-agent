import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const CLAUDE_PAGE_BINDINGS = [{ kind: 'domain' as const, value: 'claude.ai' }];

const CLAUDE_DEFAULT_REQUIRED_TOOLS = [
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
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : CLAUDE_PAGE_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...CLAUDE_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createClaudeBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.scan',
      kind: 'ruminer.scan_and_ingest_conversations',
      name: 'Scan & Ingest (background)',
      config: {
        platform: 'claude',
      },
      ui: { x: 0, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'claude.conversation_scan.v1',
      name: 'Claude - Import All',
      description:
        'Scans Claude conversations in a background tab and ingests new/updated conversations.',
      entryNodeId: 'n.scan',
      nodes: scannerNodes,
      edges: [],
      variables: [],
      meta: { tags: ['claude', 'scanner', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
  ];
}
