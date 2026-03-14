/* eslint-disable */
// ruminer.claude-scan.js
// Injected into claude.ai pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'claude';
  const VERSION = '2026-03-13.7';
  const LOG = '[ruminer.claude-scan]';

  const existing = window.__RUMINER_SCAN__;
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
    const rpc = window.__RUMINER_SCAN_RPC__;
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION) return;
    window.__RUMINER_SCAN_RPC__ = { platform: PLATFORM, version: VERSION };

    try {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        try {
          if (!request || typeof request.action !== 'string') return false;

          if (request.action === 'ruminer_scan_ping') {
            sendResponse({
              ok: true,
              platform: PLATFORM,
              version: VERSION,
              href: String(location.href || ''),
            });
            return false;
          }

          if (request.action === 'ruminer_scan_probe') {
            const api = window.__RUMINER_SCAN__;
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

          const api = window.__RUMINER_SCAN__;
          if (!api) {
            sendResponse({ ok: false, error: '__RUMINER_SCAN__ not found on window' });
            return false;
          }
          if (api.platform !== PLATFORM) {
            sendResponse({
              ok: false,
              error: `__RUMINER_SCAN__ platform mismatch (expected=${PLATFORM}, got=${String(api.platform || '')})`,
            });
            return false;
          }

          if (request.action === 'ruminer_scan_listConversations') {
            const offset = Number(request?.payload?.offset || 0);
            const limit = Number(request?.payload?.limit || 100);
            Promise.resolve()
              .then(() => api.listConversations({ offset, limit }))
              .then((value) => {
                if (
                  value &&
                  typeof value === 'object' &&
                  value.ok === false &&
                  typeof value.error === 'string'
                ) {
                  sendResponse({
                    ok: false,
                    error: String(value.error || 'listConversations failed'),
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

          if (request.action === 'ruminer_scan_getConversationMessageHashes') {
            const conversationId = String(request?.payload?.conversationId || '');
            const conversationUrl = String(request?.payload?.conversationUrl || '');
            Promise.resolve()
              .then(() =>
                api.getConversationMessageHashes({
                  conversationId,
                  conversationUrl,
                }),
              )
              .then((value) => {
                if (
                  value &&
                  typeof value === 'object' &&
                  value.ok === false &&
                  typeof value.error === 'string'
                ) {
                  sendResponse({
                    ok: false,
                    error: String(value.error || 'getConversationMessageHashes failed'),
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

  const normalizeRole = (raw) => {
    const roleRaw = String(raw || '').toLowerCase();
    if (!roleRaw) return null;
    if (roleRaw.includes('assistant') || roleRaw.includes('ai') || roleRaw.includes('bot'))
      return 'assistant';
    if (roleRaw.includes('user') || roleRaw.includes('human') || roleRaw.includes('you'))
      return 'user';
    return null;
  };

  const fetchJson = async (url) => {
    const readCookieValue = (name) => {
      try {
        const cookie = String(document.cookie || '');
        const m = cookie.match(new RegExp(`(?:^|;\\\\s*)${name}=([^;]*)`));
        return m ? decodeURIComponent(m[1] || '') : '';
      } catch {
        return '';
      }
    };

    const csrfFromMeta = () => {
      try {
        const meta =
          document.querySelector('meta[name="csrf-token"]') ||
          document.querySelector('meta[name="csrfToken"]') ||
          document.querySelector('meta[name="xsrf-token"]') ||
          document.querySelector('meta[name="XSRF-TOKEN"]');
        const v = meta && typeof meta.content === 'string' ? meta.content.trim() : '';
        return v;
      } catch {
        return '';
      }
    };

    const csrfToken =
      csrfFromMeta() ||
      readCookieValue('csrfToken') ||
      readCookieValue('csrf_token') ||
      readCookieValue('XSRF-TOKEN') ||
      '';

    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.json();
  };

  const pickOrgIds = (data) => {
    const arr = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray(data.organizations)
        ? data.organizations
        : null;
    if (!arr || arr.length === 0) return [];
    const ids = [];
    for (const it of arr) {
      const id = it && (it.uuid || it.id);
      const s = id ? String(id).trim() : '';
      if (s) ids.push(s);
    }
    return Array.from(new Set(ids));
  };

  const fetchOrganizationIds = async () => {
    const data = await fetchJson('/api/organizations');
    return pickOrgIds(data);
  };

  const extractTextFromMessage = (msg) => {
    if (!msg || typeof msg !== 'object') return '';
    const parts = [];

    const content = msg.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        if (typeof c.text === 'string' && c.text.trim()) parts.push(c.text);
        else if (c.type === 'text' && typeof c.content === 'string' && c.content.trim())
          parts.push(c.content);
      }
    }

    if (parts.length === 0) {
      if (typeof msg.text === 'string' && msg.text.trim()) parts.push(msg.text);
      else if (typeof msg.message === 'string' && msg.message.trim()) parts.push(msg.message);
    }

    return normalizeContent(parts.join('\n'));
  };

  const getCurrentBranchMessages = (conversation) => {
    const msgs =
      conversation && Array.isArray(conversation.chat_messages) ? conversation.chat_messages : [];
    const leaf =
      conversation && conversation.current_leaf_message_uuid
        ? String(conversation.current_leaf_message_uuid)
        : '';
    if (!leaf || msgs.length === 0) return [];

    const byId = new Map();
    for (const m of msgs) {
      if (m && (m.uuid || m.id)) byId.set(String(m.uuid || m.id), m);
    }

    const chain = [];
    let cur = leaf;
    for (let i = 0; i < 20_000 && cur; i++) {
      const m = byId.get(cur);
      if (!m) break;
      chain.push(m);
      cur = m.parent_message_uuid ? String(m.parent_message_uuid) : '';
    }
    chain.reverse();
    return chain;
  };

  const fetchConversationViaApi = async ({ conversationId }) => {
    const orgIds = await fetchOrganizationIds();
    if (!orgIds || orgIds.length === 0)
      throw new Error('Failed to resolve Claude organization ids');

    let lastErr = '';
    for (const orgId of orgIds) {
      const url = `/api/organizations/${encodeURIComponent(
        orgId,
      )}/chat_conversations/${encodeURIComponent(
        conversationId,
      )}?tree=True&rendering_mode=messages&render_all_tools=true`;
      try {
        return await fetchJson(url);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        if (String(msg || '').includes('HTTP 403')) continue;
      }
    }
    throw new Error(lastErr ? `Claude API fetch failed: ${lastErr}` : 'Claude API fetch failed');
  };

  const findSidebarScroller = () => {
    const candidates = ['nav', 'aside', '[data-testid*="sidebar"]', '[aria-label*="History"]'];
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
        if (!href.includes('/chat/')) continue;
        let url;
        try {
          url = new URL(href, location.origin);
        } catch {
          continue;
        }
        if (url.hostname !== location.hostname) continue;
        const id = parseConversationId(url.toString());
        if (!id) continue;
        if (seen.has(id)) continue;
        const title = String(a.textContent || '').trim() || null;
        seen.add(id);
        out.push({
          conversationId: id,
          conversationUrl: url.toString(),
          conversationTitle: title,
        });
      }

      if (out.length === lastCount) stable += 1;
      else stable = 0;
      lastCount = out.length;

      if (stable >= 5) break;
      if (scroller) {
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          scroller.scrollTop + Math.max(200, Math.floor(scroller.clientHeight * 0.8)),
        );
      }
      await sleep(200);
    }

    return out;
  };

  const extractMessagesFromDom = () => {
    const root = document.querySelector('main') || document.body;
    const isInTranscript = (node) => {
      if (!node || typeof node.closest !== 'function') return false;
      if (
        node.closest(
          'nav, aside, header, footer, form, textarea, input, [contenteditable="true"], [role="textbox"], [data-testid*="composer"], [data-testid*="chat-input"], [data-testid*="model"], [aria-label*="Model"], [aria-label*="model"], button, [role="button"], [role="combobox"], [role="listbox"]',
        )
      )
        return false;
      return true;
    };
    const nodes = Array.from(root.querySelectorAll('[data-message-author-role]')).filter((n) =>
      isInTranscript(n),
    );
    if (nodes.length > 0) {
      return nodes
        .map((n) => {
          const role = normalizeRole(n.getAttribute('data-message-author-role'));
          if (!role) return null;
          const content = normalizeContent(n.textContent || '');
          if (!content) return null;
          return { role, content };
        })
        .filter(Boolean);
    }

    const userNodes = Array.from(
      root.querySelectorAll('[data-testid*="user"], [data-testid*="human"], [data-testid*="you"]'),
    ).filter((n) => isInTranscript(n));
    const assistantNodes = Array.from(
      root.querySelectorAll(
        '[data-testid*="assistant"], [data-testid*="ai"], [data-testid*="bot"]',
      ),
    ).filter((n) => isInTranscript(n));
    const all = [];
    for (const n of userNodes) all.push({ node: n, role: 'user' });
    for (const n of assistantNodes) all.push({ node: n, role: 'assistant' });
    all.sort((a, b) =>
      a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return all
      .map((x) => ({ role: x.role, content: normalizeContent(x.node.textContent || '') }))
      .filter((m) => m.content);
  };

  const openConversationInPlace = async (url) => {
    const targetPath = new URL(url, location.origin).pathname;
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const a = anchors.find((x) => {
      try {
        const u = new URL(String(x.getAttribute('href') || ''), location.origin);
        return u.pathname === targetPath;
      } catch {
        return false;
      }
    });
    if (a) {
      a.click();
    } else {
      location.assign(url);
      return false;
    }

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (location.pathname === targetPath) return;
      await sleep(200);
    }
    return true;
  };

  let cachedConversations = null;
  async function ensureCache() {
    if (cachedConversations) return;
    cachedConversations = await collectSidebarConversations();
  }

  async function listConversations({ offset, limit }) {
    const OFF = typeof offset === 'number' && Number.isFinite(offset) ? Math.floor(offset) : 0;
    const LIM = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 100;
    await ensureCache();
    const all = Array.isArray(cachedConversations) ? cachedConversations : [];
    const slice = all.slice(OFF, OFF + LIM);
    const nextOffset = OFF + slice.length < all.length ? OFF + slice.length : null;
    return { items: slice, nextOffset };
  }

  async function getConversationMessageHashes({ conversationId, conversationUrl, includeHashes }) {
    const url = String(conversationUrl || '').trim();
    if (!url) throw new Error('Missing conversationUrl');
    const INCLUDE = includeHashes === true;
    const convId = String(conversationId || '').trim() || parseConversationId(url) || '';

    if (convId) {
      try {
        const conv = await fetchConversationViaApi({ conversationId: convId });
        const branch = getCurrentBranchMessages(conv);
        const hashes = [];
        for (const m of branch) {
          const sender = m && typeof m.sender === 'string' ? m.sender : '';
          if (!sender) continue;
          if (sender === 'system') continue;
          const role = sender === 'human' ? 'user' : 'assistant';
          const content = extractTextFromMessage(m);
          if (!content) continue;
          hashes.push(await hashMessage(role, content));
        }
        const fullDigest = await sha256Hex(stableJson(hashes));
        return {
          conversationId: convId,
          messageCount: hashes.length,
          fullDigest,
          ...(INCLUDE ? { messageHashes: hashes } : {}),
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          console.debug(LOG, 'api hashes failed; falling back to DOM', {
            conversationId: convId,
            error: msg,
          });
        } catch {}
      }
    }

    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };
    await sleep(400);

    const msgs = extractMessagesFromDom();
    const hashes = [];
    for (const m of msgs) hashes.push(await hashMessage(m.role, m.content));
    const fullDigest = await sha256Hex(stableJson(hashes));
    return {
      conversationId: convId || parseConversationId(url) || null,
      messageCount: hashes.length,
      fullDigest,
      ...(INCLUDE ? { messageHashes: hashes } : {}),
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
