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

const CHATGPT_IMPORT_ALL_SCRIPT = `
return (async () => {
  const PLATFORM = 'chatgpt';
  const LIMIT = 100;
  const MAX_PAGES_PER_RUN = 5;
  const MAX_CONVERSATIONS_PER_RUN = 10;
  const SAFETY_MAX_OFFSET = 1000;
  const MIN_DELAY_MS = 200;
  const MAX_DELAY_MS = 500;

  const STATE_KEY = 'ruminer.chatgpt.import_all.state.v1';
  const DEFAULT_STATE = {
    schemaVersion: 1,
    backfillOffset: 0,
    backfillDone: false,
    lastImportedUpdateTimeById: {},
    lastRunAt: null,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));
  const jitter = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));

  const notify = async (title, message) => {
    try {
      await chrome.runtime.sendMessage({ type: 'ruminer.workflow.notify', title, message });
    } catch {}
  };

  const safeJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const getState = async () => {
    const raw = await chrome.storage.local.get(STATE_KEY);
    const v = raw && raw[STATE_KEY];
    if (!v || typeof v !== 'object' || v.schemaVersion !== 1) return { ...DEFAULT_STATE };
    const s = {
      ...DEFAULT_STATE,
      ...v,
      lastImportedUpdateTimeById:
        v.lastImportedUpdateTimeById && typeof v.lastImportedUpdateTimeById === 'object'
          ? v.lastImportedUpdateTimeById
          : {},
    };
    s.backfillOffset =
      typeof s.backfillOffset === 'number' && Number.isFinite(s.backfillOffset) && s.backfillOffset >= 0
        ? Math.floor(s.backfillOffset)
        : 0;
    s.backfillDone = Boolean(s.backfillDone);
    return s;
  };

  const setState = async (state) => {
    try {
      state.lastRunAt = new Date().toISOString();
      // Prune state map to avoid unbounded growth (keep newest by update_time).
      const map = state.lastImportedUpdateTimeById || {};
      const entries = Object.entries(map)
        .map(([k, v]) => [k, typeof v === 'number' && Number.isFinite(v) ? v : 0])
        .sort((a, b) => b[1] - a[1]);
      const MAX = 5000;
      const pruned = {};
      for (let i = 0; i < entries.length && i < MAX; i++) {
        pruned[entries[i][0]] = entries[i][1];
      }
      state.lastImportedUpdateTimeById = pruned;
      await chrome.storage.local.set({ [STATE_KEY]: state });
    } catch {}
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
    } catch {
      return '';
    }
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const url = new URL('/backend-api/accounts/check/v4-2023-04-27', location.origin).toString();
    const resp = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'X-Authorization': 'Bearer ' + accessToken,
      },
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const payload = await safeJson(resp);
    try {
      const account = payload && payload.accounts && payload.accounts[workspaceId];
      const accountId = account && account.account && account.account.account_id;
      return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null;
    } catch {
      return null;
    }
  };

  const fetchBackendApi = async (path, query, accessToken, accountId) => {
    const url = new URL('/backend-api' + path, location.origin);
    const q = query || {};
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    const headers = {
      Authorization: 'Bearer ' + accessToken,
      'X-Authorization': 'Bearer ' + accessToken,
    };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;

    const resp = await fetch(url.toString(), { headers, credentials: 'include' });
    if (!resp.ok) {
      const body = await safeJson(resp);
      const msg = (body && (body.detail || body.error)) ? String(body.detail || body.error) : '';
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
      return bits.join('\\n');
    }
    return '';
  };

  const extractMessages = (conversation) => {
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
      const role = msg && msg.author && msg.author.role ? String(msg.author.role) : '';
      if (role !== 'user' && role !== 'assistant') continue;

      if (msg && msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true) continue;

      const content = extractContentText(msg && msg.content ? msg.content : null).trim();
      if (!content) continue;

      const createTimeSec = msg && typeof msg.create_time === 'number' ? msg.create_time : null;
      const createTimeIso =
        typeof createTimeSec === 'number' && Number.isFinite(createTimeSec)
          ? new Date(createTimeSec * 1000).toISOString()
          : null;

      out.push({ role, content, createTime: createTimeIso });
    }
    return out;
  };

  const groupId = (conversationId) => PLATFORM + ':' + conversationId;

  const accessToken = await getAccessToken();
  const accountId = await getTeamAccountId(accessToken);

  let state = await getState();
  const isBackfill = !state.backfillDone;
  let offset = isBackfill ? state.backfillOffset : 0;

  let pages = 0;
  let scanned = 0;
  let considered = 0;
  let fetched = 0;
  let convIngested = 0;
  let convSkipped = 0;
  let convFailed = 0;
  let msgIngested = 0;
  let msgUpdated = 0;
  let msgSkipped = 0;
  let msgFailed = 0;
  const convErrors = [];

  const startedAt = Date.now();

  try {
    while (pages < MAX_PAGES_PER_RUN && considered < MAX_CONVERSATIONS_PER_RUN) {
      if (offset >= SAFETY_MAX_OFFSET) break;

      const list = await listConversations(offset, accessToken, accountId);
      const items = list && Array.isArray(list.items) ? list.items : [];
      const total = list && typeof list.total === 'number' ? list.total : null;

      if (items.length === 0) {
        if (isBackfill) {
          state.backfillDone = true;
          state.backfillOffset = 0;
        }
        break;
      }

      scanned += items.length;

      // For items without an update_time cache entry, consult the ingestion ledger (group_id index)
      // so we can skip already-ingested conversations without fetching full details.
      const unknownGroupIds = [];
      for (const it of items) {
        const id = it && typeof it.id === 'string' ? it.id : '';
        if (!id) continue;
        if (!state.lastImportedUpdateTimeById[id]) unknownGroupIds.push(groupId(id));
      }

      let ledgerHas = {};
      if (unknownGroupIds.length > 0) {
        const resp = await chrome.runtime.sendMessage({
          type: 'ruminer.ledger.hasAnyForGroups',
          groupIds: unknownGroupIds,
        });
        if (resp && resp.ok && resp.result && typeof resp.result === 'object') {
          ledgerHas = resp.result;
        }
      }

      const candidates = [];
      for (const it of items) {
        const id = it && typeof it.id === 'string' ? it.id.trim() : '';
        if (!id) continue;

        const updateTime = it && typeof it.update_time === 'number' ? it.update_time : 0;
        const cached = state.lastImportedUpdateTimeById[id] || 0;

        if (cached && updateTime && updateTime <= cached) {
          convSkipped += 1;
          continue;
        }

        if (!cached && ledgerHas[groupId(id)]) {
          // Already ingested at least once; cache update_time to enable fast future skips.
          if (updateTime) state.lastImportedUpdateTimeById[id] = updateTime;
          convSkipped += 1;
          continue;
        }

        candidates.push({
          id,
          title: it && typeof it.title === 'string' ? it.title : null,
          updateTime: updateTime || null,
        });
      }

      // Incremental mode: if the top page has nothing to do, stop early.
      if (!isBackfill && offset === 0 && candidates.length === 0) {
        break;
      }

      for (const c of candidates) {
        if (considered >= MAX_CONVERSATIONS_PER_RUN) break;
        considered += 1;

        try {
          const conv = await fetchConversation(c.id, accessToken, accountId);
          fetched += 1;

          const messages = extractMessages(conv);
          const conversationUrl = 'https://chatgpt.com/c/' + c.id;
          const ingestResp = await chrome.runtime.sendMessage({
            type: 'ruminer.chatgpt.ingestConversation',
            platform: PLATFORM,
            conversationId: c.id,
            conversationTitle:
              c.title || (conv && typeof conv.title === 'string' ? conv.title : null),
            conversationUrl,
            conversationUpdateTime: c.updateTime,
            messages,
          });

          if (!ingestResp || !ingestResp.ok) {
            const err =
              ingestResp && ingestResp.error ? String(ingestResp.error) : 'Unknown ingest error';
            throw new Error(err);
          }

          const r = ingestResp.result || {};
          convIngested += 1;
          msgIngested += typeof r.ingested === 'number' ? r.ingested : 0;
          msgUpdated += typeof r.updated === 'number' ? r.updated : 0;
          msgSkipped += typeof r.skipped === 'number' ? r.skipped : 0;
          msgFailed += typeof r.failed === 'number' ? r.failed : 0;

          if (typeof c.updateTime === 'number' && Number.isFinite(c.updateTime)) {
            state.lastImportedUpdateTimeById[c.id] = c.updateTime;
          }

          await setState(state);
          await sleep(jitter());
        } catch (error) {
          convFailed += 1;
          const msg = error && error.message ? String(error.message) : String(error);
          convErrors.push(c.id + ': ' + msg);

          // Fatal auth/session errors: abort so scheduler retries instead of silently skipping.
          if (
            msg.includes('Not logged in') ||
            msg.includes('missing access token') ||
            msg.includes('(401)') ||
            msg.includes('(403)') ||
            msg.includes('EMOS settings incomplete')
          ) {
            throw error;
          }

          await sleep(jitter());
        }
      }

      offset += items.length;
      pages += 1;

      if (isBackfill) {
        state.backfillOffset = offset;
        if (typeof total === 'number' && offset >= total) {
          state.backfillDone = true;
          state.backfillOffset = 0;
          break;
        }
      } else {
        // Incremental: only ever scan the top N pages per run.
        break;
      }
    }

    if (isBackfill && state.backfillDone === true) {
      // Backfill complete: switch to incremental mode next run.
      state.backfillOffset = 0;
    }

    await setState(state);

    const durationMs = Date.now() - startedAt;
    const mode = isBackfill ? 'Backfill' : 'Incremental';
    await notify(
      'ChatGPT – Import All',
      mode +
        ': scanned ' +
        scanned +
        ', fetched ' +
        fetched +
        ', conv ' +
        convIngested +
        ', conv_failed ' +
        convFailed +
        ', msgs +' +
        (msgIngested + msgUpdated) +
        ', skipped ' +
        msgSkipped +
        ', failed ' +
        msgFailed +
        ' (' +
        durationMs +
        'ms)',
    );

    return {
      ok: true,
      mode: isBackfill ? 'backfill' : 'incremental',
      scanned,
      fetched,
      conversationsIngested: convIngested,
      conversationsSkipped: convSkipped,
      conversationsFailed: convFailed,
      messagesIngested: msgIngested,
      messagesUpdated: msgUpdated,
      messagesSkipped: msgSkipped,
      messagesFailed: msgFailed,
      durationMs,
      backfillOffset: state.backfillOffset,
      backfillDone: state.backfillDone,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error && error.message ? String(error.message) : String(error);
    await notify('ChatGPT – Import All (failed)', message);
    throw error;
  }
})();
`.trim();

