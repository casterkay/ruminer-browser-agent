/* eslint-disable */
// ruminer.grok.js
// Injected into grok.com (and x.com/i/grok) pages (ISOLATED world). Exposes `window.__RUMINER_PLATFORM__`.

(() => {
  const PLATFORM = 'grok';
  const VERSION = '2026-03-24.1';
  const LOG = '[ruminer.grok]';

  const existing = window.__RUMINER_PLATFORM__;
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
    const rpc = window.__RUMINER_PLATFORM_RPC__;
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION && rpc.installed === true)
      return;

    // Avoid accumulating duplicate listeners across reinjection / version bumps.
    try {
      if (rpc && typeof rpc.listener === 'function')
        chrome.runtime.onMessage.removeListener(rpc.listener);
    } catch {}

    const nextRpc = { platform: PLATFORM, version: VERSION, installed: false, listener: null };
    window.__RUMINER_PLATFORM_RPC__ = nextRpc;

    try {
      const listener = (request, _sender, sendResponse) => {
        try {
          if (!request || typeof request.action !== 'string') return false;

          if (request.action === 'ruminer_platform_ping') {
            sendResponse({
              ok: true,
              platform: PLATFORM,
              version: VERSION,
              href: String(location.href || ''),
            });
            return false;
          }

          if (request.action === 'ruminer_platform_probe') {
            const api = window.__RUMINER_PLATFORM__;
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

          const api = window.__RUMINER_PLATFORM__;
          if (!api) {
            sendResponse({ ok: false, error: '__RUMINER_PLATFORM__ not found on window' });
            return false;
          }
          if (api.platform !== PLATFORM) {
            sendResponse({
              ok: false,
              error: `__RUMINER_PLATFORM__ platform mismatch (expected=${PLATFORM}, got=${String(api.platform || '')})`,
            });
            return false;
          }

          if (request.action === 'ruminer_platform_listConversationsPage') {
            const offset = Number(request?.payload?.offset || 0);
            const limit = Number(request?.payload?.limit || 100);
            Promise.resolve()
              .then(() => api.listConversationsPage({ offset, limit }))
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

          if (request.action === 'ruminer_platform_extractConversation') {
            const conversationUrl = String(request?.payload?.conversationUrl || '');
            Promise.resolve()
              .then(() => api.extractConversation({ conversationUrl }))
              .then((value) => {
                if (
                  value &&
                  typeof value === 'object' &&
                  value.ok === false &&
                  typeof value.error === 'string'
                ) {
                  sendResponse({
                    ok: false,
                    error: String(value.error || 'getConversationMessages failed'),
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
      };

      chrome.runtime.onMessage.addListener(listener);
      nextRpc.listener = listener;
      nextRpc.installed = true;
    } catch {}
  };

  installRpc();
  if (sameApi) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

  const clickFirstMatching = (selectors) => {
    const list = Array.isArray(selectors) ? selectors.filter(Boolean) : [];
    for (const sel of list) {
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch {
        el = null;
      }
      if (!el) continue;
      try {
        const disabled =
          el.hasAttribute?.('disabled') ||
          el.getAttribute?.('aria-disabled') === 'true' ||
          (typeof el.disabled === 'boolean' && el.disabled === true);
        if (disabled) continue;
      } catch {}
      try {
        if (typeof el.click === 'function') {
          el.click();
          return true;
        }
      } catch {}
    }
    return false;
  };

  const compareDomOrder = (a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };

  const findSidebarScroller = () => {
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const selectors = ['nav', 'aside', '[aria-label*="sidebar"]', '[class*="sidebar"]'];

    const strict =
      engine && typeof engine.findFirstScroller === 'function'
        ? engine.findFirstScroller(selectors)
        : null;
    if (strict) return strict;

    // Fallback: use document scroller.
    return document.scrollingElement || document.documentElement;
  };

  const ensureSidebarVisible = async () => {
    try {
      const ready = findSidebarScroller();
      if (ready) return true;
    } catch {}

    // Best-effort: hamburger / sidebar toggle.
    clickFirstMatching([
      '[aria-label*="Open sidebar"]',
      '[aria-label*="open sidebar"]',
      '[data-testid*="sidebar"]',
      'button[aria-label*="Menu"]',
    ]);

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        const ready = findSidebarScroller();
        if (ready) return true;
      } catch {}
      await sleep(250);
    }
    return false;
  };

  const findTranscriptScroller = () => {
    // Grok is usually full-page scroll; keep this conservative.
    return document.scrollingElement || document.documentElement;
  };

  const isProbablyInTranscript = (node) => {
    if (!node || typeof node.closest !== 'function') return false;
    if (
      node.closest(
        'nav, aside, header, footer, form, textarea, input, [contenteditable="true"], [role="textbox"], button, [role="button"], [role="combobox"], [role="listbox"]',
      )
    )
      return false;
    return true;
  };

  const hasClassSubstring = (el, sub) => {
    try {
      return String(el?.className || '').includes(sub);
    } catch {
      return false;
    }
  };

  const queryHasClassSubstring = (el, sub) => {
    if (!el || typeof el.querySelector !== 'function') return false;
    try {
      return Boolean(el.querySelector(`[class*="${sub}"]`));
    } catch {
      return false;
    }
  };

  const detectRole = (element, text, index) => {
    let grokScore = 0;
    let humanScore = 0;

    if (
      hasClassSubstring(element, 'bg-surface-l1') ||
      queryHasClassSubstring(element, 'bg-surface-l1')
    )
      humanScore += 5;
    if (hasClassSubstring(element, 'max-w-none') && !hasClassSubstring(element, 'bg-surface-l1'))
      grokScore += 4;

    if (hasClassSubstring(element, 'justify-end') || hasClassSubstring(element, 'ml-auto'))
      humanScore += 2;
    if (hasClassSubstring(element, 'justify-start') || hasClassSubstring(element, 'mr-auto'))
      grokScore += 1;

    if (text.length > 400) grokScore += 3;
    else if (text.length > 200) grokScore += 2;
    else if (text.length < 60) humanScore += 1;

    if (/```/.test(text) || /\n\n/.test(text)) grokScore += 1;
    if (/\?$/.test(text) && text.length < 180) humanScore += 2;
    if (/^(hi|hello|hey|can you|could you|please|help)\b/i.test(text)) humanScore += 2;
    if (/^(here's|let me|i can|i'll|certainly|absolutely|based on|according to)\b/i.test(text))
      grokScore += 2;

    if (grokScore >= humanScore + 2) return 'assistant';
    if (humanScore >= grokScore + 1) return 'user';
    return index % 2 === 0 ? 'user' : 'assistant';
  };

  const removeUnwantedNodes = (root) => {
    try {
      const unwanted = root.querySelectorAll(
        'svg, button, input, select, nav, header, footer, script, style, [aria-hidden="true"], [class*="icon"], [class*="button"], .action-buttons',
      );
      unwanted.forEach((el) => el.remove());
    } catch {}
  };

  const selectMessageElements = () => {
    const strategies = [
      () => Array.from(document.querySelectorAll('.message-bubble')),
      () =>
        Array.from(document.querySelectorAll('.response-content-markdown')).map(
          (el) => el.closest('.message-bubble') || el,
        ),
      () => Array.from(document.querySelectorAll('div[class*="css-146c3p1"]')),
      () =>
        Array.from(document.querySelectorAll('main div[dir="ltr"], div[dir="ltr"]')).filter(
          (div) => {
            const text = String(div.textContent || '').trim();
            return text.length > 10 && text.length < 80_000;
          },
        ),
    ];

    for (const fn of strategies) {
      try {
        const els = fn()
          .filter(Boolean)
          .filter((el) => isProbablyInTranscript(el));
        if (els.length > 0) return els;
      } catch {}
    }

    return [];
  };

  const extractMessagesFromDom = () => {
    const elements = selectMessageElements();
    if (elements.length === 0) return [];

    // Keep DOM order stable even if selectors return mixed roots.
    const sorted = elements.slice().sort(compareDomOrder);

    const seenTexts = new Set();
    const out = [];

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (!isProbablyInTranscript(el)) continue;

      let text = '';
      try {
        const clone = el.cloneNode(true);
        removeUnwantedNodes(clone);
        text = normalizeContent(clone.textContent || '');
      } catch {
        text = normalizeContent(el.textContent || '');
      }

      if (!text || text.length < 2) continue;
      if (text.length > 120_000) continue;
      if (seenTexts.has(text)) continue;
      seenTexts.add(text);

      const role = detectRole(el, text, out.length);
      out.push({ role, content: text });
    }

    return out;
  };

  const looksLikeConversationUrl = (u) => {
    if (!u) return false;
    const p = String(u.pathname || '');
    // Canonical Grok conversation route.
    if (p.includes('/c/')) return true;
    // Best-effort fallback patterns.
    if (p.startsWith('/i/grok')) return true; // x.com embedding
    return false;
  };

  const isBadConversationId = (id) => {
    const s = String(id || '')
      .trim()
      .toLowerCase();
    if (!s) return true;
    return [
      'settings',
      'account',
      'help',
      'about',
      'explore',
      'home',
      'search',
      'discover',
      'notifications',
      'messages',
    ].includes(s);
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
      if (location.pathname === targetPath) return true;
      await sleep(200);
    }
    return true;
  };

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  async function ensureSidebarCacheSize(targetCount) {
    if (sidebarCache.done) return;
    if (sidebarCache.items.length >= targetCount) return;

    const engine = window.__RUMINER_SCROLL_ENGINE__;
    if (!engine || typeof engine.runScrollPages !== 'function') {
      sidebarCache.done = true;
      return;
    }

    await ensureSidebarVisible().catch(() => false);

    // Scroll to bottom to force lazy-loading of the full history list.
    await engine.runScrollPages({
      direction: 'down',
      findScroller: findSidebarScroller,
      intervalMs: 500,
      pageFactor: 0.8,
      stableDeltaPx: 60,
      stableAttempts: 4,
      bottomEpsilonPx: 10,
    });

    const scroller = findSidebarScroller();
    const queryRoot =
      scroller && typeof scroller.querySelectorAll === 'function' ? scroller : document;
    const anchors = Array.from(queryRoot.querySelectorAll('a[href]'));

    sidebarCache.items.length = 0;
    try {
      sidebarCache.seen.clear();
    } catch {}

    for (const a of anchors) {
      const href = String(a.getAttribute('href') || '').trim();
      if (!href) continue;

      let url;
      try {
        url = new URL(href, location.origin);
      } catch {
        continue;
      }
      if (url.hostname !== location.hostname) continue;
      if (!looksLikeConversationUrl(url)) continue;

      const id = parseConversationId(url.toString());
      if (!id || isBadConversationId(id)) continue;
      if (sidebarCache.seen.has(id)) continue;

      const title = String(a.textContent || '').trim() || null;
      sidebarCache.seen.add(id);
      sidebarCache.items.push({
        conversationId: id,
        conversationUrl: url.toString(),
        conversationTitle: title,
      });
    }

    sidebarCache.done = true;
  }

  async function listConversationsPage({ offset, limit }) {
    const OFF = typeof offset === 'number' && Number.isFinite(offset) ? Math.floor(offset) : 0;
    const LIM = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 100;
    const target = OFF + LIM;
    await ensureSidebarCacheSize(target);
    const slice = sidebarCache.items.slice(OFF, OFF + LIM);
    const nextOffset = slice.length > 0 ? OFF + slice.length : sidebarCache.done ? null : OFF;
    return { items: slice, nextOffset };
  }

  async function extractConversation({ conversationUrl }) {
    const url = String(conversationUrl || '').trim();
    if (!url) throw new Error('Missing conversationUrl');

    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };
    await sleep(500);

    // Best-effort: scroll up to load older turns if the transcript is virtualized.
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    if (engine && typeof engine.runScrollPages === 'function') {
      await engine.runScrollPages({
        direction: 'up',
        findScroller: findTranscriptScroller,
        intervalMs: 500,
        pageFactor: 0.8,
        stableDeltaPx: 80,
        stableAttempts: 4,
        topEpsilonPx: 40,
      });
    } else {
      try {
        window.scrollTo({ top: 0, behavior: 'auto' });
      } catch {}
    }

    const msgs = extractMessagesFromDom();
    const titleRaw = typeof document?.title === 'string' ? document.title.trim() : '';
    const title = titleRaw ? titleRaw : null;

    return {
      conversationId: parseConversationId(url) || parseConversationId(location.href) || null,
      conversationUrl: url,
      conversationTitle: title,
      messages: msgs,
    };
  }

  window.__RUMINER_PLATFORM__ = {
    platform: PLATFORM,
    version: VERSION,
    listConversationsPage,
    extractConversation,
  };

  try {
    console.debug(LOG, 'loaded');
  } catch {}
})();
