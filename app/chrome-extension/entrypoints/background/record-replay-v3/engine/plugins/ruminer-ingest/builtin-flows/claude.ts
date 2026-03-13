import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const CLAUDE_DOMAIN_BINDINGS = [{ kind: 'domain' as const, value: 'claude.ai' }];

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
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : CLAUDE_DOMAIN_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...CLAUDE_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createClaudeBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.open_tab',
      kind: 'openTab',
      name: 'Open Claude (background)',
      config: { url: 'https://claude.ai/', active: false },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.scan',
      kind: 'ruminer.scan_and_enqueue_conversations',
      name: 'Scan & Enqueue',
      config: {
        platform: 'claude',
        limit: 100,
      },
      ui: { x: 240, y: 0 },
    },
    {
      id: 'n.close_tab',
      kind: 'closeTab',
      name: 'Close background tab',
      config: {},
      ui: { x: 480, y: 0 },
    },
  ];

  const ingestNodes: NodeV3[] = [
    {
      id: 'n.open_conv',
      kind: 'ruminer.ensure_conversation_tab',
      name: 'Check Conversation Tab',
      config: {
        conversationUrlVar: 'ruminerConversationUrl',
        active: false,
        waitForCompleteMs: 15_000,
        skipIfAlreadyOnConversation: true,
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.ingest',
      kind: 'ruminer.ingest_current_conversation',
      name: 'Ingest Conversation',
      config: {
        platform: 'claude',
        conversationUrlVar: 'ruminerConversationUrl',
        closeBackgroundTab: true,
      },
      ui: { x: 240, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'claude.conversation_scan.v1',
      name: 'Claude – Import All',
      description: 'Scans Claude conversations and enqueues conversation ingestion workflows.',
      entryNodeId: 'n.open_tab',
      nodes: scannerNodes,
      edges: [
        { id: 'e.open__scan', from: 'n.open_tab', to: 'n.scan' },
        { id: 'e.scan__close', from: 'n.scan', to: 'n.close_tab' },
        { id: 'e.scan__close_on_error', from: 'n.scan', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: { tags: ['claude', 'scanner', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
    createBaseFlow(nowIso, {
      id: 'claude.conversation_ingest.v1',
      name: 'Claude – Import Current Conversation',
      description: 'Imports the Claude conversation in the current tab into Ruminer.',
      entryNodeId: 'n.open_conv',
      nodes: ingestNodes,
      edges: [{ id: 'e.open__ingest', from: 'n.open_conv', to: 'n.ingest' }],
      variables: [],
      meta: { tags: ['claude', 'ingestor', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
  ];
}
