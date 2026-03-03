import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';

const CHATGPT_DOMAIN_BINDINGS = [
  { kind: 'domain' as const, value: 'chat.openai.com' },
  { kind: 'domain' as const, value: 'chatgpt.com' },
];

const CHATGPT_LIST_SCRIPT = `
// ChatGPT conversation list scraper.
// input: string cursor (offset) or null.
// returns: { items: [{ id, url, title }], nextCursor: string|null, done: boolean }

const offset = typeof input === 'string' && input.trim() ? Math.max(0, parseInt(input, 10) || 0) : 0;
const limit = 100;

function normalizeHref(href) {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    return new URL(href, window.location.origin).toString();
  } catch {
    return null;
  }
}

function matchConversationId(href) {
  if (typeof href !== 'string') return null;
  const m = href.match(/\\/(?:c|chat)\\/([^/?#]+)/i);
  return m ? String(m[1]) : null;
}

const anchors = Array.from(document.querySelectorAll('a[href]'));
const raw = [];
for (const a of anchors) {
  const href = a.getAttribute('href') || '';
  const id = matchConversationId(href);
  if (!id) continue;

  const url = normalizeHref(href);
  if (!url) continue;

  const title = (a.textContent || '').replace(/\\s+/g, ' ').trim();
  raw.push({ id, url, title: title || null });
}

// Deduplicate by id, preserve order.
const seen = new Set();
const itemsAll = [];
for (const item of raw) {
  if (!item || !item.id) continue;
  if (seen.has(item.id)) continue;
  seen.add(item.id);
  itemsAll.push(item);
}

const items = itemsAll.slice(offset, offset + limit);
const nextOffset = offset + items.length;
const done = items.length === 0 || nextOffset >= itemsAll.length;

return {
  items,
  nextCursor: done ? null : String(nextOffset),
  done,
};
`.trim();

const CHATGPT_IS_LOGGED_IN_SCRIPT = `
// Best-effort "logged in" detector for ChatGPT.
// returns boolean

const url = window.location.href || '';
if (/\\/(?:auth|login|signup)\\b/i.test(url)) return false;

const text = (el) => (el && typeof el.textContent === 'string' ? el.textContent : '');
const isLoginLike = (s) => /\\b(log\\s*in|sign\\s*in|sign\\s*up|create\\s*account)\\b/i.test(s);

const btns = Array.from(document.querySelectorAll('button, a'));
for (const el of btns) {
  const t = text(el).trim();
  if (t && isLoginLike(t)) return false;
}

// Message composer is a decent proxy for being logged in.
const composer =
  document.querySelector('textarea') ||
  document.querySelector('[data-testid="prompt-textarea"]') ||
  document.querySelector('[contenteditable="true"]');

return Boolean(composer);
`.trim();

const CHATGPT_EXTRACT_MESSAGES_SCRIPT = `
// ChatGPT conversation message extractor.
// input: unused (array) - present for compatibility.
// returns: [{ sender, content, role, message_index, group_name, canonical_url }]

function cleanText(raw) {
  return String(raw || '').replace(/\\s+\\n/g, '\\n').replace(/\\n\\s+/g, '\\n').replace(/\\s+/g, ' ').trim();
}

const url = window.location.href || '';
const title = (document.title || '').trim();

const roleAttr = 'data-message-author-role';
const nodes = Array.from(document.querySelectorAll('[' + roleAttr + ']'));

const out = [];
for (let i = 0; i < nodes.length; i++) {
  const el = nodes[i];
  const role = String(el.getAttribute(roleAttr) || '').toLowerCase();
  if (!role) continue;

  const content = cleanText(el.textContent || '');
  if (!content) continue;

  const sender = role === 'user' ? 'me' : role === 'assistant' ? 'chatgpt' : role;

  out.push({
    sender,
    sender_name: sender,
    role,
    content,
    message_index: out.length,
    group_name: title || null,
    canonical_url: url || null,
  });
}

return out;
`.trim();

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
      tags: Array.from(new Set([...(partial.meta?.tags ?? []), 'builtin', 'chatgpt'])),
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : CHATGPT_DOMAIN_BINDINGS,
    },
  };
}

