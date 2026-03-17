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
  const SCROLL_STEP_SLEEP_MS = 220;
  const MAX_SCROLL_STEPS = 900;
  const STABILITY_CHECKS = 3;
  const TOP_IDLE_STABLE_MS = 1_000;
  const TOP_MAX_WAIT_MS = 2_000;
  const TOP_IDLE_SLEEP_MS = 520;

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

  const getElementKey = (() => {
    const keys = new WeakMap();
    let next = 1;
    return (el) => {
      if (!el || (typeof el !== 'object' && typeof el !== 'function')) return null;
      const existing = keys.get(el);
      if (existing) return existing;
      const id = next++;
      keys.set(el, id);
      return id;
    };
  })();

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const getSentinelTurnContainer = (scrollerRoot) => {
    const vw = Math.max(0, window.innerWidth || document.documentElement?.clientWidth || 0);
    const vh = Math.max(0, window.innerHeight || document.documentElement?.clientHeight || 0);
    if (!(vw > 0 && vh > 0)) return null;

    let rect = null;
    try {
      if (
        scrollerRoot &&
        scrollerRoot !== document.documentElement &&
        scrollerRoot !== document.body &&
        typeof scrollerRoot.getBoundingClientRect === 'function'
      ) {
        rect = scrollerRoot.getBoundingClientRect();
      }
    } catch {
      rect = null;
    }

    const r = rect
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      : { left: 0, top: 0, width: vw, height: vh };

    const xs = [
      r.left + r.width * 0.5,
      r.left + Math.min(48, r.width * 0.2),
      r.left + Math.max(16, r.width * 0.35),
    ]
      .filter((x) => Number.isFinite(x))
      .map((x) => clamp(Math.floor(x), 1, vw - 2));

    const ys = [r.top + 24, r.top + 64, r.top + 120, r.top + 180]
      .filter((y) => Number.isFinite(y))
      .map((y) => clamp(Math.floor(y), 1, vh - 2));

    for (const y of ys) {
      for (const x of xs) {
        const el = document.elementFromPoint(x, y);
        if (!el) continue;
        try {
          const container =
            el.closest?.(SELECTORS.turnContainer) || el.closest?.(SELECTORS.turnContainers) || null;
          if (container) return container;
        } catch {}
      }
    }
    return null;
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

  const collectTurnContainersFromSentinel = (sentinelContainer, maxCount = 4) => {
    if (!sentinelContainer || sentinelContainer.nodeType !== 1) return [];
    const transcriptRoot =
      sentinelContainer.closest?.('#chat-history') || findTranscriptRoot() || document.body;

    const out = [];
    out.push(sentinelContainer);

    let cur = sentinelContainer;
    while (out.length < maxCount) {
      const next = findNextTurnContainer(cur, transcriptRoot);
      if (!next) break;
      out.push(next);
      cur = next;
    }
    return out;
  };

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

  const findTranscriptRoot = () => {
    return (
      document.querySelector('#chat-history') ||
      document.querySelector('chat-history') ||
      document.querySelector('[data-test-id*="chat-history"]') ||
      document.querySelector('[data-testid*="chat-history"]') ||
      null
    );
  };

  const isMapRelatedElement = (element) => {
    if (!element || typeof element.matches !== 'function') return false;
    if (element.matches('maps, .map, .gm-style, .gm-style-moc, .gm-style-cc, .gmnoprint'))
      return true;
    return Boolean(element.closest('maps, .gm-style, .gm-style-moc, .gm-style-cc, .gmnoprint'));
  };

  const containsChatMarkers = (element) => {
    if (!element || typeof element.querySelector !== 'function') return false;
    const selectorPool = [
      '#chat-history',
      '.chat-history-scroll-container',
      'chat-history',
      'infinite-scroller',
      '[data-test-id="chat-history-container"]',
      'user-query',
      'model-response',
      '.conversation-container',
    ].filter(Boolean);

    try {
      return Boolean(element.querySelector(selectorPool.join(', ')));
    } catch {
      return false;
    }
  };

  const isUsableScrollerElement = (element) => {
    if (!element || element.nodeType !== 1) return false;
    if (isMapRelatedElement(element)) return false;

    if (element === document.documentElement || element === document.body) {
      const root = document.scrollingElement || document.documentElement;
      return root && root.scrollHeight > root.clientHeight + 20;
    }

    let style;
    try {
      style = window.getComputedStyle(element);
    } catch {
      return false;
    }

    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    if (!['auto', 'scroll', 'overlay'].includes(style.overflowY)) return false;
    if (element.scrollHeight <= element.clientHeight + 20) return false;

    const rect = element.getBoundingClientRect();
    if (!rect || rect.height < 120 || rect.width < 120) return false;

    return true;
  };

  const getScrollerCandidateScore = (element) => {
    if (!isUsableScrollerElement(element)) return Number.NEGATIVE_INFINITY;

    let score = Math.max(0, element.scrollHeight - element.clientHeight);
    const rect = element.getBoundingClientRect();
    const markerBonus = containsChatMarkers(element) ? 5000 : 0;

    if (rect.height >= window.innerHeight * 0.5) score += 1400;
    if (rect.width >= window.innerWidth * 0.35) score += 400;
    if (markerBonus) score += markerBonus;

    if (
      element.matches(
        [
          '.chat-scrollable-container',
          '.chat-history-scroll-container',
          'chat-history-scroll-container',
          'mat-sidenav-content',
          'infinite-scroller',
          '[data-test-id="chat-history-container"]',
        ].join(', '),
      )
    ) {
      score += 1200;
    }

    if (element.id === 'chat-history' || element.closest('#chat-history')) {
      score += 700;
    }

    return score;
  };

  const pickBestScroller = (candidates) => {
    const unique = [];
    const seen = new Set();
    for (const el of candidates) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      unique.push(el);
    }

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const el of unique) {
      const score = getScrollerCandidateScore(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  };

  const getTranscriptScroller = () => {
    // Strategy 1: known direct selectors (from gemini-export scroller.js).
    const directSelectors = [
      '.chat-scrollable-container',
      '.chat-history-scroll-container',
      'chat-history-scroll-container',
      'infinite-scroller',
      '[data-test-id="chat-history-container"]',
      '#chat-history',
      'chat-history',
      'main',
      'mat-sidenav-content',
      '.chat-history',
    ];

    const directCandidates = [];
    for (const sel of directSelectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => directCandidates.push(el));
      } catch {}
    }

    const pickedDirect = pickBestScroller(directCandidates);
    if (pickedDirect) return pickedDirect;

    // Strategy 2: walk up from message nodes and score usable scrollers.
    const messageNodes = Array.from(
      document.querySelectorAll(
        [
          '#chat-history .conversation-container',
          '#chat-history user-query',
          '#chat-history model-response',
          '.conversation-container',
          'user-query',
          'model-response',
        ].join(', '),
      ),
    ).slice(0, 80);

    if (messageNodes.length > 0) {
      const ancestorCandidates = [];
      for (const node of messageNodes) {
        let current = node;
        let depth = 0;
        while (current && depth < 14) {
          ancestorCandidates.push(current);
          current = current.parentElement;
          depth++;
        }
      }
      const pickedAncestor = pickBestScroller(ancestorCandidates);
      if (pickedAncestor) return pickedAncestor;
    }

    // Strategy 3: fallback.
    return document.scrollingElement || document.documentElement || document.body;
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
    const extractNearSentinel = (sentinelContainer, maxCount = 4) => {
      const list = collectTurnContainersFromSentinel(sentinelContainer, maxCount);
      if (!list || list.length === 0) return false;
      return extractConversationIncremental(collectedByContainer, allocateSeq, list);
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
      extractNearSentinel,
      hasAnyNonEmptyTurn,
      toMessages,
    };
  };

  const scrollerGetters = (scroller) => {
    const root = scroller || document.scrollingElement || document.documentElement;
    const getScrollTop = () => Math.max(0, Math.floor(root.scrollTop || 0));
    const getScrollHeight = () => Math.max(0, Math.floor(root.scrollHeight || 0));
    const getClientHeight = () => Math.max(0, Math.floor(root.clientHeight || 0));
    const setScrollTop = (top) => {
      const next = Math.max(0, Math.floor(top || 0));
      try {
        root.scrollTo({ top: next, behavior: 'auto' });
      } catch {
        try {
          root.scrollTop = next;
        } catch {}
      }
    };
    return { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop };
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

  async function ensureSidebarCacheSize(targetCount) {
    if (sidebarCache.done) return;
    if (sidebarCache.items.length >= targetCount) return;

    const scroller = findSidebarScroller();
    let queryRoot =
      scroller && typeof scroller.querySelectorAll === 'function'
        ? scroller
        : document.documentElement || document;
    try {
      if (queryRoot !== document.documentElement && !queryRoot.querySelector('a[href*="/app/"]')) {
        queryRoot = document.documentElement || document;
      }
    } catch {}
    let stable = 0;
    let lastCount = sidebarCache.items.length;

    for (let i = 0; i < 80 && sidebarCache.items.length < targetCount; i++) {
      const anchors = Array.from(queryRoot.querySelectorAll('a[href]'));
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

      if (sidebarCache.items.length === lastCount) stable += 1;
      else stable = 0;
      lastCount = sidebarCache.items.length;

      if (stable >= 5) {
        sidebarCache.done = true;
        break;
      }

      if (scroller) {
        scroller.scrollTop = Math.min(
          scroller.scrollHeight,
          scroller.scrollTop + Math.max(200, Math.floor(scroller.clientHeight * 0.8)),
        );
      }
      await sleep(200);
    }
  }

  async function listConversations({ offset, limit }) {
    const OFF =
      typeof offset === 'number' && Number.isFinite(offset)
        ? clamp(Math.floor(offset), 0, 1_000_000)
        : 0;
    const LIM =
      typeof limit === 'number' && Number.isFinite(limit) ? clamp(Math.floor(limit), 1, 200) : 100;
    const target = OFF + LIM;
    await ensureSidebarCacheSize(target);
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
    const scroller = getTranscriptScroller();
    const { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop } =
      scrollerGetters(scroller);

    // Single-direction capture: collect while scrolling up until top stability.
    // Assumption: after opening a conversation, Gemini is already at/near the end (no missing content below).
    let topStable = 0;
    let lastSize = collector.collectedByContainer.size;
    let lastScrollHeight = -1;
    let noMove = 0;
    let lastCollectorChangeAt = Date.now();
    let atTopSince = null;
    let lastSentinelKey = null;
    let lastExtractAt = 0;
    let lastFallbackFullScanAt = 0;

    const maybeExtractNearSentinel = (sentinelContainer, force = false) => {
      const now = Date.now();
      if (!sentinelContainer) return false;

      const key = getElementKey(sentinelContainer);
      const sameSentinel = key && lastSentinelKey === key;
      if (!force) {
        // If the sentinel hasn't changed, throttle extraction to still catch hydration.
        if (sameSentinel && now - lastExtractAt < 700) return false;
      }

      const changed = collector.extractNearSentinel(sentinelContainer, 4);
      if (key) lastSentinelKey = key;
      lastExtractAt = now;
      if (changed) lastCollectorChangeAt = now;
      return changed;
    };

    for (let i = 0; i < MAX_SCROLL_STEPS; i++) {
      const sentinelBefore = getSentinelTurnContainer(root);
      if (sentinelBefore) {
        maybeExtractNearSentinel(sentinelBefore, i === 0);
      } else {
        const now = Date.now();
        // Sentinel missing can happen due to overlays/sticky headers; avoid hammering a full scan.
        if (now - lastFallbackFullScanAt >= 1_200) {
          if (collector.extractOnce()) lastCollectorChangeAt = now;
          lastFallbackFullScanAt = now;
        }
      }

      const beforeTop = getScrollTop();
      const clientH = getClientHeight();
      const step = Math.max(240, Math.floor(clientH * 0.9));
      const nextTop = Math.max(0, beforeTop - step);

      if (beforeTop > 0) setScrollTop(nextTop);

      const idleMs = Date.now() - lastCollectorChangeAt;
      const sleepMs =
        beforeTop <= 0 && idleMs >= 600
          ? Math.max(SCROLL_STEP_SLEEP_MS, TOP_IDLE_SLEEP_MS)
          : SCROLL_STEP_SLEEP_MS;
      await sleep(sleepMs);

      const afterTop = getScrollTop();
      const afterScrollH = getScrollHeight();
      const sizeNow = collector.collectedByContainer.size;
      const atTopNow = afterTop <= 10;
      const now = Date.now();

      const sentinelAfter = getSentinelTurnContainer(root);
      if (sentinelAfter) {
        // If scrollHeight changed, force an extract even if sentinel identity didn't.
        const scrollHeightChanged = afterScrollH !== lastScrollHeight;
        maybeExtractNearSentinel(sentinelAfter, scrollHeightChanged);
      } else if (now - lastFallbackFullScanAt >= 1_200) {
        if (collector.extractOnce()) lastCollectorChangeAt = now;
        lastFallbackFullScanAt = now;
      }

      if (afterTop === beforeTop) noMove += 1;
      else noMove = 0;

      if (atTopNow) {
        if (atTopSince === null) atTopSince = now;
        // At the very top, force periodic extraction to catch late prepends/hydration even if the sentinel
        // element doesn't change (some UIs mutate content within the same container).
        if (now - lastExtractAt >= 500) {
          const topSentinel = sentinelAfter || sentinelBefore;
          if (topSentinel) maybeExtractNearSentinel(topSentinel, true);
        }
        // Gemini often keeps reflowing (images/markdown) even after the message list is complete.
        // Waiting for scrollHeight to be stable can therefore stall for seconds while we are already done.
        if (now - lastCollectorChangeAt >= TOP_IDLE_STABLE_MS) break;
        if (now - atTopSince >= TOP_MAX_WAIT_MS) break;
      } else {
        atTopSince = null;
      }

      if (atTopNow && sizeNow === lastSize && afterScrollH === lastScrollHeight) topStable += 1;
      else topStable = 0;

      lastSize = sizeNow;
      lastScrollHeight = afterScrollH;

      if (topStable >= STABILITY_CHECKS) break;
      if (noMove >= 5 && beforeTop > 0) break;
    }

    // One last pass to capture any late-hydrated text before materializing messages.
    const finalSentinel = getSentinelTurnContainer(root);
    if (finalSentinel) collector.extractNearSentinel(finalSentinel, 4);
    else collector.extractOnce();

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
