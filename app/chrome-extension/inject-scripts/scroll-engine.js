/* eslint-disable */
// scroll-engine.js
// Shared scrolling primitives for injected `ruminer.{platform}.js` scripts (ISOLATED world).
//
// Exposes `window.__RUMINER_SCROLL_ENGINE__`.
//
// Design goals:
// - Deterministic "page" scrolling suitable for lazy-loaded UIs.
// - Async generator API for composability + early-stopping callbacks.
// - Dependency-free and safe to inject multiple times.

(() => {
  const VERSION = '2026-03-30.1';
  const LOG = '[ruminer.scroll-engine]';

  if (window.__RUMINER_SCROLL_ENGINE__ && window.__RUMINER_SCROLL_ENGINE__.version === VERSION) {
    return;
  }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const sleep = (ms) => {
    const n = typeof ms === 'number' && Number.isFinite(ms) ? Math.floor(ms) : 0;
    const safe = Math.max(0, Math.min(0x7fffffff, n));
    return new Promise((r) => setTimeout(r, safe));
  };

  const isElementVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.hasAttribute?.('hidden')) return false;
      if (el.getAttribute?.('aria-hidden') === 'true') return false;
    } catch {}
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

  const findScrollableAncestor = (startEl, maxDepth = 12) => {
    let cur = startEl && startEl.nodeType === 1 ? startEl : null;
    let depth = 0;
    while (cur && depth < maxDepth) {
      if (isVerticalScrollable(cur)) return cur;
      cur = cur.parentElement;
      depth++;
    }
    return null;
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
   * scrollPages (async generator)
   *
   * Scrolls a scroller in "pages" (viewport fractions) and yields diagnostics each step.
   * Built-in stopping detects boundary + stable scrollHeight for N attempts.
   *
   * Options:
   * - scroller: Element | null
   * - findScroller: () => Element | null
   * - direction: 'up' | 'down' (required)
   * - intervalMs: number (default 100)
   * - intervalMsAtBoundary: number (default 500)
   * - pageFactor: number (default 1.0)
   * - maxPages: number (default 1000)
   * - yieldInitial: boolean (default true)
   * - topEpsilonPx: number (default 20)
   * - bottomEpsilonPx: number (default 20)
   * - stableDeltaPx: number (default 50)
   * - stableAttempts: number (default 4)
   */
  async function* scrollPages(options = {}) {
    const direction = options.direction === 'down' ? 'down' : 'up';
    const intervalMs =
      typeof options.intervalMs === 'number' && Number.isFinite(options.intervalMs)
        ? clamp(Math.floor(options.intervalMs), 0, 30_000)
        : 100;
    const intervalMsAtBoundary =
      typeof options.intervalMsAtBoundary === 'number' &&
      Number.isFinite(options.intervalMsAtBoundary)
        ? clamp(Math.floor(options.intervalMsAtBoundary), 0, 30_000)
        : 500;
    const pageFactor =
      typeof options.pageFactor === 'number' && Number.isFinite(options.pageFactor)
        ? clamp(options.pageFactor, 0.05, 1.0)
        : 1.0;
    const maxPages =
      typeof options.maxPages === 'number' && Number.isFinite(options.maxPages)
        ? clamp(Math.floor(options.maxPages), 1, 100_000)
        : 1000;

    const yieldInitial = options.yieldInitial !== false;
    const topEpsilonPx =
      typeof options.topEpsilonPx === 'number' && Number.isFinite(options.topEpsilonPx)
        ? clamp(Math.floor(options.topEpsilonPx), 0, 400)
        : 20;
    const bottomEpsilonPx =
      typeof options.bottomEpsilonPx === 'number' && Number.isFinite(options.bottomEpsilonPx)
        ? clamp(Math.floor(options.bottomEpsilonPx), 0, 400)
        : 20;
    const stableDeltaPx =
      typeof options.stableDeltaPx === 'number' && Number.isFinite(options.stableDeltaPx)
        ? clamp(Math.floor(options.stableDeltaPx), 0, 10_000)
        : 50;
    const stableAttempts =
      typeof options.stableAttempts === 'number' && Number.isFinite(options.stableAttempts)
        ? clamp(Math.floor(options.stableAttempts), 1, 100)
        : 4;

    const findScroller = typeof options.findScroller === 'function' ? options.findScroller : null;
    const scroller = options.scroller || (findScroller ? findScroller() : null);
    const { root, getScrollTop, getScrollHeight, getClientHeight, setScrollTop } =
      scrollerGetters(scroller);

    const startedAtMs = Date.now();
    let lastScrollHeight = null;
    let stable = 0;

    const snapshot = (pageIndex, phase, atBoundary) => {
      const scrollTop = getScrollTop();
      const scrollHeight = getScrollHeight();
      const clientHeight = getClientHeight();
      return {
        pageIndex,
        phase,
        direction,
        atBoundary: Boolean(atBoundary),
        stableCount: stable,
        scrollTop,
        scrollHeight,
        clientHeight,
        rootTag: root && root.tagName ? String(root.tagName) : null,
        rootId: root && typeof root.id === 'string' ? root.id : null,
        msSinceStart: Date.now() - startedAtMs,
        params: {
          intervalMs,
          pageFactor,
          maxPages,
          topEpsilonPx,
          bottomEpsilonPx,
          stableDeltaPx,
          stableAttempts,
        },
      };
    };

    if (yieldInitial) {
      yield snapshot(0, 'initial', false);
    }

    for (let i = 0; i < maxPages; i++) {
      const beforeTop = getScrollTop();
      const beforeH = getScrollHeight();
      const clientH = getClientHeight();
      const step = Math.max(120, Math.floor(clientH * pageFactor));

      const targetTop = direction === 'up' ? Math.max(0, beforeTop - step) : beforeTop + step;
      setScrollTop(targetTop);

      if (stable > 0) {
        await sleep(intervalMsAtBoundary);
      } else {
        await sleep(intervalMs);
      }

      const afterTop = getScrollTop();
      const afterH = getScrollHeight();
      const afterClientH = getClientHeight();

      const atBoundary =
        direction === 'up'
          ? afterTop <= topEpsilonPx
          : afterTop + afterClientH >= afterH - bottomEpsilonPx;

      if (atBoundary && lastScrollHeight !== null) {
        const delta = Math.abs(afterH - lastScrollHeight);
        if (delta <= stableDeltaPx) stable += 1;
        else stable = 0;
      } else {
        stable = 0;
      }

      lastScrollHeight = afterH;

      const state = snapshot(i + 1, 'after_scroll', atBoundary);
      yield state;

      if (atBoundary && stable >= stableAttempts) {
        return;
      }

      // If we didn't move and we're at boundary, allow stability to finish quickly.
      if (direction === 'up' && beforeTop <= topEpsilonPx && afterTop <= topEpsilonPx) {
        // no-op
      } else if (
        direction === 'down' &&
        beforeTop + clientH >= beforeH - bottomEpsilonPx &&
        afterTop + afterClientH >= afterH - bottomEpsilonPx
      ) {
        // no-op
      }
    }
  }

  /**
   * runScrollPages
   *
   * Convenience wrapper over scrollPages() that supports an async onPage callback.
   * If onPage returns false, scrolling stops early.
   */
  async function runScrollPages(options = {}) {
    const onPage = typeof options.onPage === 'function' ? options.onPage : null;
    const pages = [];
    let last = null;
    let stopReason = null;

    try {
      for await (const state of scrollPages(options)) {
        last = state;
        pages.push(state);
        if (onPage) {
          const keepGoing = await Promise.resolve(onPage(state));
          if (keepGoing === false) {
            stopReason = 'callback_stop';
            break;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stopReason = `error:${msg}`;
    }

    if (!stopReason) {
      if (last && last.atBoundary && last.stableCount >= (last?.params?.stableAttempts ?? 0)) {
        stopReason = last.direction === 'up' ? 'top_stable' : 'bottom_stable';
      } else if (last) {
        stopReason = 'max_pages';
      } else {
        stopReason = 'no_pages';
      }
    }

    return { ok: true, stopReason, pages, last };
  }

  window.__RUMINER_SCROLL_ENGINE__ = {
    version: VERSION,
    isElementVisible,
    isVerticalScrollable,
    findScrollableAncestor,
    scrollerGetters,
    findFirstScroller,
    scrollPages,
    runScrollPages,
  };

  try {
    console.debug(LOG, 'loaded', { version: VERSION });
  } catch {}
})();
