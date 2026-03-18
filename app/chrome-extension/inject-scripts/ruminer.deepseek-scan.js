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

  const findSidebarScroller = () => {
    const candidates = ['nav', 'aside', '[class*="scroll-area"]'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  const collectConversationLinksOnce = () => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    let added = 0;

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
      added += 1;
    }

    return { added, totalAnchors: anchors.length };
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

    const scroller = findSidebarScroller();
    const start = Date.now();
    const missing = Math.max(1, targetCount - sidebarCache.items.length);
    const baseWaitMs = sidebarCache.items.length === 0 ? 20_000 : 8_000;
    const perMissingMs = sidebarCache.items.length === 0 ? 0 : 1_200;
    const maxWaitMs = Math.min(60_000, baseWaitMs + missing * perMissingMs);
    const deadline = start + maxWaitMs;

    let stableNoNew = 0;
    let lastProgressAt = Date.now();
    let didScroll = false;

    while (Date.now() < deadline && sidebarCache.items.length < targetCount) {
      const { added, totalAnchors } = collectConversationLinksOnce();

      if (added > 0) {
        lastProgressAt = Date.now();
        stableNoNew = 0;
      } else {
        const pageLooksReady = totalAnchors > 0 || didScroll || sidebarCache.items.length > 0;
        if (pageLooksReady) stableNoNew += 1;
      }

      if (sidebarCache.items.length >= targetCount) break;

      // Avoid prematurely giving up while the sidebar is still rendering.
      const quietMs = Date.now() - lastProgressAt;
      if (sidebarCache.items.length > 0 && stableNoNew >= 8 && quietMs > 1500) {
        const canScroll = scroller && scroller.scrollHeight > scroller.clientHeight + 8;
        const atBottom =
          !canScroll ||
          (scroller &&
            scroller.scrollTop + scroller.clientHeight >= Math.max(0, scroller.scrollHeight - 4));
        if (atBottom) {
          sidebarCache.done = true;
          break;
        }
      }

      // Grace period: let the app finish loading before we start scrolling the sidebar.
      if (scroller && Date.now() - start > 3000) {
        const beforeTop = scroller.scrollTop;
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          scroller.scrollTop + Math.max(240, Math.floor(scroller.clientHeight * 0.9)),
        );
        if (scroller.scrollTop !== beforeTop) didScroll = true;
      }

      await sleep(250);
    }
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
    const scroller = document.scrollingElement || document.documentElement;
    let stable = 0;
    for (let i = 0; i < 120; i++) {
      const beforeTop = scroller.scrollTop;
      scroller.scrollTop = Math.max(
        0,
        scroller.scrollTop - Math.max(240, Math.floor(scroller.clientHeight * 0.9)),
      );
      await sleep(220);
      const afterTop = scroller.scrollTop;
      if (afterTop === beforeTop) stable += 1;
      else stable = 0;
      if (stable >= 5) break;
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
