/* eslint-disable */
// ruminer.chatgpt-ingest.js
// Injected into ChatGPT pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'chatgpt';
  const VERSION = '2026-03-14.1';
  const LOG = '[ruminer.chatgpt-ingest]';

  const existing = window.__RUMINER_INGEST__;
  const sameApi = existing && existing.platform === PLATFORM && existing.version === VERSION;

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(String(urlString || ''));
      const pathname = String(u.pathname || '');
      return pathname.split('/').filter(Boolean).pop() || null;
    } catch {
      return null;
    }
  };

  const installRpc = () => {
    const rpc = window.__RUMINER_INGEST_RPC__;
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION) return;
    window.__RUMINER_INGEST_RPC__ = { platform: PLATFORM, version: VERSION };

    try {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        try {
          if (!request || typeof request.action !== 'string') return false;

          if (request.action === 'ruminer_ingest_ping') {
            sendResponse({
              ok: true,
              platform: PLATFORM,
              version: VERSION,
              href: String(location.href || ''),
            });
            return false;
          }

          if (request.action === 'ruminer_ingest_probe') {
            const api = window.__RUMINER_INGEST__;
            sendResponse({
              ok: true,
              platform: PLATFORM,
              version: VERSION,
              href: String(location.href || ''),
              hasApi: Boolean(api),
              apiPlatform: api && typeof api === 'object' ? String(api.platform || '') : '',
              apiVersion: api && typeof api === 'object' ? String(api.version || '') : '',
              keys: api && typeof api === 'object' ? Object.keys(api).slice(0, 30) : [],
            });
            return false;
          }

          const api = window.__RUMINER_INGEST__;
          if (!api) {
            sendResponse({ ok: false, error: '__RUMINER_INGEST__ not found on window' });
            return false;
          }
          if (api.platform !== PLATFORM) {
            sendResponse({
              ok: false,
              error: `__RUMINER_INGEST__ platform mismatch (expected=${PLATFORM}, got=${String(api.platform || '')}, version=${String(api.version || '')})`,
            });
            return false;
          }

          if (request.action === 'ruminer_ingest_extractConversation') {
            const conversationUrl = request?.payload?.conversationUrl ?? null;
            Promise.resolve()
              .then(() => api.extractConversation({ conversationUrl }))
              .then((value) => {
                if (value === undefined || value === null) {
                  sendResponse({
                    ok: false,
                    error: '__RUMINER_INGEST__.extractConversation returned no value',
                  });
                  return;
                }
                sendResponse({ ok: true, value });
              })
              .catch((e) =>
                sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
              );
            return true;
          }
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
          return false;
        }
        return false;
      });
    } catch {}
  };

  installRpc();
  if (sameApi) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.floor(ms || 0))));

  const readJsonOrThrow = async (resp) => {
    const ct = String(resp?.headers?.get?.('content-type') || '');
    const text = await resp.text().catch(() => '');
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      const snippet = text ? String(text).slice(0, 240) : '';
      throw new Error(
        `Invalid JSON response (status=${resp?.status || 0}, content-type=${ct || 'unknown'}): ${snippet}`,
      );
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

  const isRetryableStatus = (status) =>
    status === 408 || status === 429 || (status >= 500 && status <= 599);

  const isRetryableFetchError = (e) => {
    const msg = e instanceof Error ? e.message : String(e || '');
    return (
      e instanceof TypeError ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed') ||
      msg.includes('The network connection was lost') ||
      msg.includes('AbortError')
    );
  };

  const fetchWithRetry = async (input, init, timeoutMs, opts) => {
    const attempts = Math.max(1, Math.min(5, Math.floor(opts?.attempts ?? 3)));
    const baseDelayMs = Math.max(100, Math.min(5_000, Math.floor(opts?.baseDelayMs ?? 300)));

    let lastErr = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const resp = await fetchWithTimeout(input, init, timeoutMs);
        if (!resp || typeof resp.status !== 'number') return resp;
        if (!isRetryableStatus(resp.status)) return resp;

        const ra = Number(resp.headers?.get?.('retry-after') || '');
        const retryAfterMs = Number.isFinite(ra) ? Math.max(0, Math.floor(ra * 1000)) : 0;
        const jitter = Math.floor(Math.random() * 120);
        const backoff = Math.floor(baseDelayMs * Math.pow(2, attempt - 1));
        const delay = Math.min(30_000, Math.max(retryAfterMs, backoff + jitter));
        if (attempt < attempts) {
          await sleep(delay);
          continue;
        }
        return resp;
      } catch (e) {
        lastErr = e;
        if (!isRetryableFetchError(e) || attempt >= attempts) throw e;
        const jitter = Math.floor(Math.random() * 120);
        const backoff = Math.floor(baseDelayMs * Math.pow(2, attempt - 1));
        await sleep(Math.min(30_000, backoff + jitter));
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr || 'fetchWithRetry failed'));
  };

  const getCookie = (key) => {
    try {
      const m = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
      return m ? String(m.pop() || '') : '';
    } catch {
      return '';
    }
  };

  const AUTH_CACHE_TTL_MS = 60_000;
  const authCache = {
    token: { value: null, at: 0, promise: null },
    account: { workspaceId: '', value: null, at: 0, promise: null },
  };

  const clearAuthCache = () => {
    authCache.token.value = null;
    authCache.token.at = 0;
    authCache.token.promise = null;
    authCache.account.workspaceId = '';
    authCache.account.value = null;
    authCache.account.at = 0;
    authCache.account.promise = null;
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
    for (let attempt = 1; attempt <= 2; attempt++) {
      const resp = await fetchWithRetry(sessionUrl, { credentials: 'include' }, 15_000, {
        attempts: 3,
        baseDelayMs: 250,
      });
      if (!resp.ok) throw new Error('Not logged in to ChatGPT');
      try {
        const payload = await readJsonOrThrow(resp);
        const token = payload && typeof payload.accessToken === 'string' ? payload.accessToken : '';
        if (!token.trim()) throw new Error('ChatGPT session missing access token');
        return token.trim();
      } catch (e) {
        if (attempt >= 2) throw e;
        await sleep(400 + Math.floor(Math.random() * 120));
      }
    }
    throw new Error('ChatGPT session missing access token');
  };

  const getAccessTokenCached = async () => {
    const now = Date.now();
    if (authCache.token.value && now - authCache.token.at < AUTH_CACHE_TTL_MS)
      return authCache.token.value;
    if (authCache.token.promise) return authCache.token.promise;
    authCache.token.promise = Promise.resolve()
      .then(() => getAccessToken())
      .then((token) => {
        authCache.token.value = token;
        authCache.token.at = Date.now();
        return token;
      })
      .finally(() => {
        authCache.token.promise = null;
      });
    return authCache.token.promise;
  };

  const getTeamAccountId = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const checkUrl = new URL(
      '/backend-api/accounts/check/v4-2023-04-27',
      location.origin,
    ).toString();
    const resp = await fetchWithRetry(
      checkUrl,
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'X-Authorization': 'Bearer ' + accessToken,
        },
        credentials: 'include',
      },
      20_000,
      { attempts: 3, baseDelayMs: 300 },
    );
    if (!resp.ok) return null;
    const payload = await readJsonOrThrow(resp);
    try {
      const account = payload && payload.accounts && payload.accounts[workspaceId];
      const aid = account && account.account && account.account.account_id;
      return typeof aid === 'string' && aid.trim() ? aid.trim() : null;
    } catch {
      return null;
    }
  };

  const getTeamAccountIdCached = async (accessToken) => {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;
    const now = Date.now();
    if (
      authCache.account.workspaceId === workspaceId &&
      now - authCache.account.at < AUTH_CACHE_TTL_MS
    ) {
      return authCache.account.value;
    }
    if (authCache.account.promise && authCache.account.workspaceId === workspaceId) {
      return authCache.account.promise;
    }
    authCache.account.workspaceId = workspaceId;
    authCache.account.promise = Promise.resolve()
      .then(() => getTeamAccountId(accessToken))
      .then((accountId) => {
        authCache.account.value = accountId;
        authCache.account.at = Date.now();
        return accountId;
      })
      .finally(() => {
        authCache.account.promise = null;
      });
    return authCache.account.promise;
  };

  const getAuthContext = async () => {
    const accessToken = await getAccessTokenCached();
    const accountId = await getTeamAccountIdCached(accessToken);
    return { accessToken, accountId };
  };

  const fetchBackendApi = async (path, query, accessToken, accountId, opts) => {
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

    const resp = await fetchWithRetry(url.toString(), { headers, credentials: 'include' }, 30_000, {
      attempts: 3,
      baseDelayMs: 350,
    });
    if ((resp.status === 401 || resp.status === 403) && opts?.retryAuthOnce === true) {
      clearAuthCache();
      const ctx = await getAuthContext();
      return fetchBackendApi(path, query, ctx.accessToken, ctx.accountId, { retryAuthOnce: false });
    }
    if (!resp.ok) {
      let msg = '';
      try {
        const body = await readJsonOrThrow(resp);
        msg = body && (body.detail || body.error) ? String(body.detail || body.error) : '';
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
      throw new Error(
        'ChatGPT backend API failed (' +
          resp.status +
          '): ' +
          (msg || resp.statusText || 'request failed'),
      );
    }
    try {
      return await readJsonOrThrow(resp);
    } catch (e) {
      if (opts?.retryParseOnce === true) {
        await sleep(500 + Math.floor(Math.random() * 180));
        const resp2 = await fetchWithRetry(
          url.toString(),
          { headers, credentials: 'include' },
          30_000,
          { attempts: 2, baseDelayMs: 450 },
        );
        if (!resp2.ok) throw e;
        return readJsonOrThrow(resp2);
      }
      throw e;
    }
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

  async function extractConversation({ conversationUrl }) {
    const rawUrl = String(conversationUrl || location.href || '').trim();
    if (!rawUrl) throw new Error('Missing conversation URL');
    const conversationId = parseConversationId(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    const { accessToken, accountId } = await getAuthContext();
    const conv = await fetchBackendApi(
      '/conversation/' + encodeURIComponent(conversationId),
      {},
      accessToken,
      accountId,
      { retryAuthOnce: true, retryParseOnce: true },
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
