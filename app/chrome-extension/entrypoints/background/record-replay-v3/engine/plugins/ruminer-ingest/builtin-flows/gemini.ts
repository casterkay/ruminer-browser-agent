import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const GEMINI_DOMAIN_BINDINGS = [{ kind: 'domain' as const, value: 'gemini.google.com' }];

const GEMINI_DEFAULT_REQUIRED_TOOLS = [
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.JAVASCRIPT,
] as const;

const GEMINI_SCANNER_SCRIPT = `
return (async () => {
  const PLATFORM = 'gemini';
  const FLOW_ID = 'ruminer.gemini.scanner.v1';
  const INGEST_FLOW_ID = 'ruminer.gemini.conversation_ingest.v1';
  const TAIL_SIZE = 6;

  const runId = typeof __rr_v3_runId === 'string' && __rr_v3_runId.trim() ? __rr_v3_runId.trim() : null;

  const notify = async (title, message) => {
    try { await chrome.runtime.sendMessage({ type: 'ruminer.workflow.notify', title, message }); } catch {}
  };

  const progress = async (payload) => {
    if (!runId) return;
    try { await chrome.runtime.sendMessage({ type: 'ruminer.workflow.progress', runId, flowId: FLOW_ID, payload }); } catch {}
  };

  const bytesToHex = (buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256Hex = async (input) => {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(input || '')));
    return bytesToHex(digest);
  };
  const normalizeContent = (s) => String(s || '').replace(/\\r\\n/g, '\\n').trim();
  const hashMessage = async (role, content) => sha256Hex(JSON.stringify({ content: normalizeContent(content), role }));

  const getConversationStates = async (groupIds) => {
    const resp = await chrome.runtime.sendMessage({ type: 'ruminer.ledger.getConversationStates', groupIds, tailSize: TAIL_SIZE });
    if (!resp || !resp.ok) {
      const err = resp && resp.error ? String(resp.error) : 'ledger.getConversationStates failed';
      throw new Error(err);
    }
    return resp.result || {};
  };

  const enqueueRuns = async (items) => {
    const resp = await chrome.runtime.sendMessage({ type: 'ruminer.rr_v3.enqueueRuns', items });
    if (!resp || !resp.ok) {
      const err = resp && resp.error ? String(resp.error) : 'enqueueRuns failed';
      throw new Error(err);
    }
    return resp.result || {};
  };

  const findSidebarScroller = () => {
    const candidates = [
      '[data-test-id*="history"]',
      '[data-testid*="history"]',
      'mat-sidenav-content',
      '.chat-history',
      'nav',
      'aside',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  const collectSidebarConversations = async () => {
    const scroller = findSidebarScroller();
    const seen = new Set();
    const out = [];

    let stable = 0;
    let lastCount = 0;
    for (let i = 0; i < 80; i++) {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = String(a.getAttribute('href') || '');
        if (!href.includes('/app/')) continue;
        const url = new URL(href, location.origin);
        if (url.hostname !== location.hostname) continue;
        const m = url.pathname.match(/^\\/app\\/([^/?#]+)/);
        if (!m) continue;
        const id = String(m[1] || '').trim();
        if (!id || id.toLowerCase() === 'new') continue;
        if (seen.has(id)) continue;
        const title = String(a.textContent || '').trim() || null;
        seen.add(id);
        out.push({ id, url: url.toString(), title });
      }

      if (out.length === lastCount) stable += 1;
      else stable = 0;
      lastCount = out.length;

      if (stable >= 5) break;
      if (scroller) scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(200, Math.floor(scroller.clientHeight * 0.8)));
      await new Promise((r) => setTimeout(r, 200));
    }

    return out;
  };

  const extractTailMessages = async () => {
    const containers = Array.from(document.querySelectorAll('#chat-history .conversation-container'));
    const tailContainers = containers.slice(-Math.max(1, Math.ceil(TAIL_SIZE / 2) + 2));

    const messages = [];
    for (const c of tailContainers) {
      const userNode =
        c.querySelector('user-query .query-text-line') ||
        c.querySelector('user-query .query-text p') ||
        c.querySelector('user-query .query-text');
      const userText = userNode ? normalizeContent(userNode.textContent || '') : '';
      if (userText) messages.push({ role: 'user', content: userText });

      const modelNode =
        c.querySelector('.model-response-text .markdown') ||
        c.querySelector('.response-container-content') ||
        c.querySelector('model-response');
      const modelText = modelNode ? normalizeContent(modelNode.textContent || '') : '';
      if (modelText) messages.push({ role: 'assistant', content: modelText });
    }

    return messages.slice(-TAIL_SIZE);
  };

  const computeTailHashes = async () => {
    const msgs = await extractTailMessages();
    const hashes = [];
    for (const m of msgs) {
      hashes.push(await hashMessage(m.role, m.content));
    }
    return hashes;
  };

  const openConversationInPlace = async (url) => {
    const targetPath = new URL(url).pathname;
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const a = anchors.find((x) => {
      try {
        const u = new URL(String(x.getAttribute('href') || ''), location.origin);
        return u.pathname === targetPath;
      } catch {
        return false;
      }
    });
    if (a) (a).click();
    else history.pushState({}, '', url);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (location.pathname === targetPath && document.querySelector('#chat-history')) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const startedAt = Date.now();
  await progress({ kind: 'gemini.scanner.started', tailSize: TAIL_SIZE });

  const convs = await collectSidebarConversations();
  const groupIds = convs.map((c) => PLATFORM + ':' + c.id);
  const states = await getConversationStates(groupIds);

  let sawMissing = false;
  let enqueued = 0;
  let scanned = 0;
  let unchangedStopAt = null;

  const toEnqueue = [];

  for (const c of convs) {
    scanned += 1;
    const gid = PLATFORM + ':' + c.id;
    const state = states && states[gid] ? states[gid] : { exists: false };

    if (!state.exists) {
      sawMissing = true;
      toEnqueue.push({
        flowId: INGEST_FLOW_ID,
        args: {
          ruminerPlatform: PLATFORM,
          ruminerConversationId: c.id,
          ruminerConversationUrl: c.url,
          ...(c.title ? { ruminerConversationTitle: c.title } : {}),
        },
      });
      continue;
    }

    if (state.status === 'skipped') continue;
    if (state.status === 'failed') {
      toEnqueue.push({
        flowId: INGEST_FLOW_ID,
        args: {
          ruminerPlatform: PLATFORM,
          ruminerConversationId: c.id,
          ruminerConversationUrl: c.url,
          ...(c.title ? { ruminerConversationTitle: c.title } : {}),
        },
      });
      continue;
    }

    if (!sawMissing) {
      await openConversationInPlace(c.url);
      const currentTail = await computeTailHashes();
      const ledgerTail = Array.isArray(state.tailHashes) ? state.tailHashes : [];
      const unchanged = ledgerTail.length === currentTail.length && ledgerTail.every((h, i) => h === currentTail[i]);
      if (unchanged) {
        unchangedStopAt = c.id;
        break;
      }
      toEnqueue.push({
        flowId: INGEST_FLOW_ID,
        args: {
          ruminerPlatform: PLATFORM,
          ruminerConversationId: c.id,
          ruminerConversationUrl: c.url,
          ...(c.title ? { ruminerConversationTitle: c.title } : {}),
        },
      });
    }
  }

  if (toEnqueue.length > 0) {
    await progress({
      kind: 'gemini.scanner.enqueued',
      conversations: toEnqueue.map((item) => {
        const args = item && item.args ? item.args : {};
        const cid = String(args.ruminerConversationId || '').trim();
        return {
          platform: PLATFORM,
          sessionId: PLATFORM + ':' + cid,
          conversationId: cid,
          title: args.ruminerConversationTitle || null,
          url: args.ruminerConversationUrl || null,
        };
      }),
    });
    const r = await enqueueRuns(toEnqueue);
    enqueued = Number(r.enqueued || 0);
  }

  const durationMs = Date.now() - startedAt;
  await notify(
    'Gemini – Import All',
    'enqueued ' +
      enqueued +
      ', scanned ' +
      scanned +
      (unchangedStopAt ? ', stopped at unchanged ' + unchangedStopAt : '') +
      ' (' +
      durationMs +
      'ms)',
  );
  await progress({ kind: 'gemini.scanner.finished', scanned, enqueued, sawMissing, unchangedStopAt, durationMs });
  return { ok: true, scanned, enqueued, sawMissing, unchangedStopAt, durationMs };
})();
`.trim();

