import type { FlowV3, NodeV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { FLOW_SCHEMA_VERSION } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { TOOL_NAMES } from 'chrome-mcp-shared';

const CHATGPT_DOMAIN_BINDINGS = [
  { kind: 'domain' as const, value: 'chat.openai.com' },
  { kind: 'domain' as const, value: 'chatgpt.com' },
];

const CHATGPT_DEFAULT_REQUIRED_TOOLS = [
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.JAVASCRIPT,
] as const;

const CHATGPT_SCANNER_SCRIPT = `
return (async () => {
  const PLATFORM = 'chatgpt';
  const FLOW_ID = 'ruminer.chatgpt.scanner.v1';
  const INGEST_FLOW_ID = 'ruminer.chatgpt.conversation_ingest.v1';
  const LIMIT = 100;
  const TAIL_SIZE = 6;

  const runId = typeof __rr_v3_runId === 'string' && __rr_v3_runId.trim() ? __rr_v3_runId.trim() : null;

  const notify = async (title, message) => {
    try { await chrome.runtime.sendMessage({ type: 'ruminer.workflow.notify', title, message }); } catch {}
  };

  const progress = async (payload) => {
    if (!runId) return;
    try { await chrome.runtime.sendMessage({ type: 'ruminer.workflow.progress', runId, flowId: FLOW_ID, payload }); } catch {}
  };

  const safeJson = async (response) => {
    try { return await response.json(); } catch { return null; }
  };

  const getAccessToken = async () => {
    const url = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');
    const payload = await safeJson(resp);
    const token = payload && typeof payload.accessToken === 'string' ? payload.accessToken : '';
    if (!token.trim()) throw new Error('ChatGPT session missing access token');
    return token.trim();
  };

  const getCookie = (key) => {
    try {
      const m = document.cookie.match('(^|;)\\\\s*' + key + '\\\\s*=\\\\s*([^;]+)');
      return m ? String(m.pop() || '') : '';
    } catch { return ''; }
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const url = new URL('/backend-api/accounts/check/v4-2023-04-27', location.origin).toString();
    const resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken, 'X-Authorization': 'Bearer ' + accessToken },
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const payload = await safeJson(resp);
    try {
      const account = payload && payload.accounts && payload.accounts[workspaceId];
      const accountId = account && account.account && account.account.account_id;
      return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null;
    } catch { return null; }
  };

  const fetchBackendApi = async (path, query, accessToken, accountId) => {
    const url = new URL('/backend-api' + path, location.origin);
    const q = query || {};
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    const headers = { Authorization: 'Bearer ' + accessToken, 'X-Authorization': 'Bearer ' + accessToken };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;

    const resp = await fetch(url.toString(), { headers, credentials: 'include' });
    if (!resp.ok) {
      const body = await safeJson(resp);
      const msg = body && (body.detail || body.error) ? String(body.detail || body.error) : '';
      throw new Error('ChatGPT backend API failed (' + resp.status + '): ' + (msg || resp.statusText || 'request failed'));
    }
    return safeJson(resp);
  };

  const listConversations = async (offset, accessToken, accountId) => {
    return fetchBackendApi('/conversations', { offset, limit: LIMIT, order: 'updated' }, accessToken, accountId);
  };

  const fetchConversation = async (id, accessToken, accountId) => {
    return fetchBackendApi('/conversation/' + encodeURIComponent(id), {}, accessToken, accountId);
  };

  const extractContentText = (content) => {
    if (!content || typeof content !== 'object') return '';
    const t = content.content_type;
    if (t === 'text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.filter((p) => typeof p === 'string').join('');
    }
    if (t === 'code') return typeof content.text === 'string' ? content.text : '';
    if (t === 'execution_output') return typeof content.text === 'string' ? content.text : '';
    if (t === 'multimodal_text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
          return '';
        })
        .join('');
    }
    if (t === 'tether_quote') {
      const bits = [];
      if (typeof content.title === 'string') bits.push(content.title);
      if (typeof content.text === 'string') bits.push(content.text);
      if (typeof content.url === 'string') bits.push(content.url);
      return bits.join('\\\\n');
    }
    return '';
  };

  const extractConversationMessages = (conversation) => {
    const mapping = conversation && conversation.mapping ? conversation.mapping : null;
    const current = conversation && conversation.current_node ? conversation.current_node : null;
    if (!mapping || typeof mapping !== 'object' || !current) return [];

    const chain = [];
    const visited = new Set();
    let nodeId = String(current);
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      chain.push(node);
      const parent = node && node.parent ? String(node.parent) : '';
      nodeId = parent || '';
    }
    chain.reverse();

    const out = [];
    for (const node of chain) {
      const msg = node && node.message ? node.message : null;
      const role = msg && typeof msg.author === 'object' && typeof msg.author.role === 'string' ? msg.author.role : '';
      if (role !== 'user' && role !== 'assistant') continue;
      const content = extractContentText(msg && msg.content ? msg.content : null).replace(/\\r\\n/g, '\\n').trim();
      if (!content) continue;
      out.push({ role, content });
    }
    return out;
  };

  const bytesToHex = (buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256Hex = async (input) => {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(input || '')));
    return bytesToHex(digest);
  };

  const hashMessage = async (role, content) => {
    // Must match background canonicalization: stableJson({ content, role }) where keys sort to content,role.
    return sha256Hex(JSON.stringify({ content: String(content || '').replace(/\\r\\n/g, '\\n').trim(), role }));
  };

  const tailHashes = async (messages) => {
    const tail = messages.slice(-TAIL_SIZE);
    const out = [];
    for (const m of tail) {
      out.push(await hashMessage(m.role, m.content));
    }
    return out;
  };

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

  const startedAt = Date.now();
  const accessToken = await getAccessToken();
  const accountId = await getTeamAccountId(accessToken);

  let sawMissing = false;
  let stopOnUnchanged = false;
  let unchangedStopAt = null;

  let scanned = 0;
  let enqueued = 0;

  await progress({ kind: 'chatgpt.scanner.started', limit: LIMIT, tailSize: TAIL_SIZE });

  let offset = 0;
  while (!stopOnUnchanged) {
    const list = await listConversations(offset, accessToken, accountId);
    const items = list && Array.isArray(list.items) ? list.items : [];
    if (items.length === 0) break;

    const rows = items
      .map((it) => {
        const id = String(it && it.id ? it.id : '').trim();
        if (!id) return null;
        const title = typeof it.title === 'string' ? it.title : null;
        const url = 'https://chatgpt.com/c/' + id;
        return { id, title, url, groupId: PLATFORM + ':' + id };
      })
      .filter(Boolean);

    const groupIds = rows.map((r) => r.groupId);
    const states = await getConversationStates(groupIds);

    const toEnqueue = [];

    for (const row of rows) {
      scanned += 1;
      const state = states && states[row.groupId] ? states[row.groupId] : { exists: false };

      if (!state.exists) {
        sawMissing = true;
        toEnqueue.push({
          flowId: INGEST_FLOW_ID,
          args: {
            ruminerPlatform: PLATFORM,
            ruminerConversationId: row.id,
            ruminerConversationUrl: row.url,
            ...(row.title ? { ruminerConversationTitle: row.title } : {}),
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
            ruminerConversationId: row.id,
            ruminerConversationUrl: row.url,
            ...(row.title ? { ruminerConversationTitle: row.title } : {}),
          },
        });
        continue;
      }

      if (!sawMissing) {
        const conv = await fetchConversation(row.id, accessToken, accountId);
        const msgs = extractConversationMessages(conv);
        const currentTail = await tailHashes(msgs);
        const ledgerTail = Array.isArray(state.tailHashes) ? state.tailHashes : [];
        const unchanged = ledgerTail.length === currentTail.length && ledgerTail.every((h, i) => h === currentTail[i]);

        if (unchanged) {
          stopOnUnchanged = true;
          unchangedStopAt = row.id;
          break;
        }

        toEnqueue.push({
          flowId: INGEST_FLOW_ID,
          args: {
            ruminerPlatform: PLATFORM,
            ruminerConversationId: row.id,
            ruminerConversationUrl: row.url,
            ...(row.title ? { ruminerConversationTitle: row.title } : {}),
          },
        });
      }
    }

    if (toEnqueue.length > 0) {
      await progress({
        kind: 'chatgpt.scanner.enqueued',
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
      enqueued += Number(r.enqueued || 0);
    }

    await progress({
      kind: 'chatgpt.scanner.page',
      offset,
      scanned,
      enqueued,
      sawMissing,
      stopOnUnchanged,
      ...(unchangedStopAt ? { unchangedStopAt } : {}),
    });

    if (stopOnUnchanged) break;
    offset += items.length;
  }

  const durationMs = Date.now() - startedAt;
  await notify(
    'ChatGPT – Import All',
    'enqueued ' +
      enqueued +
      ', scanned ' +
      scanned +
      (unchangedStopAt ? ', stopped at unchanged ' + unchangedStopAt : '') +
      ' (' +
      durationMs +
      'ms)',
  );

  await progress({ kind: 'chatgpt.scanner.finished', scanned, enqueued, sawMissing, unchangedStopAt, durationMs });
  return { ok: true, scanned, enqueued, sawMissing, unchangedStopAt, durationMs };
})();
`.trim();

const CHATGPT_INGEST_SCRIPT = `
return (async () => {
  const PLATFORM = 'chatgpt';
  const rawUrl = String(location.href || '');
  let parsedUrl;
  try { parsedUrl = new URL(rawUrl); } catch { parsedUrl = null; }

  const allowedHosts = new Set(['chatgpt.com', 'chat.openai.com']);
  const host = parsedUrl ? String(parsedUrl.host || '') : '';
  if (!parsedUrl || !allowedHosts.has(host)) {
    throw new Error('Tab must be on chatgpt.com or chat.openai.com');
  }

  const m = String(parsedUrl.pathname || '').match(/\\/(?:c|chat)\\/([^/?#]+)/i);
  const conversationId = m ? String(m[1]) : '';
  if (!conversationId) throw new Error('Failed to parse conversation id from URL');

  const runId = typeof __rr_v3_runId === 'string' && __rr_v3_runId.trim() ? __rr_v3_runId.trim() : null;

  const safeJson = async (response) => {
    try { return await response.json(); } catch { return null; }
  };

  const getAccessToken = async () => {
    const url = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');
    const payload = await safeJson(resp);
    const token = payload && typeof payload.accessToken === 'string' ? payload.accessToken : '';
    if (!token.trim()) throw new Error('ChatGPT session missing access token');
    return token.trim();
  };

  const getCookie = (key) => {
    try {
      const m = document.cookie.match('(^|;)\\\\s*' + key + '\\\\s*=\\\\s*([^;]+)');
      return m ? String(m.pop() || '') : '';
    } catch { return ''; }
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const url = new URL('/backend-api/accounts/check/v4-2023-04-27', location.origin).toString();
    const resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken, 'X-Authorization': 'Bearer ' + accessToken },
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const payload = await safeJson(resp);
    try {
      const account = payload && payload.accounts && payload.accounts[workspaceId];
      const accountId = account && account.account && account.account.account_id;
      return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null;
    } catch { return null; }
  };

  const fetchBackendApi = async (path, accessToken, accountId) => {
    const url = new URL('/backend-api' + path, location.origin);
    const headers = { Authorization: 'Bearer ' + accessToken, 'X-Authorization': 'Bearer ' + accessToken };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;
    const resp = await fetch(url.toString(), { headers, credentials: 'include' });
    if (!resp.ok) {
      const body = await safeJson(resp);
      const msg = body && (body.detail || body.error) ? String(body.detail || body.error) : '';
      throw new Error('ChatGPT backend API failed (' + resp.status + '): ' + (msg || resp.statusText || 'request failed'));
    }
    return safeJson(resp);
  };

  const fetchConversation = async (id, accessToken, accountId) => {
    return fetchBackendApi('/conversation/' + encodeURIComponent(id), accessToken, accountId);
  };

  const extractContentText = (content) => {
    if (!content || typeof content !== 'object') return '';
    const t = content.content_type;
    if (t === 'text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.filter((p) => typeof p === 'string').join('');
    }
    if (t === 'code') return typeof content.text === 'string' ? content.text : '';
    if (t === 'execution_output') return typeof content.text === 'string' ? content.text : '';
    if (t === 'multimodal_text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
          return '';
        })
        .join('');
    }
    if (t === 'tether_quote') {
      const bits = [];
      if (typeof content.title === 'string') bits.push(content.title);
      if (typeof content.text === 'string') bits.push(content.text);
      if (typeof content.url === 'string') bits.push(content.url);
      return bits.join('\\\\n');
    }
    return '';
  };

  const extractConversationMessages = (conversation) => {
    const mapping = conversation && conversation.mapping ? conversation.mapping : null;
    const current = conversation && conversation.current_node ? conversation.current_node : null;
    if (!mapping || typeof mapping !== 'object' || !current) return [];

    const chain = [];
    const visited = new Set();
    let nodeId = String(current);
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      chain.push(node);
      const parent = node && node.parent ? String(node.parent) : '';
      nodeId = parent || '';
    }
    chain.reverse();

    const out = [];
    for (const node of chain) {
      const msg = node && node.message ? node.message : null;
      const role = msg && typeof msg.author === 'object' && typeof msg.author.role === 'string' ? msg.author.role : '';
      if (role !== 'user' && role !== 'assistant') continue;
      const content = extractContentText(msg && msg.content ? msg.content : null).replace(/\\r\\n/g, '\\n').trim();
      if (!content) continue;
      const createTime = msg && (msg.create_time || msg.createTime) ? String(msg.create_time || msg.createTime) : null;
      out.push({ role, content, createTime });
    }
    return out;
  };

  const startedAt = Date.now();
  const accessToken = await getAccessToken();
  const accountId = await getTeamAccountId(accessToken);

  const conv = await fetchConversation(conversationId, accessToken, accountId);
  const title = conv && typeof conv.title === 'string' ? conv.title : null;
  const messages = extractConversationMessages(conv);

  const ingestResp = await chrome.runtime.sendMessage({
    type: 'ruminer.ingest.ingestConversation',
    platform: PLATFORM,
    conversationId,
    runId,
    conversationTitle: title,
    conversationUrl: rawUrl,
    messages,
  });

  if (!ingestResp || !ingestResp.ok) {
    const err = ingestResp && ingestResp.error ? String(ingestResp.error) : 'Unknown ingest error';
    throw new Error(err);
  }

  const r = ingestResp.result || {};
  const durationMs = Date.now() - startedAt;
  try {
    await chrome.runtime.sendMessage({
      type: 'ruminer.workflow.notify',
      title: 'ChatGPT – Import Conversation',
      message:
        'upserted ' +
        Number(r.upserted || 0) +
        ', skipped ' +
        Number(r.skipped || 0) +
        ', failed ' +
        Number(r.failed || 0) +
        ' (' +
        durationMs +
        'ms)',
    });
  } catch {}

  return { ok: true, conversationId, ...r, durationMs };
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
      bindings: partial.meta?.bindings?.length ? partial.meta.bindings : CHATGPT_DOMAIN_BINDINGS,
      requiredTools: partial.meta?.requiredTools?.length
        ? partial.meta.requiredTools
        : [...CHATGPT_DEFAULT_REQUIRED_TOOLS],
    },
  };
}

export function createChatgptBuiltinFlows(nowIso: string): FlowV3[] {
  const importAllNodes: NodeV3[] = [
    {
      id: 'n.open_tab',
      kind: 'openTab',
      name: 'Open ChatGPT (background)',
      config: {
        url: 'https://chatgpt.com/',
        active: false,
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.scan',
      kind: 'script',
      name: 'Scan & enqueue (API)',
      config: {
        world: 'ISOLATED',
        code: CHATGPT_SCANNER_SCRIPT,
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
      kind: 'openTab',
      name: 'Open conversation (background)',
      config: {
        url: {
          kind: 'var',
          ref: { name: 'ruminerConversationUrl' },
          default: 'about:blank',
        },
        active: false,
      },
      ui: { x: 0, y: 0 },
    },
    {
      id: 'n.ingest',
      kind: 'script',
      name: 'Ingest conversation (API)',
      config: {
        world: 'ISOLATED',
        code: CHATGPT_INGEST_SCRIPT,
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

  return [
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.scanner.v1',
      name: 'ChatGPT – Import All',
      description:
        'Scans ChatGPT conversations via backend API and enqueues per-conversation ingestion runs.',
      entryNodeId: 'n.open_tab',
      nodes: importAllNodes,
      edges: [
        { id: 'e.open__scan', from: 'n.open_tab', to: 'n.scan' },
        { id: 'e.scan__close', from: 'n.scan', to: 'n.close_tab' },
        { id: 'e.scan__close_on_error', from: 'n.scan', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: {
        tags: ['chatgpt', 'scanner', 'builtin'],
      },
      policy: {
        runTimeoutMs: 600_000,
      },
    }),
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.conversation_ingest.v1',
      name: 'ChatGPT – Import Current Conversation',
      description:
        'Imports a single ChatGPT conversation into EMOS. Sidepanel will use the active tab URL as the conversation URL.',
      entryNodeId: 'n.open_conv',
      nodes: ingestNodes,
      edges: [
        { id: 'e.open__ingest', from: 'n.open_conv', to: 'n.ingest' },
        { id: 'e.ingest__close', from: 'n.ingest', to: 'n.close_tab' },
        { id: 'e.ingest__close_on_error', from: 'n.ingest', to: 'n.close_tab', label: 'onError' },
      ],
      variables: [],
      meta: {
        tags: ['chatgpt', 'ingestor', 'builtin'],
      },
      policy: {
        runTimeoutMs: 300_000,
      },
    }),
  ];
}