export function createChatgptBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.navigate_list',
      kind: 'navigate',
      name: 'Open ChatGPT',
      config: {
        url: 'https://chatgpt.com/',
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.scan_list',
      kind: 'ruminer.scan_conversation_list',
      name: 'Scan conversation list',
      config: {
        platform: 'chatgpt',
        listScript: CHATGPT_LIST_SCRIPT,
        targetFlowIdVar: 'ruminer.scan.targetFlowId',
        stateKey: '$scan.chatgpt.state',
        heuristicMatchStreak: 3,
        maxItemsPerRun: 50,
        maxEnqueuePerRun: 50,
        fullScanEveryRuns: 20,
        fullScanEveryDays: 7,
        maxOrderListSize: 500,
        filtersVar: 'ruminer.scan.filters',
      },
      ui: { x: 240, y: 0 },
    },
  ];

  const conversationNodes: NodeV3[] = [
    {
      id: 'n.navigate_conversation',
      kind: 'navigate',
      name: 'Open conversation',
      config: {
        url: '{conversationUrl}',
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.auth_page',
      kind: 'ruminer.page_auth_check',
      name: 'Check ChatGPT login',
      config: {
        platformLabel: 'ChatGPT',
        notifyTitle: 'Ruminer workflow blocked',
        script: CHATGPT_IS_LOGGED_IN_SCRIPT,
      },
      ui: { x: 240, y: 0 },
    },
    {
      id: 'n.delay_before_extract',
      kind: 'ruminer.random_delay',
      name: 'Delay (anti-rate-limit)',
      config: {
        minMs: 800,
        maxMs: 2_000,
      },
      ui: { x: 480, y: 0 },
    },
    {
      id: 'n.extract_messages',
      kind: 'ruminer.extract_messages',
      name: 'Extract messages',
      config: {
        script: CHATGPT_EXTRACT_MESSAGES_SCRIPT,
        inputVar: 'ruminer.list.items',
        outputVar: 'ruminer.messages',
        platform: 'chatgpt',
        conversationIdVar: 'conversationId',
      },
      ui: { x: 720, y: 0 },
    },
    {
      id: 'n.normalize_hash',
      kind: 'ruminer.normalize_and_hash',
      name: 'Normalize + hash',
      config: {},
      ui: { x: 960, y: 0 },
    },
    {
      id: 'n.ledger_upsert',
      kind: 'ruminer.ledger_upsert',
      name: 'Ledger upsert',
      config: {},
      ui: { x: 1_200, y: 0 },
    },
    {
      id: 'n.emos_auth',
      kind: 'ruminer.auth_check',
      name: 'Check EverMemOS settings',
      config: {
        verifyRemote: false,
        notifyTitle: 'Ruminer workflow blocked',
      },
      ui: { x: 1_440, y: 0 },
    },
    {
      id: 'n.emos_ingest',
      kind: 'ruminer.emos_ingest',
      name: 'Ingest into EverMemOS',
      config: {
        continueOnError: false,
        maxRetries: 3,
        initialBackoffMs: 1_000,
        backoffMultiplier: 2,
      },
      ui: { x: 1_680, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.scanner.v1',
      name: 'ChatGPT — Scanner',
      description:
        'Scans the ChatGPT sidebar and enqueues ingestion runs for new/moved conversations.',
      entryNodeId: 'n.navigate_list',
      nodes: scannerNodes,
      edges: [{ id: 'e.navigate_list__scan_list', from: 'n.navigate_list', to: 'n.scan_list' }],
      variables: [
        {
          name: 'ruminer.scan.targetFlowId',
          label: 'Target ingest flow id',
          default: 'ruminer.chatgpt.conversation_ingest.v1',
        },
        {
          name: 'ruminer.scan.filters',
          label: 'Scan filters',
          default: {},
        },
      ],
      meta: {
        tags: ['scanner'],
      },
    }),
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.conversation_ingest.v1',
      name: 'ChatGPT — Conversation ingest',
      description: 'Extracts messages from a ChatGPT conversation and upserts them into EverMemOS.',
      entryNodeId: 'n.navigate_conversation',
      nodes: conversationNodes,
      edges: conversationNodes.slice(0, -1).map((node, idx) => ({
        id: `e.${conversationNodes[idx].id}__${conversationNodes[idx + 1].id}`,
        from: node.id,
        to: conversationNodes[idx + 1].id,
      })),
      variables: [
        {
          name: 'conversationUrl',
          label: 'Conversation URL',
          required: true,
        },
        {
          name: 'conversationId',
          label: 'Conversation ID',
          required: true,
        },
        {
          name: 'ruminer.list.items',
          label: 'Internal (extract input)',
          default: [],
        },
      ],
      meta: {
        tags: ['ingest'],
      },
    }),
  ];
}
