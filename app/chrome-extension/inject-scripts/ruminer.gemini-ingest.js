/* eslint-disable */
// ruminer.gemini-ingest.js
// Injected into gemini.google.com pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'gemini';
  const VERSION = '2026-03-13.2';
  const LOG = '[ruminer.gemini-ingest]';

  const existing = window.__RUMINER_INGEST__;
  if (existing && existing.platform === PLATFORM && existing.version === VERSION) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(String(urlString || ''), location.origin);
      const m = String(u.pathname || '').match(/^\/app\/([^/?#]+)/);
      const id = m ? String(m[1] || '').trim() : '';
      return id && id.toLowerCase() !== 'new' ? id : '';
    } catch {
      return '';
    }
  };

  const findScroller = () => {
    const chatHistory =
      document.querySelector('#chat-history') || document.querySelector('chat-history');

    // Prefer a transcript-local scroller (never scroll the app shell / history list).
    if (chatHistory) {
      const preferredSelectors = [
        '.chat-scrollable-container',
        '.chat-history-scroll-container',
        'chat-history-scroll-container',
        'infinite-scroller',
        '[data-test-id="chat-history-container"]',
      ];
      for (const sel of preferredSelectors) {
        const el =
          chatHistory.closest(sel) || chatHistory.querySelector(sel) || document.querySelector(sel);
        if (el && el.contains(chatHistory)) return el;
      }

      let current = chatHistory;
      for (let i = 0; i < 20 && current; i++) {
        const parent = current.parentElement;
        if (!parent) break;

        // Explicitly avoid scrolling top-level containers that can scroll the conversation list.
        if (parent.matches('mat-sidenav-content, main')) {
          current = parent;
          continue;
        }

        let style;
        try {
          style = getComputedStyle(parent);
        } catch {
          style = null;
        }

        const overflowY = style ? style.overflowY : '';
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
          return parent;
        }

        current = parent;
      }
    }

    return document.scrollingElement || document.documentElement;
  };

  const extractVisibleMessages = () => {
    const containers = Array.from(
      document.querySelectorAll('#chat-history .conversation-container'),
    );
    const out = [];
    for (const c of containers) {
      const userNode =
        c.querySelector('user-query .query-text-line') ||
        c.querySelector('user-query .query-text p') ||
        c.querySelector('user-query .query-text');
      const userText = userNode ? normalizeContent(userNode.textContent || '') : '';
      if (userText) out.push({ role: 'user', content: userText });

      const modelNode =
        c.querySelector('.model-response-text .markdown') ||
        c.querySelector('.response-container-content') ||
        c.querySelector('model-response');
      const modelText = modelNode ? normalizeContent(modelNode.textContent || '') : '';
      if (modelText) out.push({ role: 'assistant', content: modelText });
    }
    return out;
  };

  async function extractConversation({ conversationUrl }) {
    const rawUrl = String(location.href || conversationUrl || '').trim();
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.hostname !== 'gemini.google.com')
      throw new Error('Not on gemini.google.com');

    const conversationId = parseConversationId(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    // Best-effort: scroll down to materialize virtualized turns.
    const scroller = findScroller();
    const seen = new Set();
    const messages = [];

    let stable = 0;
    for (let i = 0; i < 120; i++) {
      const visible = extractVisibleMessages();
      for (const msg of visible) {
        const key = msg.role + '\n' + msg.content;
        if (seen.has(key)) continue;
        seen.add(key);
        messages.push(msg);
      }

      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        scroller.scrollTop + Math.max(200, Math.floor(scroller.clientHeight * 0.9)),
      );
      await sleep(250);
      const after = scroller.scrollTop;
      if (after === before) stable += 1;
      else stable = 0;
      if (stable >= 5) break;
    }

    const titleNode =
      document.querySelector('.top-bar-actions .conversation-title') ||
      document.querySelector('.selected .conversation-title') ||
      document.querySelector('h1');
    const conversationTitle = titleNode ? normalizeContent(titleNode.textContent || '') : null;

    return {
      conversationId,
      conversationTitle: conversationTitle || null,
      conversationUrl: rawUrl,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  window.__RUMINER_INGEST__ = {
    platform: PLATFORM,
    version: VERSION,
    extractConversation,
  };

  try {
    console.debug(LOG, 'loaded');
  } catch {}
})();