const GEMINI_INGEST_SCRIPT = `
return (async () => {
  const PLATFORM = 'gemini';
  const rawUrl = String(location.href || '');
  let parsed;
  try { parsed = new URL(rawUrl); } catch { parsed = null; }
  if (!parsed || parsed.hostname !== 'gemini.google.com') throw new Error('Not on gemini.google.com');

  const runId = typeof __rr_v3_runId === 'string' && __rr_v3_runId.trim() ? __rr_v3_runId.trim() : null;

  const m = String(parsed.pathname || '').match(/^\\/app\\/([^/?#]+)/);
  const conversationId = m ? String(m[1] || '').trim() : '';
  if (!conversationId) throw new Error('Failed to parse conversation id from URL');

  const normalizeContent = (s) => String(s || '').replace(/\\r\\n/g, '\\n').trim();

  const findScroller = () => {
    const candidates = [
      '.chat-scrollable-container',
      '.chat-history-scroll-container',
      'chat-history-scroll-container',
      'infinite-scroller',
      '[data-test-id="chat-history-container"]',
      'mat-sidenav-content',
      '#chat-history',
      'main',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  const extractVisibleMessages = () => {
    const containers = Array.from(document.querySelectorAll('#chat-history .conversation-container'));
    const out = [];
    for (const c of containers) {
      const userNode =
        c.querySelector('user-query .query-text-line') ||
        c.querySelector('user-query .query-text p') ||
        c.querySelector('user-query .query-text');
      const userText = userNode ? normalizeContent(userNode.textContent || '') : '';
      if (userText) out.push({ role: 'user', content: userText });

      const modelNode =
        c.querySelector('.model-response-text .markdown') ||
        c.querySelector('.response-container-content') ||
        c.querySelector('model-response');
      const modelText = modelNode ? normalizeContent(modelNode.textContent || '') : '';
      if (modelText) out.push({ role: 'assistant', content: modelText });
    }
    return out;
  };

  // Best-effort: scroll down to materialize all virtualized turns.
  const scroller = findScroller();
  const seen = new Set();
  const messages = [];

  let stable = 0;
  for (let i = 0; i < 120; i++) {
    const visible = extractVisibleMessages();
    for (const msg of visible) {
      const key = msg.role + '\\n' + msg.content;
      if (seen.has(key)) continue;
      seen.add(key);
      messages.push(msg);
    }

    const before = scroller.scrollTop;
    scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(200, Math.floor(scroller.clientHeight * 0.9)));
    await new Promise((r) => setTimeout(r, 250));
    const after = scroller.scrollTop;
    if (after === before) stable += 1;
    else stable = 0;
    if (stable >= 5) break;
  }

  const titleNode =
    document.querySelector('.top-bar-actions .conversation-title') ||
    document.querySelector('.selected .conversation-title') ||
    document.querySelector('h1');
  const conversationTitle = titleNode ? normalizeContent(titleNode.textContent || '') : null;

  const ingestResp = await chrome.runtime.sendMessage({
    type: 'ruminer.ingest.ingestConversation',
    platform: PLATFORM,
    conversationId,
    runId,
    conversationTitle,
    conversationUrl: rawUrl,
    messages,
  });

  if (!ingestResp || !ingestResp.ok) {
    const err = ingestResp && ingestResp.error ? String(ingestResp.error) : 'Unknown ingest error';
    throw new Error(err);
  }

  const r = ingestResp.result || {};
  try {
    await chrome.runtime.sendMessage({
      type: 'ruminer.workflow.notify',
      title: 'Gemini – Import Conversation',
      message: 'upserted ' + Number(r.upserted || 0) + ', skipped ' + Number(r.skipped || 0) + ', failed ' + Number(r.failed || 0),
    });
  } catch {}

  return { ok: true, conversationId, ...r };
})();
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
      tags: partial.meta?.tags ?? [],
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : GEMINI_DOMAIN_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...GEMINI_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createGeminiBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.open_tab',
      kind: 'openTab',
      name: 'Open Gemini (background)',
      config: { url: 'https://gemini.google.com/app', active: false },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.scan',
      kind: 'script',
      name: 'Scan & enqueue (DOM)',
      config: { world: 'ISOLATED', code: GEMINI_SCANNER_SCRIPT },
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
      kind: 'openTab',
      name: 'Open conversation (background)',
      config: {
        url: { kind: 'var', ref: { name: 'ruminerConversationUrl' }, default: 'about:blank' },
        active: false,
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.ingest',
      kind: 'script',
      name: 'Ingest conversation (DOM)',
      config: { world: 'ISOLATED', code: GEMINI_INGEST_SCRIPT },
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

  return [
    createBaseFlow(nowIso, {
      id: 'ruminer.gemini.scanner.v1',
      name: 'Gemini – Import All',
      description:
        'Scans Gemini conversations via DOM and enqueues per-conversation ingestion runs (dialog only).',
      entryNodeId: 'n.open_tab',
      nodes: scannerNodes,
      edges: [
        { id: 'e.open__scan', from: 'n.open_tab', to: 'n.scan' },
        { id: 'e.scan__close', from: 'n.scan', to: 'n.close_tab' },
        { id: 'e.scan__close_on_error', from: 'n.scan', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: { tags: ['gemini', 'scanner', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
    createBaseFlow(nowIso, {
      id: 'ruminer.gemini.conversation_ingest.v1',
      name: 'Gemini – Import Current Conversation',
      description: 'Imports a single Gemini conversation into EMOS (dialog only).',
      entryNodeId: 'n.open_conv',
      nodes: ingestNodes,
      edges: [
        { id: 'e.open__ingest', from: 'n.open_conv', to: 'n.ingest' },
        { id: 'e.ingest__close', from: 'n.ingest', to: 'n.close_tab' },
        { id: 'e.ingest__close_on_error', from: 'n.ingest', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: { tags: ['gemini', 'ingestor', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
  ];
}
