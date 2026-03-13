/* eslint-disable */
// ruminer.deepseek-ingest.js
// Injected into chat.deepseek.com pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'deepseek';
  const VERSION = '2026-03-13.1';
  const LOG = '[ruminer.deepseek-ingest]';

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
      const p = String(u.pathname || '');
      let m = p.match(/\/(?:chat|c)\/([^/?#]+)/i);
      if (m) return String(m[1] || '').trim();
      const sp = u.searchParams;
      for (const key of ['conversationId', 'chatId', 'id']) {
        const v = sp.get(key);
        if (v && v.trim()) return v.trim();
      }
      const seg = p.split('/').filter(Boolean).pop();
      return seg ? String(seg).trim() : '';
    } catch {
      return '';
    }
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

  const findScroller = () => {
    const candidates = ['main', '[class*="scroll"]', '.ds-chat', '.ds-chat-container'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    return document.scrollingElement || document.documentElement;
  };

  async function extractConversation({ conversationUrl }) {
    const rawUrl = String(location.href || conversationUrl || '').trim();
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.hostname !== 'chat.deepseek.com')
      throw new Error('Not on chat.deepseek.com');

    const conversationId = parseConversationId(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    // Best-effort: scroll down to materialize virtualized turns.
    const scroller = findScroller();
    const seen = new Set();
    const messages = [];

    let stable = 0;
    for (let i = 0; i < 160; i++) {
      const visible = extractMessagesFromDom();
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

    const titleNode = document.querySelector('h1') || document.querySelector('title');
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
