/* eslint-disable */
// ruminer.chatgpt-ingest.js
// Injected into ChatGPT pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'chatgpt';
  const VERSION = '2026-03-13.2';
  const LOG = '[ruminer.chatgpt-ingest]';

  const existing = window.__RUMINER_INGEST__;
  if (existing && existing.platform === PLATFORM && existing.version === VERSION) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

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

    const sessionUrl = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetchWithTimeout(sessionUrl, { credentials: 'include' }, 15_000);
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');
    const payload = await safeJson(resp);
    const token = payload && typeof payload.accessToken === 'string' ? payload.accessToken : '';
    if (!token.trim()) throw new Error('ChatGPT session missing access token');
    return token.trim();
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const checkUrl = new URL(
      '/backend-api/accounts/check/v4-2023-04-27',
      location.origin,
    ).toString();
    const resp = await fetchWithTimeout(
      checkUrl,
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
      const aid = account && account.account && account.account.account_id;
      return typeof aid === 'string' && aid.trim() ? aid.trim() : null;
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
      chain.push({ nodeId, node });
      nodeId = node && node.parent ? String(node.parent) : '';
    }
    chain.reverse();

    const out = [];
    for (const item of chain) {
      const msg = item && item.node && item.node.message ? item.node.message : null;
      const role = msg && msg.author && typeof msg.author.role === 'string' ? msg.author.role : '';
      if (role !== 'user' && role !== 'assistant') continue;
      const content = normalizeContent(extractContentText(msg && msg.content ? msg.content : null));
      if (!content) continue;
      const ct =
        msg && (msg.create_time ?? msg.createTime) != null
          ? String(msg.create_time ?? msg.createTime)
          : null;
      out.push({ role, content, createTime: ct, messageId: String(item.nodeId || '').trim() });
    }
    return out;
  };

  const parseConversationIdFromUrl = (rawUrl) => {
    try {
      const url = new URL(String(rawUrl || ''), location.origin);
      const segments = String(url.pathname || '')
        .split('/')
        .filter(Boolean);
      const markerIdx = segments.findIndex((s) => s === 'c' || s === 'chat');
      if (markerIdx >= 0 && markerIdx + 1 < segments.length) {
        return String(segments[markerIdx + 1] || '').trim();
      }
      return '';
    } catch {
      return '';
    }
  };

  async function extractConversation({ conversationUrl }) {
    const rawUrl = String(conversationUrl || location.href || '').trim();
    if (!rawUrl) throw new Error('Missing conversation URL');
    const conversationId = parseConversationIdFromUrl(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    const accessToken = await getAccessToken();
    const accountId = await getTeamAccountId(accessToken);
    const conv = await fetchBackendApi(
      '/conversation/' + encodeURIComponent(conversationId),
      {},
      accessToken,
      accountId,
    );

    const messages = extractConversationMessages(conv);
    const title =
      conv && typeof conv.title === 'string' && conv.title.trim() ? conv.title.trim() : null;

    return {
      conversationId,
      conversationTitle: title,
      conversationUrl: rawUrl,
      messages,
    };
  }

  window.__RUMINER_INGEST__ = {
    platform: PLATFORM,
    version: VERSION,
    extractConversation,
  };

  try {
    console.debug(LOG, 'loaded');
  } catch {}
})();