const CHATGPT_IMPORT_CURRENT_TAB_SCRIPT = `
return (async () => {
  const url = String(location.href || '');
  if (!url.startsWith('https://chatgpt.com/c/')) {
    try {
      await chrome.runtime.sendMessage({
        type: 'ruminer.workflow.notify',
        title: 'ChatGPT – Import Current Conversation (blocked)',
        message: 'Current tab URL must start with https://chatgpt.com/c/',
      });
    } catch {}
    throw new Error('Current tab URL must start with https://chatgpt.com/c/');
  }

  const m = location.pathname.match(/^\\\\/c\\\\/([^/?#]+)/i);
  const conversationId = m ? String(m[1]) : '';
  if (!conversationId) {
    throw new Error('Failed to parse conversation id from URL');
  }

  const safeJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  const getAccessToken = async () => {
    const sUrl = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetch(sUrl, { credentials: 'include' });
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');
    const payload = await safeJson(resp);
    const token = payload && typeof payload.accessToken === 'string' ? payload.accessToken : '';
    if (!token.trim()) throw new Error('ChatGPT session missing access token');
    return token.trim();
  };

  const getCookie = (key) => {
    try {
      const mm = document.cookie.match('(^|;)\\\\s*' + key + '\\\\s*=\\\\s*([^;]+)');
      return mm ? String(mm.pop() || '') : '';
    } catch {
      return '';
    }
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const aUrl = new URL('/backend-api/accounts/check/v4-2023-04-27', location.origin).toString();
    const resp = await fetch(aUrl, {
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'X-Authorization': 'Bearer ' + accessToken,
      },
      credentials: 'include',
    });
    if (!resp.ok) return null;
    const payload = await safeJson(resp);
    try {
      const account = payload && payload.accounts && payload.accounts[workspaceId];
      const accountId = account && account.account && account.account.account_id;
      return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : null;
    } catch {
      return null;
    }
  };

  const fetchBackendApi = async (path, accessToken, accountId) => {
    const bUrl = new URL('/backend-api' + path, location.origin);
    const headers = {
      Authorization: 'Bearer ' + accessToken,
      'X-Authorization': 'Bearer ' + accessToken,
    };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;
    const resp = await fetch(bUrl.toString(), { headers, credentials: 'include' });
    if (!resp.ok) {
      const body = await safeJson(resp);
      const msg = (body && (body.detail || body.error)) ? String(body.detail || body.error) : '';
      throw new Error('ChatGPT backend API failed (' + resp.status + '): ' + (msg || resp.statusText || 'request failed'));
    }
    return safeJson(resp);
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
      return bits.join('\\n');
    }
    return '';
  };

  const extractMessages = (conversation) => {
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
      const role = msg && msg.author && msg.author.role ? String(msg.author.role) : '';
      if (role !== 'user' && role !== 'assistant') continue;

      if (msg && msg.metadata && msg.metadata.is_visually_hidden_from_conversation === true) continue;

      const content = extractContentText(msg && msg.content ? msg.content : null).trim();
      if (!content) continue;

      const createTimeSec = msg && typeof msg.create_time === 'number' ? msg.create_time : null;
      const createTimeIso =
        typeof createTimeSec === 'number' && Number.isFinite(createTimeSec)
          ? new Date(createTimeSec * 1000).toISOString()
          : null;

      out.push({ role, content, createTime: createTimeIso });
    }
    return out;
  };

  const startedAt = Date.now();

  try {
    const accessToken = await getAccessToken();
    const accountId = await getTeamAccountId(accessToken);
    const conv = await fetchBackendApi('/conversation/' + encodeURIComponent(conversationId), accessToken, accountId);
    const title = conv && typeof conv.title === 'string' ? conv.title : null;
    const messages = extractMessages(conv);

    const ingestResp = await chrome.runtime.sendMessage({
      type: 'ruminer.chatgpt.ingestConversation',
      platform: 'chatgpt',
      conversationId,
      conversationTitle: title,
      conversationUrl: url,
      conversationUpdateTime: null,
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
        title: 'ChatGPT – Import Current Conversation',
        message:
          'msgs +' +
          (Number(r.ingested || 0) + Number(r.updated || 0)) +
          ', skipped ' +
          Number(r.skipped || 0) +
          ', failed ' +
          Number(r.failed || 0) +
          ' (' +
          durationMs +
          'ms)',
      });
    } catch {}

    return {
      ok: true,
      conversationId,
      messagesIngested: Number(r.ingested || 0),
      messagesUpdated: Number(r.updated || 0),
      messagesSkipped: Number(r.skipped || 0),
      messagesFailed: Number(r.failed || 0),
      durationMs,
    };
  } catch (error) {
    const message = error && error.message ? String(error.message) : String(error);
    try {
      await chrome.runtime.sendMessage({
        type: 'ruminer.workflow.notify',
        title: 'ChatGPT – Import Current Conversation (failed)',
        message,
      });
    } catch {}
    throw error;
  }
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
      tags: Array.from(new Set([...(partial.meta?.tags ?? []), 'builtin', 'chatgpt'])),
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
      id: 'n.import_all',
      kind: 'script',
      name: 'Import all (API)',
      config: {
        world: 'ISOLATED',
        code: CHATGPT_IMPORT_ALL_SCRIPT,
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

  const importCurrentTabNodes: NodeV3[] = [
    {
      id: 'n.import_current',
      kind: 'script',
      name: 'Import Current Conversation (API)',
      config: {
        world: 'ISOLATED',
        code: CHATGPT_IMPORT_CURRENT_TAB_SCRIPT,
      },
      ui: { x: 0, y: 0 },
    },
  ];

  return [
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.scanner.v1',
      name: 'ChatGPT – Import All',
      description:
        'Imports ChatGPT conversations via backend API in bounded background batches (no DOM scraping).',
      entryNodeId: 'n.open_tab',
      nodes: importAllNodes,
      edges: [
        { id: 'e.open__import', from: 'n.open_tab', to: 'n.import_all' },
        { id: 'e.import__close', from: 'n.import_all', to: 'n.close_tab' },
        {
          id: 'e.import__close_on_error',
          from: 'n.import_all',
          to: 'n.close_tab',
          label: 'onError',
        },
      ],
      variables: [],
      meta: {
        tags: ['scanner', 'scheduled'],
      },
      policy: {
        runTimeoutMs: 120_000,
      },
    }),
    createBaseFlow(nowIso, {
      id: 'ruminer.chatgpt.conversation_ingest.v1',
      name: 'ChatGPT – Import Current Conversation',
      description:
        'Imports the currently viewed ChatGPT conversation (requires URL https://chatgpt.com/c/...).',
      entryNodeId: 'n.import_current',
      nodes: importCurrentTabNodes,
      edges: [],
      variables: [],
      meta: {
        tags: ['ingest'],
      },
      policy: {
        runTimeoutMs: 60_000,
      },
    }),
  ];
}
