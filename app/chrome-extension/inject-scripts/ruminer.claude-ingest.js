/* eslint-disable */
// ruminer.claude-ingest.js
// Injected into claude.ai pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'claude';
  const VERSION = '2026-03-13.1';
  const LOG = '[ruminer.claude-ingest]';

  const existing = window.__RUMINER_INGEST__;
  if (existing && existing.platform === PLATFORM && existing.version === VERSION) return;

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const parseConversationId = (urlString) => {
    try {
      const u = new URL(String(urlString || ''), location.origin);
      const m = String(u.pathname || '').match(/^\/chat\/([^/?#]+)/);
      return m ? String(m[1] || '').trim() : '';
    } catch {
      return '';
    }
  };

  const extractMessagesFromDom = () => {
    const nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
    if (nodes.length > 0) {
      return nodes
        .map((n) => {
          const roleRaw = String(n.getAttribute('data-message-author-role') || '').toLowerCase();
          const role = roleRaw.includes('assistant')
            ? 'assistant'
            : roleRaw.includes('user')
              ? 'user'
              : null;
          if (!role) return null;
          const content = normalizeContent(n.textContent || '');
          if (!content) return null;
          return { role, content };
        })
        .filter(Boolean);
    }

    const userNodes = Array.from(
      document.querySelectorAll('[data-testid*="user"], [data-testid*="human"]'),
    );
    const assistantNodes = Array.from(
      document.querySelectorAll('[data-testid*="assistant"], [data-testid*="claude"]'),
    );
    const all = [];
    for (const n of userNodes) all.push({ node: n, role: 'user' });
    for (const n of assistantNodes) all.push({ node: n, role: 'assistant' });
    all.sort((a, b) =>
      a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
    return all
      .map((x) => ({ role: x.role, content: normalizeContent(x.node.textContent || '') }))
      .filter((m) => m.content);
  };

  async function extractConversation({ conversationUrl }) {
    const rawUrl = String(location.href || conversationUrl || '').trim();
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.hostname !== 'claude.ai') throw new Error('Not on claude.ai');

    const conversationId = parseConversationId(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    const messages = extractMessagesFromDom().map((m) => ({ role: m.role, content: m.content }));

    const titleNode = document.querySelector('h1') || document.querySelector('title');
    const conversationTitle = titleNode ? normalizeContent(titleNode.textContent || '') : null;

    return {
      conversationId,
      conversationTitle: conversationTitle || null,
      conversationUrl: rawUrl,
      messages,
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
