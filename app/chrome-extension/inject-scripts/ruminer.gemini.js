/* eslint-disable */
// ruminer.gemini.js
// Injected into gemini.google.com pages (ISOLATED world). Exposes `window.__RUMINER_PLATFORM__`.

(() => {
  const PLATFORM = 'gemini';
  const VERSION = '2026-03-31.3';
  const LOG = '[ruminer.gemini]';

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
                  const diagnostics =
                    value &&
                    typeof value === 'object' &&
                    value.diagnostics &&
                    typeof value.diagnostics === 'object'
                      ? value.diagnostics
                      : undefined;
                  sendResponse({
                    ok: false,
                    error: String(value.error || 'listConversations failed'),
                    ...(diagnostics ? { diagnostics } : {}),
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
                  const diagnostics =
                    value &&
                    typeof value === 'object' &&
                    value.diagnostics &&
                    typeof value.diagnostics === 'object'
                      ? value.diagnostics
                      : undefined;
                  sendResponse({
                    ok: false,
                    error: String(value.error || 'getConversationMessages failed'),
                    ...(diagnostics ? { diagnostics } : {}),
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

      nextRpc.listener = listener;
      chrome.runtime.onMessage.addListener(listener);
      nextRpc.installed = true;
    } catch {}
  };

  installRpc();
  if (sameApi) return;

  const SELECTORS = {
    // Incremental extractor defaults (mirrors gemini-export conversation_extractor.js).
    turnContainers: '#chat-history .conversation-container',
    turnContainer: '.conversation-container',
    userContainer: 'user-query',
    userLine: '.query-text-line',
    userParagraph: '.query-text p',
    userText: '.query-text',
    modelContent: '.response-container-content, model-response',
    modelMarkdown: '.model-response-text .markdown',
  };

  const READY_POLL_MS = 400;
  const READY_TIMEOUT_MS = 20_000;
  const SIDEBAR_READY_TIMEOUT_MS = 10_000;

  const extractTextPreserveNewlines = (root) => {
    if (!root) return '';
    const NodeCtor = typeof Node !== 'undefined' ? Node : null;
    const TEXT_NODE = NodeCtor ? NodeCtor.TEXT_NODE : 3;
    const ELEMENT_NODE = NodeCtor ? NodeCtor.ELEMENT_NODE : 1;

    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
    const PARA_BREAK_TAGS = new Set([
      'P',
      'H1',
      'H2',
      'H3',
      'H4',
      'H5',
      'H6',
      'PRE',
      'BLOCKQUOTE',
      'TABLE',
    ]);
    const LINE_BREAK_TAGS = new Set([
      'DIV',
      'SECTION',
      'ARTICLE',
      'HEADER',
      'FOOTER',
      'ASIDE',
      'NAV',
      'UL',
      'OL',
      'LI',
      'TR',
      'HR',
    ]);

    const ensureTrailingNewlines = (buf, count) => {
      if (count <= 0) return buf;
      let trailing = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] !== '\n') break;
        trailing++;
      }
      if (trailing >= count) return buf;
      return buf + '\n'.repeat(count - trailing);
    };

    const ensureLeadingNewlineIfNeeded = (buf) => {
      if (!buf) return buf;
      const last = buf[buf.length - 1];
      return last === '\n' ? buf : buf + '\n';
    };

    let out = '';

    const visit = (node) => {
      if (!node) return;
      const t = node.nodeType;
      if (t === TEXT_NODE) {
        const v = node.nodeValue;
        if (typeof v === 'string' && v) out += v;
        return;
      }
      if (t !== ELEMENT_NODE) return;

      const el = node;
      const tag = String(el.tagName || '').toUpperCase();
      if (!tag || SKIP_TAGS.has(tag)) return;

      // Skip content that is explicitly hidden.
      if (el.hasAttribute?.('hidden')) return;
      const ariaHidden = el.getAttribute?.('aria-hidden');
      if (ariaHidden === 'true') return;

      if (tag === 'BR') {
        out = ensureTrailingNewlines(out, 1);
        return;
      }

      // Preserve preformatted blocks (code, tables rendered as <pre>, etc).
      if (tag === 'PRE') {
        out = ensureLeadingNewlineIfNeeded(out);
        const txt = el.textContent;
        if (typeof txt === 'string' && txt) out += txt;
        out = ensureTrailingNewlines(out, 2);
        return;
      }

      const isLineBreak = LINE_BREAK_TAGS.has(tag) || PARA_BREAK_TAGS.has(tag);
      if (isLineBreak) out = ensureTrailingNewlines(out, 1);

      const children = el.childNodes;
      if (children && children.length) {
        for (let i = 0; i < children.length; i++) visit(children[i]);
      }

      if (PARA_BREAK_TAGS.has(tag)) out = ensureTrailingNewlines(out, 2);
      else if (isLineBreak) out = ensureTrailingNewlines(out, 1);
    };

    try {
      visit(root);
    } catch {
      // Fallback: best-effort, may lose formatting.
      try {
        return String(root.textContent || '');
      } catch {
        return '';
      }
    }

    return out;
  };

  const getNodeText = (node) => {
    const structured = extractTextPreserveNewlines(node);
    const s = typeof structured === 'string' ? structured : String(structured || '');

    // Gemini's DOM sometimes uses non-semantic inline tags (e.g. spans) with block layout.
    // `innerText` reflects rendered line breaks in those cases, so use it when it adds meaningful newlines.
    try {
      const it = node && typeof node.innerText === 'string' ? node.innerText : '';
      if (typeof it === 'string') {
        if (it.trim() && !s.trim()) return it;
        if (it.includes('\n') && !s.includes('\n')) return it;
      }
    } catch {}

    return s;
  };

  // Matches gemini-export normalizeText(): CRLF→LF, collapse excessive blank lines, trim.
  const normalizeText = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const sleep = (ms) => {
    const n = typeof ms === 'number' && Number.isFinite(ms) ? Math.floor(ms) : 0;
    // Clamp to signed 32-bit (setTimeout max in most browsers).
    const safe = Math.max(0, Math.min(0x7fffffff, n));
    return new Promise((r) => setTimeout(r, safe));
  };

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

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

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

  const findSidebarShell = () => {
    const selectors = [
      '[data-test-id*="history"]',
      '[data-testid*="history"]',
      'mat-sidenav-content',
      '.chat-history',
      'nav',
      'aside',
    ];

    for (const sel of selectors) {
      let el = null;
      try {
        el = document.querySelector(sel);
      } catch {
        el = null;
      }
      if (el && isVisible(el)) return el;
    }

    return null;
  };

  const findSidebarContainer = () => {
    const shell = findSidebarShell();
    if (!shell) return null;
    try {
      if (shell.querySelector('a[href*="/app/"]')) return shell;
    } catch {}
    return null;
  };

  const isGeminiShellReady = () => {
    try {
      if (document.readyState !== 'interactive' && document.readyState !== 'complete') return false;
      return Boolean(
        document.querySelector('[aria-label="Main menu"], [data-test-id="side-nav-menu-button"]'),
      );
    } catch {
      return false;
    }
  };

  const waitForGeminiShellReady = async (timeoutMs = SIDEBAR_READY_TIMEOUT_MS) => {
    const deadline = Date.now() + Math.max(0, Math.floor(timeoutMs));
    while (Date.now() < deadline) {
      if (isGeminiShellReady()) return true;
      await sleep(250);
    }
    return isGeminiShellReady();
  };

  const hasVisibleSidebarConversationItems = () => {
    const root = findSidebarContainer() || document;
    try {
      const anchors = Array.from(root.querySelectorAll('a[href*="/app/"]'));
      return anchors.some((a) => isVisible(a));
    } catch {
      return false;
    }
  };

  const nextSiblingOrAncestorSibling = (el, stopAt) => {
    let cur = el;
    while (cur && cur !== stopAt) {
      if (cur.nextElementSibling) return cur.nextElementSibling;
      cur = cur.parentElement;
    }
    return null;
  };

  const findNextTurnContainer = (fromEl, transcriptRoot) => {
    let cursor = fromEl;
    while (cursor) {
      const candidate = nextSiblingOrAncestorSibling(cursor, transcriptRoot);
      if (!candidate) return null;
      try {
        if (candidate.matches?.(SELECTORS.turnContainer)) return candidate;
        const found = candidate.querySelector?.(SELECTORS.turnContainer);
        if (found) return found;
      } catch {}
      cursor = candidate;
    }
    return null;
  };

  const findSidebarScroller = () => {
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const selectors = [
      '[data-test-id*="history"]',
      '[data-testid*="history"]',
      'mat-sidenav-content',
      '.chat-history',
      'nav',
      'aside',
    ];

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
    await waitForGeminiShellReady().catch(() => false);

    try {
      if (hasVisibleSidebarConversationItems()) return true;
    } catch {}
    try {
      if (findSidebarShell()) return true;
    } catch {}

    const toggles = ['[aria-label="Main menu"]', '[data-test-id="side-nav-menu-button"]'];

    let clicked = clickFirstMatching(toggles);

    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        if (hasVisibleSidebarConversationItems()) return true;
      } catch {}
      try {
        if (findSidebarShell()) return true;
      } catch {}
      if (!clicked && isGeminiShellReady()) clicked = clickFirstMatching(toggles);
      await sleep(250);
    }
    return false;
  };

  const findTranscriptScroller = () => {
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const selectors = [
      // Preferred: Gemini transcript list scroller.
      'infinite-scroller[class*="chat-history"]',
      '#chat-history infinite-scroller',
      'chat-history infinite-scroller',
      // Common wrappers.
      '.chat-history-scroll-container',
      '.chat-scrollable-container',
      'chat-history-scroll-container',
      '[data-test-id="chat-history-container"]',
    ];

    const byEngine =
      engine && typeof engine.findFirstScroller === 'function'
        ? engine.findFirstScroller(selectors)
        : null;
    if (byEngine) return byEngine;

    try {
      const root = findTranscriptRoot();
      const byAncestor = root ? findScrollableAncestor(root) : null;
      if (byAncestor) return byAncestor;
    } catch {}

    try {
      const firstTurn = document.querySelector(SELECTORS.turnContainers);
      const byAncestor = firstTurn ? findScrollableAncestor(firstTurn) : null;
      if (byAncestor) return byAncestor;
    } catch {}

    return document.scrollingElement || document.documentElement;
  };

  const findTranscriptRoot = () => {
    return (
      document.querySelector('#chat-history') ||
      document.querySelector('chat-history') ||
      document.querySelector('[data-test-id*="chat-history"]') ||
      document.querySelector('[data-testid*="chat-history"]') ||
      null
    );
  };

  const createTurnInfo = (index) => ({
    firstSeenSeq: index,
    userText: null,
    assistantText: null,
  });

  const isProbablyRenderable = (element, requireVisibleRect) => {
    if (!element || element.nodeType !== 1) return false;
    let style;
    try {
      style = window.getComputedStyle(element);
    } catch {
      style = null;
    }
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    if (!requireVisibleRect) return true;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return true;
    return rect.width > 0 && rect.height > 0;
  };

  const extractMessagesFromDomOnce = () => {
    const containers = Array.from(document.querySelectorAll(SELECTORS.turnContainers));
    const out = [];

    for (const container of containers) {
      if (!isProbablyRenderable(container, true)) continue;

      let userText = '';
      try {
        let userTexts = [];
        const lines = Array.from(
          container.querySelectorAll(`${SELECTORS.userContainer} ${SELECTORS.userLine}`),
        );
        if (lines.length > 0) {
          userTexts = lines.map((el) => normalizeText(getNodeText(el)));
        } else {
          const paragraphs = Array.from(
            container.querySelectorAll(`${SELECTORS.userContainer} ${SELECTORS.userParagraph}`),
          );
          if (paragraphs.length > 0) {
            userTexts = paragraphs.map((el) => normalizeText(getNodeText(el)));
          } else {
            const userTextNode = container.querySelector(
              `${SELECTORS.userContainer} ${SELECTORS.userText}`,
            );
            if (userTextNode) {
              userTexts = [normalizeText(getNodeText(userTextNode))];
            } else {
              const userContainerNode = container.querySelector(SELECTORS.userContainer);
              if (userContainerNode) userTexts = [normalizeText(getNodeText(userContainerNode))];
            }
          }
        }
        userTexts = userTexts.filter(Boolean);
        userText = userTexts.length > 0 ? normalizeText(userTexts.join('\n')) : '';
      } catch {
        userText = '';
      }

      let assistantText = '';
      try {
        const modelRoot = container.querySelector(SELECTORS.modelContent);
        if (modelRoot) {
          const markdownNode = modelRoot.querySelector(SELECTORS.modelMarkdown);
          assistantText = markdownNode
            ? normalizeText(getNodeText(markdownNode))
            : normalizeText(getNodeText(modelRoot));
        }
      } catch {
        assistantText = '';
      }

      if (userText) out.push({ role: 'user', content: userText });
      if (assistantText) out.push({ role: 'assistant', content: assistantText });
    }

    // Remove consecutive exact duplicates (role + content) to reduce rare virtualization artifacts.
    const deduped = [];
    let last = null;
    for (const m of out) {
      if (
        last &&
        last.role === m.role &&
        typeof last.content === 'string' &&
        typeof m.content === 'string' &&
        last.content === m.content
      ) {
        continue;
      }
      deduped.push(m);
      last = m;
    }
    return deduped;
  };

  const fingerprintVisibleTranscript = () => {
    try {
      const msgs = extractMessagesFromDomOnce();
      return msgs
        .slice(0, 6)
        .map((m) => `${m.role}:${String(m.content || '').slice(0, 160)}`)
        .join('\n');
    } catch {
      return '';
    }
  };

  const findConversationAnchorByPath = (targetPath) => {
    const roots = [findSidebarContainer(), findSidebarShell(), document];
    for (const root of roots) {
      if (!root || typeof root.querySelectorAll !== 'function') continue;
      let anchors = [];
      try {
        anchors = Array.from(root.querySelectorAll('a[href*="/app/"]'));
      } catch {
        anchors = [];
      }
      for (const anchor of anchors) {
        if (!anchor || typeof anchor.getAttribute !== 'function') continue;
        let u = null;
        try {
          u = new URL(String(anchor.getAttribute('href') || ''), location.origin);
        } catch {
          u = null;
        }
        if (!u || u.pathname !== targetPath) continue;
        if (!isVisible(anchor)) continue;
        return anchor;
      }
    }
    return null;
  };

  const openConversationInPlace = async (targetUrl) => {
    const targetPath = targetUrl.pathname;
    if (location.pathname === targetPath) return { ok: true, alreadyThere: true };

    let anchor = findConversationAnchorByPath(targetPath);
    let sidebarReady = false;

    if (!anchor) {
      sidebarReady = await ensureSidebarVisible().catch(() => false);
      if (sidebarReady && engine && typeof engine.runScrollPages === 'function') {
        const tryFind = () => {
          anchor = findConversationAnchorByPath(targetPath);
          return Boolean(anchor);
        };
        if (!tryFind()) {
          await engine.runScrollPages({
            direction: 'down',
            findScroller: findSidebarScroller,
            intervalMs: 100,
            pageFactor: 1.0,
            stableDeltaPx: 60,
            stableAttempts: 4,
            bottomEpsilonPx: 10,
            onPage: () => !tryFind(),
          });
        }
        if (!tryFind()) {
          await engine.runScrollPages({
            direction: 'up',
            findScroller: findSidebarScroller,
            intervalMs: 100,
            pageFactor: 1.0,
            stableDeltaPx: 60,
            stableAttempts: 4,
            topEpsilonPx: 40,
            onPage: () => !tryFind(),
          });
        }
      }
    }

    if (!anchor) {
      return {
        ok: false,
        error: 'conversation_anchor_not_found',
        diagnostics: {
          targetPath,
          currentPath: String(location.pathname || ''),
          sidebarReady,
        },
      };
    }

    try {
      anchor.click();
    } catch {
      return {
        ok: false,
        error: 'conversation_anchor_click_failed',
        diagnostics: {
          targetPath,
          currentPath: String(location.pathname || ''),
        },
      };
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

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  async function ensureSidebarCacheScanned() {
    if (sidebarCache.done) return;

    const engine = window.__RUMINER_SCROLL_ENGINE__;
    const sidebarReady = await ensureSidebarVisible().catch(() => false);
    if (!sidebarReady) return;

    await engine.runScrollPages({
      direction: 'down',
      findScroller: findSidebarScroller,
      intervalMs: 100,
      pageFactor: 1.0,
      stableDeltaPx: 60,
      stableAttempts: 4,
      bottomEpsilonPx: 10,
    });

    const scroller = findSidebarScroller();
    const container = findSidebarContainer() || findSidebarShell();
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
    const OFF =
      typeof offset === 'number' && Number.isFinite(offset)
        ? clamp(Math.floor(offset), 0, 1_000_000)
        : 0;
    const LIM =
      typeof limit === 'number' && Number.isFinite(limit) ? clamp(Math.floor(limit), 1, 200) : 100;
    await ensureSidebarCacheScanned();
    const slice = sidebarCache.items.slice(OFF, OFF + LIM);
    const nextOffset = slice.length > 0 ? OFF + slice.length : sidebarCache.done ? null : OFF;
    return { items: slice, nextOffset };
  }

  async function extractConversation({ conversationUrl }) {
    const url = String(conversationUrl || '').trim();
    if (!url) throw new Error('Missing conversationUrl');
    let target;
    try {
      target = new URL(url, location.origin);
    } catch {
      throw new Error(`Invalid conversationUrl: ${url}`);
    }

    if (target.origin !== location.origin) {
      return {
        ok: false,
        error: 'cross_origin_not_allowed',
        diagnostics: {
          conversationUrl: url,
          targetOrigin: target.origin,
          currentOrigin: location.origin,
        },
      };
    }

    const targetPath = target.pathname;
    const targetId = parseConversationId(url);

    // Phase A — Navigate (router-friendly <a>.click() when possible).
    const fp0 = fingerprintVisibleTranscript();
    const nav = await openConversationInPlace(target);
    if (!nav.ok) return nav;

    // Phase B — Hydration-ready poll (400ms retry).
    const readyDeadline = Date.now() + READY_TIMEOUT_MS;
    let lastContainerCount = 0;
    let lastFingerprint = '';
    let readyMessages = null;
    while (Date.now() < readyDeadline) {
      if (location.pathname !== targetPath) {
        await sleep(READY_POLL_MS);
        continue;
      }

      if (targetId) {
        const curId = parseConversationId(location.href || '');
        if (curId && curId !== targetId) {
          await sleep(READY_POLL_MS);
          continue;
        }
      }

      try {
        lastContainerCount = document.querySelectorAll(SELECTORS.turnContainers).length;
      } catch {
        lastContainerCount = 0;
      }

      const fp = fingerprintVisibleTranscript();
      lastFingerprint = fp;
      const msgs = extractMessagesFromDomOnce();
      const hasAny = Array.isArray(msgs) && msgs.length > 0;
      const swapped =
        nav.alreadyThere === true ? true : fp0.trim() ? fp && fp !== fp0 : Boolean(fp && fp.trim());

      if (hasAny && swapped) {
        readyMessages = msgs;
        break;
      }
      await sleep(READY_POLL_MS);
    }

    if (!readyMessages) {
      const root = findTranscriptRoot();
      const diagnostics = {
        href: String(location.href || ''),
        targetPath,
        currentPath: String(location.pathname || ''),
        targetId,
        currentId: parseConversationId(location.href || ''),
        fingerprint0: fp0,
        fingerprintLast: lastFingerprint,
        readyTimeoutMs: READY_TIMEOUT_MS,
        pollMs: READY_POLL_MS,
        hasTranscriptRoot: Boolean(root),
        containerSelector: SELECTORS.turnContainers,
        containerCount: lastContainerCount,
      };
      const error = `transcript_not_ready:timeout (targetPath=${targetPath}, currentPath=${String(location.pathname || '')}, hasTranscriptRoot=${Boolean(root)}, containerCount=${lastContainerCount})`;
      return { ok: false, error, diagnostics };
    }

    // Phase C — Scroll to top, then extract once in DOM order.
    const engine = window.__RUMINER_SCROLL_ENGINE__;
    if (!engine || typeof engine.runScrollPages !== 'function') {
      // no-op
    } else {
      const scroller = findTranscriptScroller();
      await engine.runScrollPages({
        direction: 'up',
        scroller,
        intervalMs: 100,
        pageFactor: 1.0,
        stableDeltaPx: 60,
        stableAttempts: 4,
        topEpsilonPx: 40,
      });
    }

    // Phase D — Build output message list.
    const msgs = extractMessagesFromDomOnce();
    let title = null;
    try {
      const titleEl =
        document.querySelector('[data-test-id="conversation-title"]') ||
        document.querySelector('[class*="conversation-title"]');
      const raw = titleEl ? String(titleEl.textContent || '').trim() : '';
      title = raw || null;
    } catch {
      title = null;
    }

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
