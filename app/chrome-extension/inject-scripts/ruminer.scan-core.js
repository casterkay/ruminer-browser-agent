/* eslint-disable */
// ruminer.scan-core.js
// Shared scan primitives for injected `ruminer.*-scan.js` scripts (ISOLATED world).
//
// Exposes `window.__RUMINER_SCAN_CORE__`.
//
// Design goals:
// - Simple, deterministic scroll control (no UI prompts/alerts).
// - Minimal stop criterion: at boundary + scrollHeight stable for N attempts.
//
// NOTE: Keep this file dependency-free and safe to inject multiple times.

(() => {
  const VERSION = '2026-03-18.1';
  const LOG = '[ruminer.scan-core]';

  if (window.__RUMINER_SCAN_CORE__ && window.__RUMINER_SCAN_CORE__.version === VERSION) {
    return;
  }

  const sleep = (ms) => {
    const n = typeof ms === 'number' && Number.isFinite(ms) ? Math.floor(ms) : 0;
    const safe = Math.max(0, Math.min(0x7fffffff, n));
    return new Promise((r) => setTimeout(r, safe));
  };

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const isElementVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    let style = null;
    try {
      style = window.getComputedStyle(el);
    } catch {
      style = null;
    }
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return true;
  };

  const isVerticalScrollable = (el) => {
    let style = null;
    try {
      style = window.getComputedStyle(el);
    } catch {
      style = null;
    }
    const oy = style ? String(style.overflowY || '') : '';
    return oy === 'auto' || oy === 'scroll' || oy === 'overlay';
  };

  const hasScrollableAncestor = (el, maxDepth = 8) => {
    let cur = el && el.parentElement ? el.parentElement : null;
    let depth = 0;
    while (cur && depth < maxDepth) {
      if (isElementVisible(cur) && isVerticalScrollable(cur)) return true;
      cur = cur.parentElement;
      depth++;
    }
    return false;
  };

  const hasLocalHref = (el, prefix = '/') => {
    if (!el || typeof el.querySelector !== 'function') return false;
    try {
      return Boolean(el.querySelector(`a[href^="${prefix}"]`));
    } catch {
      return false;
    }
  };

  const findFirstScroller = (selectors) => {
    const list = Array.isArray(selectors) ? selectors.filter(Boolean) : [];

    for (const sel of list) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(sel));
      } catch {
        nodes = [];
      }
      for (const el of nodes) {
        if (!isElementVisible(el)) continue;
        if (!isVerticalScrollable(el)) continue;
        if (!hasLocalHref(el)) continue;
        if (hasScrollableAncestor(el)) continue;
        return el;
      }
    }
    return null;
  };

  const scrollerGetters = (scroller) => {
    const root = scroller || document.scrollingElement || document.documentElement;
    const isWindowLike =
      root === document.documentElement ||
      root === document.body ||
      root === document.scrollingElement;

    const getScrollTop = () => {
      try {
        return Math.max(0, Math.floor(isWindowLike ? window.scrollY : root.scrollTop || 0));
      } catch {
        return 0;
      }
    };

    const getScrollHeight = () => {
      try {
        const h = isWindowLike ? document.documentElement.scrollHeight : root.scrollHeight;
        return Math.max(0, Math.floor(h || 0));
      } catch {
        return 0;
      }
    };

    const getClientHeight = () => {
      try {
        const h = isWindowLike ? window.innerHeight : root.clientHeight;
        return Math.max(0, Math.floor(h || 0));
      } catch {
        return 0;
      }
    };

    const setScrollTop = (top) => {
      const next = Math.max(0, Math.floor(top || 0));
      try {
        if (isWindowLike) window.scrollTo({ top: next, behavior: 'auto' });
        else root.scrollTo({ top: next, behavior: 'auto' });
        return;
      } catch {}
      try {
        if (!isWindowLike) root.scrollTop = next;
      } catch {}
    };

    return { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop };
  };

  /**
   * runScrollMessages
   *
   * Scrolling control for transcript virtualization capture.
   *
   * Default config matches the user-provided contract:
   * - intervalMs: 500ms
   * - stepFactor: 0.8 viewport height
   * - stop: when scrollTop <= 10px and scrollHeight is stable for 4 attempts
   *   where stable := abs(deltaScrollHeight) <= 40px
   *
   * Options:
   * - scroller: Element | null (defaults to document.scrollingElement/documentElement)
   * - direction: 'up' | 'down' (defaults 'up')
   * - intervalMs: number (defaults 500)
   * - stepFactor: number (defaults 0.8)
   * - maxAttempts: number (defaults 900)
   * - topEpsilonPx: number (defaults 10) - boundary threshold for up
   * - bottomEpsilonPx: number (defaults 20) - boundary threshold for down
   * - stableDeltaPx: number (defaults 40)
   * - stableAttempts: number (defaults 4)
   * - onProgress: (d: Diagnostics) => void
   * - findScroller: () => Element | null
   */
  async function runScrollMessages(options = {}) {
    const direction = options.direction === 'down' ? 'down' : 'up';
    const intervalMs =
      typeof options.intervalMs === 'number' && Number.isFinite(options.intervalMs)
        ? clamp(Math.floor(options.intervalMs), 0, 30_000)
        : 500;
    const stepFactor =
      typeof options.stepFactor === 'number' && Number.isFinite(options.stepFactor)
        ? clamp(options.stepFactor, 0.05, 1.0)
        : 0.8;
    const maxAttempts =
      typeof options.maxAttempts === 'number' && Number.isFinite(options.maxAttempts)
        ? clamp(Math.floor(options.maxAttempts), 1, 50_000)
        : 1_000;

    const topEpsilonPx =
      typeof options.topEpsilonPx === 'number' && Number.isFinite(options.topEpsilonPx)
        ? clamp(Math.floor(options.topEpsilonPx), 0, 200)
        : 40;
    const bottomEpsilonPx =
      typeof options.bottomEpsilonPx === 'number' && Number.isFinite(options.bottomEpsilonPx)
        ? clamp(Math.floor(options.bottomEpsilonPx), 0, 400)
        : 40;

    const stableDeltaPx =
      typeof options.stableDeltaPx === 'number' && Number.isFinite(options.stableDeltaPx)
        ? clamp(Math.floor(options.stableDeltaPx), 0, 10_000)
        : 40;
    const stableAttempts =
      typeof options.stableAttempts === 'number' && Number.isFinite(options.stableAttempts)
        ? clamp(Math.floor(options.stableAttempts), 1, 100)
        : 4;

    const findScroller = typeof options.findScroller === 'function' ? options.findScroller : null;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    const scroller = options.scroller || (findScroller ? findScroller() : null);
    const { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop } =
      scrollerGetters(scroller);

    const startedAtMs = Date.now();
    let lastScrollHeight = null;
    let stable = 0;
    let stopReason = null;

    const report = (attempt, phase) => {
      if (!onProgress) return;
      let scrollTop = 0;
      let scrollHeight = 0;
      let clientHeight = 0;
      try {
        scrollTop = getScrollTop();
        scrollHeight = getScrollHeight();
        clientHeight = getClientHeight();
      } catch {}
      onProgress({
        attempt,
        phase,
        direction,
        stable,
        scrollTop,
        scrollHeight,
        clientHeight,
        rootTag: root && root.tagName ? String(root.tagName) : null,
        rootId: root && typeof root.id === 'string' ? root.id : null,
        msSinceStart: Date.now() - startedAtMs,
      });
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      report(attempt, 'before_scroll');

      const beforeTop = getScrollTop();
      const beforeH = getScrollHeight();
      const clientH = getClientHeight();
      const step = Math.max(120, Math.floor(clientH * stepFactor));

      const targetTop = direction === 'up' ? Math.max(0, beforeTop - step) : beforeTop + step;
      setScrollTop(targetTop);

      await sleep(intervalMs);

      report(attempt, 'after_scroll');

      const afterTop = getScrollTop();
      const afterH = getScrollHeight();
      const afterClientH = getClientHeight();

      const atBoundary =
        direction === 'up'
          ? afterTop <= topEpsilonPx
          : afterTop + afterClientH >= afterH - bottomEpsilonPx;

      // Only count stability once we're at the boundary; this avoids premature stops mid-scroll.
      if (atBoundary && lastScrollHeight !== null) {
        const delta = Math.abs(afterH - lastScrollHeight);
        if (delta <= stableDeltaPx) stable += 1;
        else stable = 0;
      } else {
        stable = 0;
      }

      lastScrollHeight = afterH;

      if (atBoundary && stable >= stableAttempts) {
        stopReason =
          direction === 'up'
            ? `top_stable_scrollHeight<=${stableDeltaPx}px_for_${stableAttempts}_attempts`
            : `bottom_stable_scrollHeight<=${stableDeltaPx}px_for_${stableAttempts}_attempts`;
        break;
      }

      // Guard: if we tried to scroll but didn't move and we're at boundary, allow stability to finish quickly.
      // (Elastic / anchoring can keep scrollTop pinned; stability counter handles the rest.)
      if (direction === 'up' && beforeTop <= topEpsilonPx && afterTop <= topEpsilonPx) {
        // nothing
      } else if (
        direction === 'down' &&
        beforeTop + clientH >= beforeH - bottomEpsilonPx &&
        afterTop + afterClientH >= afterH - bottomEpsilonPx
      ) {
        // nothing
      }
    }

    if (!stopReason) stopReason = `max_attempts:${maxAttempts}`;

    return {
      ok: true,
      stopReason,
      direction,
      intervalMs,
      stepFactor,
      maxAttempts,
      stableDeltaPx,
      stableAttempts,
      topEpsilonPx,
      bottomEpsilonPx,
      final: {
        scrollTop: getScrollTop(),
        scrollHeight: getScrollHeight(),
        clientHeight: getClientHeight(),
        stable,
      },
      timing: {
        startedAtMs,
        endedAtMs: Date.now(),
        durationMs: Date.now() - startedAtMs,
      },
    };
  }

  /**
   * runScrollConversations
   *
   * Scrolls a sidebar-like scroller downward until bottom stability and extracts internal hrefs.
   *
   * Defaults:
   * - intervalMs: 500ms
   * - stepFactor: 0.8 viewport height
   * - stop: bottom stable when abs(delta scrollHeight) <= 40px for 4 attempts
   *
   * Options:
   * - scroller: Element | null
   * - findScroller: () => Element | null
   * - intervalMs, stepFactor, maxAttempts, stableDeltaPx, stableAttempts
   * - bottomEpsilonPx: number (defaults 10)
   * - hrefFilter: (href: string) => boolean (defaults href startsWith '/')
   */
  async function runScrollConversations(options = {}) {
    const intervalMs =
      typeof options.intervalMs === 'number' && Number.isFinite(options.intervalMs)
        ? clamp(Math.floor(options.intervalMs), 0, 30_000)
        : 500;
    const stepFactor =
      typeof options.stepFactor === 'number' && Number.isFinite(options.stepFactor)
        ? clamp(options.stepFactor, 0.05, 1.0)
        : 0.8;
    const maxAttempts =
      typeof options.maxAttempts === 'number' && Number.isFinite(options.maxAttempts)
        ? clamp(Math.floor(options.maxAttempts), 1, 50_000)
        : 600;
    const stableDeltaPx =
      typeof options.stableDeltaPx === 'number' && Number.isFinite(options.stableDeltaPx)
        ? clamp(Math.floor(options.stableDeltaPx), 0, 10_000)
        : 40;
    const stableAttempts =
      typeof options.stableAttempts === 'number' && Number.isFinite(options.stableAttempts)
        ? clamp(Math.floor(options.stableAttempts), 1, 100)
        : 4;
    const bottomEpsilonPx =
      typeof options.bottomEpsilonPx === 'number' && Number.isFinite(options.bottomEpsilonPx)
        ? clamp(Math.floor(options.bottomEpsilonPx), 0, 200)
        : 10;

    const hrefFilter =
      typeof options.hrefFilter === 'function'
        ? options.hrefFilter
        : (href) => href.startsWith('/');
    const findScroller = typeof options.findScroller === 'function' ? options.findScroller : null;

    const scroller = options.scroller || (findScroller ? findScroller() : null);
    const { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop } =
      scrollerGetters(scroller);

    const links = new Set();
    const startedAtMs = Date.now();
    let lastScrollHeight = null;
    let stable = 0;
    let stopReason = null;

    const extractAnchorsOnce = () => {
      const queryRoot = root && typeof root.querySelectorAll === 'function' ? root : document;
      let anchors = [];
      try {
        anchors = Array.from(queryRoot.querySelectorAll('a[href]'));
      } catch {
        anchors = [];
      }
      for (const a of anchors) {
        let href = '';
        try {
          href = String(a.getAttribute('href') || '');
        } catch {
          href = '';
        }
        if (!href) continue;
        if (!hrefFilter(href)) continue;
        try {
          links.add(new URL(href, location.origin).toString());
        } catch {}
      }
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      extractAnchorsOnce();

      const beforeTop = getScrollTop();
      const beforeH = getScrollHeight();
      const clientH = getClientHeight();
      const step = Math.max(120, Math.floor(clientH * stepFactor));
      setScrollTop(beforeTop + step);

      await sleep(intervalMs);

      const afterTop = getScrollTop();
      const afterH = getScrollHeight();
      const afterClientH = getClientHeight();

      const atBottom = afterTop + afterClientH >= afterH - bottomEpsilonPx;

      if (atBottom && lastScrollHeight !== null) {
        const delta = Math.abs(afterH - lastScrollHeight);
        if (delta <= stableDeltaPx) stable += 1;
        else stable = 0;
      } else {
        stable = 0;
      }
      lastScrollHeight = afterH;

      if (atBottom && stable >= stableAttempts) {
        stopReason = `bottom_stable_scrollHeight<=${stableDeltaPx}px_for_${stableAttempts}_attempts`;
        break;
      }

      // If nothing moved and we're at bottom, allow stability counter to do the stopping.
      if (afterTop === beforeTop && atBottom && lastScrollHeight !== null) {
        // no-op
      }
    }

    extractAnchorsOnce();
    if (!stopReason) stopReason = `max_attempts:${maxAttempts}`;

    return {
      ok: true,
      stopReason,
      intervalMs,
      stepFactor,
      maxAttempts,
      stableDeltaPx,
      stableAttempts,
      bottomEpsilonPx,
      final: {
        scrollTop: getScrollTop(),
        scrollHeight: getScrollHeight(),
        clientHeight: getClientHeight(),
        stable,
        hrefCount: links.size,
      },
      hrefs: Array.from(links),
      timing: {
        startedAtMs,
        endedAtMs: Date.now(),
        durationMs: Date.now() - startedAtMs,
      },
    };
  }

  window.__RUMINER_SCAN_CORE__ = {
    version: VERSION,
    runScrollMessages,
    runScrollConversations,
    scrollerGetters,
    findFirstScroller,
  };

  try {
    console.debug(LOG, 'loaded', { version: VERSION });
  } catch {}
})();
