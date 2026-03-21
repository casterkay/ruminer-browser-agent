/* eslint-disable */
// ruminer.gemini-scan.js
// Injected into gemini.google.com pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'gemini';
  const VERSION = '2026-03-17.4';
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
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION && rpc.installed === true)
      return;

    // Avoid accumulating duplicate listeners across reinjection / version bumps.
    try {
      if (rpc && typeof rpc.listener === 'function')
        chrome.runtime.onMessage.removeListener(rpc.listener);
    } catch {}

    const nextRpc = { platform: PLATFORM, version: VERSION, installed: false, listener: null };
    window.__RUMINER_SCAN_RPC__ = nextRpc;

    try {
      const listener = (request, _sender, sendResponse) => {
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
    const core = window.__RUMINER_SCAN_CORE__;
    const selectors = [
      '[data-test-id*="history"]',
      '[data-testid*="history"]',
      'mat-sidenav-content',
      '.chat-history',
      'nav',
      'aside',
    ];

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

    const toggles = [
      '[aria-label="Main menu"]',
      '[data-test-id="side-nav-menu-button"]',
      '[class*="mdc-icon-button"]',
    ];

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

  const extractConversationIncremental = (
    collectedByContainer,
    allocateFirstSeenSeq,
    containers,
    options = {},
  ) => {
    if (!collectedByContainer || typeof collectedByContainer.get !== 'function') return false;
    if (!Array.isArray(containers) || containers.length === 0) return false;

    const requireVisibleRect = options && options.requireVisibleRect === true;
    let changed = false;

    containers.forEach((container, idx) => {
      if (!isProbablyRenderable(container, requireVisibleRect)) return;

      let info = collectedByContainer.get(container);
      if (!info) {
        const firstSeenSeq =
          typeof allocateFirstSeenSeq === 'function' ? allocateFirstSeenSeq() : idx;
        info = createTurnInfo(firstSeenSeq);
        collectedByContainer.set(container, info);
        changed = true;
      }

      const hasUserText = typeof info.userText === 'string' && info.userText.trim();
      const hasAssistantText = typeof info.assistantText === 'string' && info.assistantText.trim();

      if (!hasUserText) {
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
        if (userTexts.length > 0) {
          const combinedUserText = normalizeText(userTexts.join('\n'));
          if (combinedUserText) {
            info.userText = combinedUserText;
            changed = true;
          }
        }
      }

      if (!hasAssistantText) {
        const modelRoot = container.querySelector(SELECTORS.modelContent);
        if (modelRoot) {
          const markdownNode = modelRoot.querySelector(SELECTORS.modelMarkdown);
          const assistantText = markdownNode
            ? normalizeText(getNodeText(markdownNode))
            : normalizeText(getNodeText(modelRoot));
          if (assistantText) {
            info.assistantText = assistantText;
            changed = true;
          }
        }
      }
    });

    return changed;
  };

  const createIncrementalCollector = () => {
    const collectedByContainer = new Map();

    let nextFirstSeenSeq = 0;
    const allocateSeq = () => nextFirstSeenSeq++;
    const extractOnce = () => {
      const containers = Array.from(document.querySelectorAll(SELECTORS.turnContainers));
      return extractConversationIncremental(collectedByContainer, allocateSeq, containers, {
        requireVisibleRect: true,
      });
    };

    const hasAnyNonEmptyTurn = () => {
      for (const info of collectedByContainer.values()) {
        const u = typeof info.userText === 'string' ? info.userText.trim() : '';
        const a = typeof info.assistantText === 'string' ? info.assistantText.trim() : '';
        if (u || a) return true;
      }
      return false;
    };

    const toSortedTurns = () =>
      Array.from(collectedByContainer.values()).sort((a, b) => {
        const sa =
          typeof a.firstSeenSeq === 'number' && Number.isFinite(a.firstSeenSeq)
            ? a.firstSeenSeq
            : 0;
        const sb =
          typeof b.firstSeenSeq === 'number' && Number.isFinite(b.firstSeenSeq)
            ? b.firstSeenSeq
            : 0;
        // We discover newest → oldest while scrolling up; emit oldest → newest.
        return sb - sa;
      });

    const toMessages = () => {
      const turns = toSortedTurns();
      const out = [];
      for (const t of turns) {
        const userText = typeof t.userText === 'string' ? normalizeText(t.userText) : '';
        const assistantText =
          typeof t.assistantText === 'string' ? normalizeText(t.assistantText) : '';
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

    return {
      collectedByContainer,
      extractOnce,
      hasAnyNonEmptyTurn,
      toMessages,
    };
  };

  const openConversationInPlace = async (targetUrl) => {
    const targetPath = targetUrl.pathname;
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
      return { ok: true, clicked: true };
    }

    location.assign(targetUrl.toString());
    return { ok: false, error: 'navigation_started' };
  };

  const sidebarCache = {
    items: [],
    seen: new Set(),
    done: false,
  };

  async function ensureSidebarCacheScanned() {
    if (sidebarCache.done) return;

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
      hrefFilter: (href) => typeof href === 'string' && href.includes('/app/'),
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

  async function listConversations({ offset, limit }) {
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

  async function getConversationMessages({ conversationId, conversationUrl }) {
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

    // Phase A — Navigate (router-friendly <a>.click() when possible).
    const nav = await openConversationInPlace(target);
    if (!nav.ok) return nav;

    const collector = createIncrementalCollector();

    // Phase B — Hydration-ready poll (400ms retry).
    const readyDeadline = Date.now() + READY_TIMEOUT_MS;
    let lastContainerCount = 0;
    while (Date.now() < readyDeadline) {
      if (location.pathname !== targetPath) {
        await sleep(READY_POLL_MS);
        continue;
      }

      collector.extractOnce();
      try {
        lastContainerCount = document.querySelectorAll(SELECTORS.turnContainers).length;
      } catch {
        lastContainerCount = 0;
      }

      if (collector.hasAnyNonEmptyTurn()) break;
      await sleep(READY_POLL_MS);
    }

    if (!collector.hasAnyNonEmptyTurn()) {
      const root = findTranscriptRoot();
      const diagnostics = {
        href: String(location.href || ''),
        targetPath,
        currentPath: String(location.pathname || ''),
        readyTimeoutMs: READY_TIMEOUT_MS,
        pollMs: READY_POLL_MS,
        hasTranscriptRoot: Boolean(root),
        containerSelector: SELECTORS.turnContainers,
        containerCount: lastContainerCount,
      };
      const error = `transcript_not_ready:timeout (targetPath=${targetPath}, currentPath=${String(location.pathname || '')}, hasTranscriptRoot=${Boolean(root)}, containerCount=${lastContainerCount})`;
      return { ok: false, error, diagnostics };
    }

    // Phase C — Full incremental capture (virtualization-safe).
    const core = window.__RUMINER_SCAN_CORE__;
    if (!core || typeof core.runScrollMessages !== 'function') {
      collector.extractOnce();
    } else {
      await core.runScrollMessages({
        direction: 'up',
        findScroller: findTranscriptScroller,
        intervalMs: 500,
        stepFactor: 0.8,
        stableDeltaPx: 40,
        stableAttempts: 4,
      });

      // Final extraction once after top stability.
      collector.extractOnce();
    }

    // Phase D — Build output message list.
    const msgs = collector.toMessages();

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
