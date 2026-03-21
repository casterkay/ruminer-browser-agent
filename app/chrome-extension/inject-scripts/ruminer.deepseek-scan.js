/* eslint-disable */
// ruminer.deepseek-scan.js
// Injected into chat.deepseek.com pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'deepseek';
  const VERSION = '2026-03-18.1';
  const LOG = '[ruminer.deepseek-scan]';

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

          if (request.action === 'ruminer_scan_getConversationMessages') {
            const conversationId = String(request?.payload?.conversationId || '');
            const conversationUrl = String(request?.payload?.conversationUrl || '');
            Promise.resolve()
              .then(() =>
                api.getConversationMessages({
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
      });
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

  const findSidebarScroller = () => {
    const core = window.__RUMINER_SCAN_CORE__;
    const selectors = ['nav', 'aside', '[class*="scroll-area"]', '[class*="sidebar"]'];

    const strict =
      core && typeof core.findFirstScroller === 'function'
        ? core.findFirstScroller(selectors)
        : null;
    if (strict) return strict;

    const relaxed =
      core && typeof core.findFirstScroller === 'function'
        ? core.findFirstScroller(selectors)
        : null;
    return relaxed || document.scrollingElement || document.documentElement;
  };

  const ensureSidebarVisible = async () => {
    try {
      const ready = findSidebarScroller();
      if (ready) return true;
    } catch {}

    const toggles = ['[class*="ds-icon-button"]'];
    clickFirstMatching(toggles);

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
    const core = window.__RUMINER_SCAN_CORE__;
    const selectors = ['div[class*="ds-virtual-list"]', '[class*="ds-virtual-list"]'];

    const strict =
      core && typeof core.findFirstScroller === 'function'
        ? core.findFirstScroller(selectors)
        : null;
    if (strict) return strict;

    const relaxed =
      core && typeof core.findFirstScroller === 'function'
        ? core.findFirstScroller(selectors)
        : null;
    return relaxed || document.scrollingElement || document.documentElement;
  };

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  const compareDomOrder = (a, b) => {
    if (a === b) return 0;
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };

  const extractMessagesFromDom = () => {
    const userQuestions = Array.from(document.querySelectorAll('.fbb737a4'));
    const aiResponses = Array.from(
      document.querySelectorAll('.ds-message .ds-markdown:not(.ds-think-content .ds-markdown)'),
    );
    const all = [];
    for (const el of userQuestions) all.push({ el, role: 'user' });
    for (const el of aiResponses) all.push({ el, role: 'assistant' });
    all.sort((x, y) => compareDomOrder(x.el, y.el));
    return all
      .map((x) => ({ role: x.role, content: normalizeContent(x.el.textContent || '') }))
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

  async function ensureSidebarCacheSize(targetCount) {
    if (sidebarCache.done) return;
    if (sidebarCache.items.length >= targetCount) return;

    const core = window.__RUMINER_SCAN_CORE__;
    if (!core || typeof core.runScrollConversations !== 'function') {
      sidebarCache.done = true;
      return;
    }

    await ensureSidebarVisible().catch(() => false);

    await core.runScrollConversations({
      findScroller: findSidebarScroller,
      intervalMs: 500,
      stepFactor: 0.8,
      stableDeltaPx: 40,
      stableAttempts: 4,
      hrefFilter: (href) => typeof href === 'string' && href.includes('/chat/'),
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

  async function listConversations({ offset, limit }) {
    const OFF = typeof offset === 'number' && Number.isFinite(offset) ? Math.floor(offset) : 0;
    const LIM = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 100;
    const target = OFF + LIM;
    await ensureSidebarCacheSize(target);
    const slice = sidebarCache.items.slice(OFF, OFF + LIM);
    const nextOffset = slice.length > 0 ? OFF + slice.length : sidebarCache.done ? null : OFF;
    return { items: slice, nextOffset };
  }

  async function getConversationMessages({ conversationId, conversationUrl }) {
    const url = String(conversationUrl || '').trim();
    if (!url) throw new Error('Missing conversationUrl');
    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };
    await sleep(400);

    // Best-effort: scroll up to load older turns if the transcript is virtualized.
    const core = window.__RUMINER_SCAN_CORE__;
    if (core && typeof core.runScrollMessages === 'function') {
      await core.runScrollMessages({
        direction: 'up',
        findScroller: findTranscriptScroller,
        intervalMs: 500,
        stepFactor: 0.8,
        stableDeltaPx: 40,
        stableAttempts: 4,
      });
    }

    const msgs = extractMessagesFromDom();
    return {
      conversationId: String(conversationId || '').trim() || parseConversationId(url) || null,
      conversationUrl: url,
      conversationTitle: null,
      messages: msgs,
    };
  }

  window.__RUMINER_SCAN__ = {
    platform: PLATFORM,
    version: VERSION,
    listConversations,
    getConversationMessages,
  };

  try {
    console.debug(LOG, 'loaded');
  } catch {}
})();
