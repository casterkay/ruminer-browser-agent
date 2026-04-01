/* eslint-disable */
// ruminer.deepseek.js
// Injected into chat.deepseek.com pages (ISOLATED world). Exposes `window.__RUMINER_PLATFORM__`.

(() => {
  const PLATFORM = 'deepseek';
  const VERSION = '2026-03-31.2';
  const LOG = '[ruminer.deepseek]';

  const existing = window.__RUMINER_PLATFORM__;
  const sameApi = existing && existing.platform === PLATFORM && existing.version === VERSION;

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(String(urlString || ''));
      const pathname = String(u.pathname || '');
      // Examples:
      // - /chat/<uuid>
      // - /a/chat/s/<uuid>
      const m = pathname.match(/\/(?:a\/)?chat(?:\/s)?\/([^/?#]+)/);
      if (m && m[1]) return m[1];
      return pathname.split('/').filter(Boolean).pop() || null;
    } catch {
      return null;
    }
  };

  const installRpc = () => {
    const rpc = window.__RUMINER_PLATFORM_RPC__;
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION && rpc.installed === true)
      return;

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

  const engine = window.__RUMINER_SCROLL_ENGINE__ || null;

  const isVisible = (el) => {
    if (engine && typeof engine.isElementVisible === 'function') return engine.isElementVisible(el);
    if (!el || el.nodeType !== 1) return false;
    return true;
  };

  const findScrollableAncestor = (startEl, maxDepth = 12) => {
    if (engine && typeof engine.findScrollableAncestor === 'function')
      return engine.findScrollableAncestor(startEl, maxDepth);
    return null;
  };

  const isConversationHref = (href) => {
    const h = String(href || '');
    return h.startsWith('/a/chat/s/') || h.startsWith('/chat/') || h.includes('/chat/');
  };

  const findSidebarContainer = () => {
    const selectors = ['nav', 'aside', '[class*="scroll-area"]', '[class*="sidebar"]'];
    for (const sel of selectors) {
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch {
        el = null;
      }
      if (!el || !isVisible(el)) continue;
      try {
        const anchors = Array.from(el.querySelectorAll('a[href]'));
        if (anchors.some((a) => isConversationHref(a.getAttribute('href')))) return el;
      } catch {}
    }
    return null;
  };

  const hasVisibleSidebarConversationItems = () => {
    const root = findSidebarContainer() || document;
    try {
      const anchors = Array.from(root.querySelectorAll('a[href]'));
      return anchors.some((a) => isConversationHref(a.getAttribute('href')) && isVisible(a));
    } catch {
      return false;
    }
  };

  const findSidebarScroller = () => {
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const selectors = ['nav', 'aside', '[class*="scroll-area"]', '[class*="sidebar"]'];

    const container = findSidebarContainer();
    const byAncestor = container ? findScrollableAncestor(container) : null;
    if (byAncestor) return byAncestor;

    const byEngine =
      engine && typeof engine.findFirstScroller === 'function'
        ? engine.findFirstScroller(selectors)
        : null;
    if (byEngine) return byEngine;

    return container || document.scrollingElement || document.documentElement;
  };

  const ensureSidebarVisible = async () => {
    try {
      if (hasVisibleSidebarConversationItems()) return true;
    } catch {}

    const toggles = ['[class*="ds-icon-button"]'];
    clickFirstMatching(toggles);

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        if (hasVisibleSidebarConversationItems()) return true;
      } catch {}
      await sleep(250);
    }
    return false;
  };

  const findTranscriptScroller = () => {
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const selectors = ['div[class*="ds-virtual-list"]', '[class*="ds-virtual-list"]'];

    const byEngine =
      engine && typeof engine.findFirstScroller === 'function'
        ? engine.findFirstScroller(selectors)
        : null;
    if (byEngine) return byEngine;

    // DeepSeek frequently virtualizes the message list inside nested divs; the real scroller might be an ancestor
    // of the list root even if the list root itself isn't marked overflowY=scroll.
    try {
      const listRoot =
        document.querySelector('div[class*="ds-virtual-list"]') ||
        document.querySelector('[class*="ds-virtual-list"]') ||
        document.querySelector('.ds-message') ||
        null;
      const byAncestor = listRoot ? findScrollableAncestor(listRoot) : null;
      if (byAncestor) return byAncestor;
    } catch {}

    return document.scrollingElement || document.documentElement;
  };

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  const extractMessagesFromDom = () => {
    const nodes = Array.from(document.querySelectorAll('.ds-message'));
    const out = [];

    for (const msg of nodes) {
      const mds = Array.from(msg.querySelectorAll('.ds-markdown')).filter(
        (md) => !md.closest('.ds-think-content'),
      );

      if (mds.length > 0) {
        const content = normalizeContent(mds.map((md) => md.textContent || '').join('\n\n'));
        if (content) out.push({ role: 'assistant', content });
        continue;
      }

      // User turns usually have no markdown and the meaningful text is nested inside hashed inner divs.
      const userContent = normalizeContent(msg.textContent || '');
      if (userContent) out.push({ role: 'user', content: userContent });
    }

    return out;
  };

  const fingerprintTranscript = () => {
    try {
      const msgs = extractMessagesFromDom();
      return msgs
        .slice(0, 6)
        .map((m) => `${m.role}:${String(m.content || '').slice(0, 160)}`)
        .join('\n');
    } catch {
      return '';
    }
  };

  const openConversationInPlace = async (url) => {
    const targetPath = new URL(url, location.origin).pathname;
    if (location.pathname === targetPath) return { ok: true, alreadyThere: true };
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
      return { ok: false, error: 'navigation_started' };
    }

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (location.pathname === targetPath) return { ok: true, clicked: true };
      await sleep(200);
    }
    return {
      ok: false,
      error: 'navigation_timeout',
      diagnostics: {
        targetPath,
        currentPath: String(location.pathname || ''),
      },
    };
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

    await engine.runScrollPages({
      direction: 'down',
      findScroller: findSidebarScroller,
      intervalMs: 100,
      intervalMsAtBoundary: 300,
      pageFactor: 1.0,
      stableDeltaPx: 50,
      stableAttempts: 3,
      bottomEpsilonPx: 10,
    });

    const scroller = findSidebarScroller();
    const container = findSidebarContainer();
    const queryRoot =
      container && typeof container.querySelectorAll === 'function'
        ? container
        : scroller && typeof scroller.querySelectorAll === 'function'
          ? scroller
          : document;
    const anchors = Array.from(queryRoot.querySelectorAll('a[href]'));

    sidebarCache.items.length = 0;
    try {
      sidebarCache.seen.clear();
    } catch {}

    for (const a of anchors) {
      const href = String(a.getAttribute('href') || '');
      // Prefer stable, explicit conversation links.
      if (!href.startsWith('/a/chat/s/') && !href.startsWith('/chat/') && !href.includes('/chat/'))
        continue;
      let url;
      try {
        url = new URL(href, location.origin);
      } catch {
        continue;
      }
      if (url.hostname !== location.hostname) continue;
      const id = parseConversationId(url.toString());
      if (!id) continue;
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
    const fp0 = fingerprintTranscript();
    const nav = await openConversationInPlace(url);
    if (!nav.ok) return nav;

    // Wait for DOM to reflect the newly-selected conversation (SPA route updates can race DOM hydration).
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const fp = fingerprintTranscript();
      const swapped =
        nav.alreadyThere === true
          ? Boolean(fp && fp.trim())
          : fp0.trim()
            ? fp && fp !== fp0
            : Boolean(fp && fp.trim());
      if (swapped) break;
      await sleep(200);
    }

    await sleep(250);

    // Best-effort: scroll up to load older turns if the transcript is virtualized.
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    if (engine && typeof engine.runScrollPages === 'function') {
      const scroller = findTranscriptScroller();
      await engine.runScrollPages({
        direction: 'up',
        scroller,
        intervalMs: 100,
        intervalMsAtBoundary: 300,
        pageFactor: 1.0,
        stableDeltaPx: 50,
        stableAttempts: 3,
        topEpsilonPx: 40,
      });
    }

    const msgs = extractMessagesFromDom();
    const titleRaw = typeof document?.title === 'string' ? document.title.trim() : '';
    const title = titleRaw ? titleRaw : null;
    return {
      conversationId: parseConversationId(url) || null,
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
