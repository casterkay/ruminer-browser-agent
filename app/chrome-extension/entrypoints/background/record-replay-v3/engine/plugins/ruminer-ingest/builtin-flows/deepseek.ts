import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const DEEPSEEK_DOMAIN_BINDINGS = [{ kind: 'domain' as const, value: 'chat.deepseek.com' }];

const DEEPSEEK_DEFAULT_REQUIRED_TOOLS = [
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.JAVASCRIPT,
] as const;

const DEEPSEEK_SCANNER_SCRIPT = `
return (async () => {
  const PLATFORM = 'deepseek';
  const FLOW_ID = 'ruminer.deepseek.scanner.v1';
  const INGEST_FLOW_ID = 'ruminer.deepseek.conversation_ingest.v1';
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

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(urlString, location.origin);
      const p = String(u.pathname || '');
      let m = p.match(/\\/(?:chat|c)\\/([^/?#]+)/i);
      if (m) return String(m[1] || '').trim();
      const sp = u.searchParams;
      for (const key of ['conversationId', 'chatId', 'id']) {
        const v = sp.get(key);
        if (v && v.trim()) return v.trim();
      }
      const seg = p.split('/').filter(Boolean).pop();
      return seg ? String(seg).trim() : '';
    } catch {
      return '';
    }
  };

  const findSidebarScroller = () => {
    const candidates = ['nav', 'aside', '[data-testid*="sidebar"]', '[class*="sidebar"]'];
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

    for (let i = 0; i < 120; i++) {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = String(a.getAttribute('href') || '');
        if (!href) continue;
        if (!href.includes('chat') && !href.includes('c') && !href.includes('id=')) continue;
        const url = new URL(href, location.origin);
        if (url.hostname !== location.hostname) continue;
        const id = parseConversationId(url.toString());
        if (!id) continue;
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

  const compareDomOrder = (a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };

  const extractMessagesFromDom = () => {
    // Reference: _ref/deepseek-chat-exporter/content.js (selectors)
    const userQuestions = Array.from(document.querySelectorAll('.fbb737a4'));
    const aiResponses = Array.from(
      document.querySelectorAll('.ds-message .ds-markdown:not(.ds-think-content .ds-markdown)'),
    );

    const all = [];
    for (const el of userQuestions) all.push({ el, role: 'user' });
    for (const el of aiResponses) all.push({ el, role: 'assistant' });
    all.sort((x, y) => compareDomOrder(x.el, y.el));

    return all
      .map((x) => ({ role: x.role, content: normalizeContent(x.el.textContent || '') }))
      .filter((m) => m.content);
  };

  const computeTailHashes = async () => {
    const msgs = extractMessagesFromDom().slice(-TAIL_SIZE);
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
      } catch { return false; }
    });
    if (a) a.click();
    else history.pushState({}, '', url);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (location.pathname === targetPath) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const startedAt = Date.now();
  await progress({ kind: 'deepseek.scanner.started', tailSize: TAIL_SIZE });

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
      kind: 'deepseek.scanner.enqueued',
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
    'DeepSeek – Import All',
    'enqueued ' +
      enqueued +
      ', scanned ' +
      scanned +
      (unchangedStopAt ? ', stopped at unchanged ' + unchangedStopAt : '') +
      ' (' +
      durationMs +
      'ms)',
  );
  await progress({ kind: 'deepseek.scanner.finished', scanned, enqueued, sawMissing, unchangedStopAt, durationMs });
  return { ok: true, scanned, enqueued, sawMissing, unchangedStopAt, durationMs };
})();
`.trim();

