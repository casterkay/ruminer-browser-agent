/* eslint-disable */
// ruminer.claude-scan.js
// Injected into claude.ai pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'claude';
  const VERSION = '2026-03-13.2';
  const LOG = '[ruminer.claude-scan]';

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

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(String(urlString || ''), location.origin);
      const m = String(u.pathname || '').match(/^\/chat\/([^/?#]+)/);
      return m ? String(m[1] || '').trim() : '';
    } catch {
      return '';
    }
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
    const nodes = Array.from(root.querySelectorAll('[data-message-author-role]')).filter(
      (n) => !n.closest('nav, aside, header'),
    );
    if (nodes.length > 0) {
      return nodes
        .map((n) => {
          const roleRaw = String(n.getAttribute('data-message-author-role') || '').toLowerCase();
          const role = roleRaw.includes('assistant')
            ? 'assistant'
            : roleRaw.includes('user')
              ? 'user'
              : null;
          if (!role) return null;
          const content = normalizeContent(n.textContent || '');
          if (!content) return null;
          return { role, content };
        })
        .filter(Boolean);
    }

    const userNodes = Array.from(
      root.querySelectorAll('[data-testid*="user"], [data-testid*="human"]'),
    ).filter((n) => !n.closest('nav, aside, header'));
    const assistantNodes = Array.from(root.querySelectorAll('[data-testid*="assistant"]')).filter(
      (n) => !n.closest('nav, aside, header'),
    );
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
    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };
    await sleep(400);

    const msgs = extractMessagesFromDom();
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
