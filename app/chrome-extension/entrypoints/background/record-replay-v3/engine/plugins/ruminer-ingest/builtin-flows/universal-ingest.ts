import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const UNIVERSAL_DOMAIN_BINDINGS = [
  { kind: 'domain' as const, value: 'chatgpt.com' },
  { kind: 'domain' as const, value: 'chat.openai.com' },
  { kind: 'domain' as const, value: 'claude.ai' },
  { kind: 'domain' as const, value: 'gemini.google.com' },
  { kind: 'domain' as const, value: 'chat.deepseek.com' },
];

const UNIVERSAL_DEFAULT_REQUIRED_TOOLS = [
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.JAVASCRIPT,
] as const;

export function createUniversalIngestBuiltinFlow(nowIso: string): FlowV3 {
  const nodes: NodeV3[] = [
    {
      id: 'n.ingest',
      kind: 'ruminer.ingest_current_conversation',
      name: 'Ingest Current Conversation',
      config: {
        conversationUrlVar: 'ruminerConversationUrl',
        ensureTabUrl: 'require_match',
      },
      ui: { x: 0, y: 0 },
    },
  ];

  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    id: 'auto.conversation_ingest.v1',
    name: 'Import Current Conversation',
    description:
      'Save the conversation on the current tab to a session in Ruminer. Supports ChatGPT, Gemini, Claude, and DeepSeek.',
    entryNodeId: 'n.ingest',
    nodes,
    edges: [],
    variables: [],
    meta: {
      tags: ['ingestor', 'builtin'],
      bindings: UNIVERSAL_DOMAIN_BINDINGS,
      requiredTools: [...UNIVERSAL_DEFAULT_REQUIRED_TOOLS],
    },
    policy: {
      runTimeoutMs: 300_000,
    },
  };
}