const DEEPSEEK_INGEST_SCRIPT = `
return (async () => {
  const PLATFORM = 'deepseek';
  const rawUrl = String(location.href || '');
  let parsed;
	try { parsed = new URL(rawUrl); } catch { parsed = null; }
	if (!parsed || parsed.hostname !== 'chat.deepseek.com') throw new Error('Not on chat.deepseek.com');

  const runId = typeof __rr_v3_runId === 'string' && __rr_v3_runId.trim() ? __rr_v3_runId.trim() : null;

	const parseConversationId = (urlString) => {
		try {
			const u = new URL(urlString, location.origin);
			const p = String(u.pathname || '');
      let m = p.match(/\\/(?:chat|c)\\/([^/?#]+)/i);
      if (m) return String(m[1] || '').trim();
      const sp = u.searchParams;
      for (const key of ['conversationId', 'chatId', 'id']) {
        const v = sp.get(key);
        if (v && v.trim()) return v.trim();
      }
      const seg = p.split('/').filter(Boolean).pop();
      return seg ? String(seg).trim() : '';
    } catch {
      return '';
    }
  };

  const conversationId = parseConversationId(rawUrl);
  if (!conversationId) throw new Error('Failed to parse conversation id from URL');

  const normalizeContent = (s) => String(s || '').replace(/\\r\\n/g, '\\n').trim();

  const compareDomOrder = (a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };

  const extractMessagesFromDom = () => {
    const userQuestions = Array.from(document.querySelectorAll('.fbb737a4'));
    const aiResponses = Array.from(
      document.querySelectorAll('.ds-message .ds-markdown:not(.ds-think-content .ds-markdown)'),
    );

    const all = [];
    for (const el of userQuestions) all.push({ el, role: 'user' });
    for (const el of aiResponses) all.push({ el, role: 'assistant' });
    all.sort((x, y) => compareDomOrder(x.el, y.el));

    return all
      .map((x) => ({ role: x.role, content: normalizeContent(x.el.textContent || '') }))
      .filter((m) => m.content);
  };

  const findScroller = () => {
    const candidates = ['main', '[class*="scroll"]', '.ds-chat', '.ds-chat-container'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  const scroller = findScroller();
  const seen = new Set();
  const messages = [];

  let stable = 0;
  for (let i = 0; i < 160; i++) {
    const visible = extractMessagesFromDom();
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

  const titleNode = document.querySelector('h1') || document.querySelector('title');
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
      title: 'DeepSeek – Import Conversation',
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
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : DEEPSEEK_DOMAIN_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...DEEPSEEK_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createDeepseekBuiltinFlows(nowIso: string): FlowV3[] {
  const scannerNodes: NodeV3[] = [
    {
      id: 'n.open_tab',
      kind: 'openTab',
      name: 'Open DeepSeek (background)',
      config: { url: 'https://chat.deepseek.com/', active: false },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.scan',
      kind: 'script',
      name: 'Scan & enqueue (DOM)',
      config: { world: 'ISOLATED', code: DEEPSEEK_SCANNER_SCRIPT },
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
      config: { world: 'ISOLATED', code: DEEPSEEK_INGEST_SCRIPT },
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
      id: 'ruminer.deepseek.scanner.v1',
      name: 'DeepSeek – Import All',
      description: 'Scans DeepSeek conversations and enqueues conversation ingestion workflows.',
      entryNodeId: 'n.open_tab',
      nodes: scannerNodes,
      edges: [
        { id: 'e.open__scan', from: 'n.open_tab', to: 'n.scan' },
        { id: 'e.scan__close', from: 'n.scan', to: 'n.close_tab' },
        { id: 'e.scan__close_on_error', from: 'n.scan', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: { tags: ['deepseek', 'scanner', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
    createBaseFlow(nowIso, {
      id: 'ruminer.deepseek.conversation_ingest.v1',
      name: 'DeepSeek – Import Current Conversation',
      description: 'Imports the DeepSeek conversation in the current tab into Ruminer.',
      entryNodeId: 'n.open_conv',
      nodes: ingestNodes,
      edges: [
        { id: 'e.open__ingest', from: 'n.open_conv', to: 'n.ingest' },
        { id: 'e.ingest__close', from: 'n.ingest', to: 'n.close_tab' },
        { id: 'e.ingest__close_on_error', from: 'n.ingest', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: { tags: ['deepseek', 'ingestor', 'builtin'] },
      policy: { runTimeoutMs: 600_000 },
    }),
  ];
}
