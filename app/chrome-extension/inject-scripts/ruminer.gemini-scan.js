/* eslint-disable */
// ruminer.gemini-scan.js
// Injected into gemini.google.com pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'gemini';
  const VERSION = '2026-03-13.2';
  const LOG = '[ruminer.gemini-scan]';

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
        out.push({ conversationId: id, conversationUrl: url.toString(), conversationTitle: title });
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

  const findTranscriptScroller = () => {
    const root = document.querySelector('#chat-history');
    if (!root) return document.scrollingElement || document.documentElement;
    let current = root;
    for (let i = 0; i < 20 && current; i++) {
      const parent = current.parentElement;
      if (!parent) break;
      let style;
      try {
        style = getComputedStyle(parent);
      } catch {
        style = null;
      }
      const overflowY = style ? style.overflowY : '';
      const scrollable =
        overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
          ? parent.scrollHeight > parent.clientHeight + 20
          : false;
      if (scrollable) return parent;
      current = parent;
    }
    return document.scrollingElement || document.documentElement;
  };

  const extractConversationMessages = () => {
    const containers = Array.from(
      document.querySelectorAll('#chat-history .conversation-container'),
    );

    const messages = [];
    for (const c of containers) {
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

    return messages;
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
      if (location.pathname === targetPath && document.querySelector('#chat-history')) return;
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
    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };
    await sleep(400);

    // Best-effort: scroll down to materialize virtualized turns before extraction.
    const scroller = findTranscriptScroller();
    let stable = 0;
    for (let i = 0; i < 80; i++) {
      const beforeTop = scroller.scrollTop;
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        scroller.scrollTop + Math.max(240, Math.floor(scroller.clientHeight * 0.9)),
      );
      await sleep(220);
      const afterTop = scroller.scrollTop;
      if (afterTop === beforeTop) stable += 1;
      else stable = 0;
      if (stable >= 5) break;
    }

    const msgs = extractConversationMessages();
    const hashes = [];
    for (const m of msgs) hashes.push(await hashMessage(m.role, m.content));
    const fullDigest = await sha256Hex(stableJson(hashes));

    return {
      conversationId: String(conversationId || '').trim() || parseConversationId(url) || null,
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
