/* eslint-disable */
// ruminer.chatgpt-scan.js
// Injected into ChatGPT pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'chatgpt';
  const VERSION = '2026-03-13.2';
  const LOG = '[ruminer.chatgpt-scan]';

  const existing = window.__RUMINER_SCAN__;
  if (existing && existing.platform === PLATFORM && existing.version === VERSION) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const bytesToHex = (buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  const sha256Hex = async (input) => {
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(String(input || '')));
    return bytesToHex(digest);
  };

  const stableJson = (value) => {
    const seen = new Set();
    const normalize = (v) => {
      if (v === null) return null;
      if (v === undefined) return undefined;
      const t = typeof v;
      if (t === 'string' || t === 'boolean') return v;
      if (t === 'number') return Number.isFinite(v) ? v : null;
      if (t !== 'object') return String(v);
      if (seen.has(v)) throw new Error('stableJson: circular');
      seen.add(v);
      try {
        if (Array.isArray(v)) return v.map((x) => normalize(x));
        const keys = Object.keys(v).sort();
        const out = {};
        for (const k of keys) {
          const nv = normalize(v[k]);
          if (nv === undefined) continue;
          out[k] = nv;
        }
        return out;
      } finally {
        seen.delete(v);
      }
    };
    return JSON.stringify(normalize(value));
  };

  const hashMessage = async (role, content) => {
    return sha256Hex(
      stableJson({
        role: String(role || ''),
        content: normalizeContent(content),
      }),
    );
  };

  const safeJson = async (resp) => {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  };

  const fetchWithTimeout = async (input, init, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.floor(timeoutMs)));
    try {
      return await fetch(input, { ...(init || {}), signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const getCookie = (key) => {
    try {
      const m = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
      return m ? String(m.pop() || '') : '';
    } catch {
      return '';
    }
  };

  const getPageAccessToken = () => {
    try {
      const remixContext = window.__remixContext;
      const token =
        remixContext &&
        remixContext.state &&
        remixContext.state.loaderData &&
        remixContext.state.loaderData.root &&
        remixContext.state.loaderData.root.clientBootstrap &&
        remixContext.state.loaderData.root.clientBootstrap.session &&
        remixContext.state.loaderData.root.clientBootstrap.session.accessToken;
      return typeof token === 'string' && token.trim() ? token.trim() : null;
    } catch {
      return null;
    }
  };

  const getAccessToken = async () => {
    const pageToken = getPageAccessToken();
    if (pageToken) return pageToken;

    const url = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetchWithTimeout(url, { credentials: 'include' }, 15_000);
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');
    const session = await safeJson(resp);
    const token = session && typeof session.accessToken === 'string' ? session.accessToken : '';
    if (!token.trim()) throw new Error('ChatGPT session missing access token');
    return token.trim();
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const url = new URL('/backend-api/accounts/check/v4-2023-04-27', location.origin).toString();
    const resp = await fetchWithTimeout(
      url,
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'X-Authorization': 'Bearer ' + accessToken,
        },
        credentials: 'include',
      },
      20_000,
    );
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
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }

    const headers = {
      Authorization: 'Bearer ' + accessToken,
      'X-Authorization': 'Bearer ' + accessToken,
    };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;

    const resp = await fetchWithTimeout(
      url.toString(),
      { headers, credentials: 'include' },
      30_000,
    );
    if (!resp.ok) {
      const body = await safeJson(resp);
      const msg = body && (body.detail || body.error) ? String(body.detail || body.error) : '';
      throw new Error(
        'ChatGPT backend API failed (' +
          resp.status +
          '): ' +
          (msg || resp.statusText || 'request failed'),
      );
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
      return bits.join('\n');
    }
    if (t === 'image_asset_pointer')
      return typeof content.alt_text === 'string' ? content.alt_text : '';
    if (t === 'refusal') return typeof content.refusal === 'string' ? content.refusal : '';
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
      nodeId = node && node.parent ? String(node.parent) : '';
    }
    chain.reverse();

    const out = [];
    for (const node of chain) {
      const msg = node && node.message ? node.message : null;
      const role = msg && msg.author && typeof msg.author.role === 'string' ? msg.author.role : '';
      if (role !== 'user' && role !== 'assistant') continue;
      const content = normalizeContent(extractContentText(msg && msg.content ? msg.content : null));
      if (!content) continue;
      out.push({ role, content });
    }
    return out;
  };

  async function listConversations({ offset, limit }) {
    const LIMIT = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 100;
    const OFF = typeof offset === 'number' && Number.isFinite(offset) ? Math.floor(offset) : 0;

    const accessToken = await getAccessToken();
    const accountId = await getTeamAccountId(accessToken);
    const payload = await fetchBackendApi(
      '/conversations',
      { offset: OFF, limit: LIMIT, order: 'updated' },
      accessToken,
      accountId,
    );

    const items = payload && Array.isArray(payload.items) ? payload.items : [];
    const out = items
      .map((it) => {
        const id = String(it && it.id ? it.id : '').trim();
        if (!id) return null;
        const title = typeof it.title === 'string' && it.title.trim() ? it.title.trim() : null;
        const url = new URL('/c/' + id, location.origin).toString();
        return { conversationId: id, conversationUrl: url, conversationTitle: title };
      })
      .filter(Boolean);

    const nextOffset = out.length > 0 ? OFF + out.length : null;
    return { items: out, nextOffset };
  }

  async function getConversationMessageHashes({ conversationId, conversationUrl, includeHashes }) {
    const id = String(conversationId || '').trim();
    if (!id) throw new Error('Missing conversationId');
    const INCLUDE = includeHashes === true;

    const accessToken = await getAccessToken();
    const accountId = await getTeamAccountId(accessToken);
    const conv = await fetchBackendApi(
      '/conversation/' + encodeURIComponent(id),
      {},
      accessToken,
      accountId,
    );
    const msgs = extractConversationMessages(conv);
    const hashes = [];
    for (const m of msgs) hashes.push(await hashMessage(m.role, m.content));
    const fullDigest = await sha256Hex(stableJson(hashes));
    return {
      conversationId: id,
      messageCount: hashes.length,
      fullDigest,
      ...(INCLUDE ? { messageHashes: hashes } : {}),
      conversationUrl: String(conversationUrl || '') || null,
    };
  }

  window.__RUMINER_SCAN__ = {
    platform: PLATFORM,
    version: VERSION,
    listConversations,
    getConversationMessageHashes,
  };

  try {
    console.debug(LOG, 'loaded');
  } catch {}
})();
