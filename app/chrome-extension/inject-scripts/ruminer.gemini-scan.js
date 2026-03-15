/* eslint-disable */
// ruminer.gemini-scan.js
// Injected into gemini.google.com pages (ISOLATED world). Exposes `window.__RUMINER_SCAN__`.

(() => {
  const PLATFORM = 'gemini';
  const VERSION = '2026-03-15.2';
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
      });
    } catch {}
  };

  installRpc();
  if (sameApi) return;

  const SELECTORS = {
    // Incremental extractor defaults (mirrors gemini-export conversation_extractor.js).
    turnContainers: '#chat-history .conversation-container',
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
  const MAX_SCROLL_STEPS = 300;
  const STABILITY_CHECKS = 3;

  const getNodeText = (node) => {
    if (!node) return '';
    return String(node.innerText || node.textContent || '').trim();
  };

  // Matches gemini-export normalizeText(): CRLF→LF, collapse excessive blank lines, trim.
  const normalizeText = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  // Backwards-compat internal helper name (used by hashing utilities below).
  const normalizeContent = normalizeText;

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
        content: normalizeText(content),
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

  const isProbablyVisible = (element) => {
    if (!element || element.nodeType !== 1) return false;
    let style;
    try {
      style = window.getComputedStyle(element);
    } catch {
      style = null;
    }
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return true;
    return rect.width > 0 && rect.height > 0;
  };

  const extractConversationIncremental = (collectedByContainer, allocateFirstSeenSeq) => {
    if (!collectedByContainer || typeof collectedByContainer.get !== 'function') return false;

    let changed = false;
    const containers = Array.from(document.querySelectorAll(SELECTORS.turnContainers));

    containers.forEach((container, idx) => {
      if (!isProbablyVisible(container)) return;

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
    const extractOnce = () =>
      extractConversationIncremental(collectedByContainer, () => nextFirstSeenSeq++);

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

    const scroller = findSidebarScroller();
    let stable = 0;
    let lastCount = sidebarCache.items.length;

    for (let i = 0; i < 80 && sidebarCache.items.length < targetCount; i++) {
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

    if (sidebarCache.items.length === lastCount) {
      // Could not grow further; treat as done.
      sidebarCache.done = true;
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
    let target;
    try {
      target = new URL(url, location.origin);
    } catch {
      throw new Error(`Invalid conversationUrl: ${url}`);
    }

    const targetPath = target.pathname;

    // Phase A — Navigate (router-friendly <a>.click() when possible).
    const opened = await openConversationInPlace(url);
    if (opened === false) return { ok: false, error: 'navigation_started' };

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
    const { getScrollTop, getScrollHeight, getClientHeight, setScrollTop } =
      scrollerGetters(scroller);

    // Single-direction capture: collect while scrolling up until top stability.
    // Assumption: after opening a conversation, Gemini is already at/near the end (no missing content below).
    let topStable = 0;
    let lastSize = collector.collectedByContainer.size;
    let lastScrollHeight = -1;
    let noMove = 0;

    for (let i = 0; i < MAX_SCROLL_STEPS; i++) {
      collector.extractOnce();

      const beforeTop = getScrollTop();
      const clientH = getClientHeight();
      const step = Math.max(240, Math.floor(clientH * 0.9));
      const nextTop = Math.max(0, beforeTop - step);

      if (beforeTop > 0) setScrollTop(nextTop);
      await sleep(SCROLL_STEP_SLEEP_MS);
      collector.extractOnce();

      const afterTop = getScrollTop();
      const afterScrollH = getScrollHeight();
      const sizeNow = collector.collectedByContainer.size;
      const atTopNow = afterTop <= 0;

      if (afterTop === beforeTop) noMove += 1;
      else noMove = 0;

      if (atTopNow && sizeNow === lastSize && afterScrollH === lastScrollHeight) topStable += 1;
      else topStable = 0;

      lastSize = sizeNow;
      lastScrollHeight = afterScrollH;

      if (topStable >= STABILITY_CHECKS) break;
      if (noMove >= 5 && beforeTop > 0) break;
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
