/* eslint-disable */
// ruminer.claude-ingest.js
// Injected into claude.ai pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'claude';
  const VERSION = '2026-03-13.2';
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

  function isInTranscript(node) {
    if (!node || typeof node.closest !== 'function') return false;
    if (node.closest('nav, aside, header')) return false;
    const main = document.querySelector('main, [role="main"]');
    if (!main) return true;
    return main.contains(node);
  }

  const findTranscriptRoot = () => {
    const candidates = [
      '[data-testid="chat"]',
      '[data-testid="conversation"]',
      '[data-testid="chat-container"]',
      'main',
      '[role="main"]',
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      try {
        if (el.querySelector('[data-message-author-role]')) return el;
      } catch {
        // ignore selector errors
      }
    }

    return document.querySelector('main') || document.body;
  };

  const extractMessageContent = (node) => {
    if (!node) return '';
    const candidates = [
      '[data-testid="message-content"]',
      '.prose',
      '[class*="prose"]',
      '[class*="markdown"]',
    ];
    for (const sel of candidates) {
      try {
        const el = node.querySelector(sel);
        if (el) {
          const text = normalizeContent(el.innerText || el.textContent || '');
          if (text) return text;
        }
      } catch {
        // ignore
      }
    }
    return normalizeContent(node.innerText || node.textContent || '');
  };

  const extractMessagesFromDom = () => {
    const root = findTranscriptRoot();

    const roleNodes = Array.from(root.querySelectorAll('[data-message-author-role]')).filter((n) =>
      isInTranscript(n),
    );

    if (roleNodes.length > 0) {
      return roleNodes
        .map((n) => {
          const roleRaw = String(n.getAttribute('data-message-author-role') || '').toLowerCase();
          const role = roleRaw.includes('assistant')
            ? 'assistant'
            : roleRaw.includes('user')
              ? 'user'
              : null;
          if (!role) return null;
          const content = extractMessageContent(n);
          if (!content) return null;
          return { role, content };
        })
        .filter(Boolean);
    }

    // Fallback: best-effort extraction when role attributes are unavailable.
    const userNodes = Array.from(
      root.querySelectorAll('[data-testid*="user"], [data-testid*="human"]'),
    ).filter((n) => isInTranscript(n));
    const assistantNodes = Array.from(root.querySelectorAll('[data-testid*="assistant"]')).filter(
      (n) => isInTranscript(n),
    );

    const all = [];
    for (const n of userNodes) all.push({ node: n, role: 'user' });
    for (const n of assistantNodes) all.push({ node: n, role: 'assistant' });

    all.sort((a, b) =>
      a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );

    return all
      .map((x) => ({ role: x.role, content: extractMessageContent(x.node) }))
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

    const extracted = extractMessagesFromDom();
    const messages = extracted.map((m) => ({ role: m.role, content: m.content }));

    const userCount = messages.filter((m) => m.role === 'user').length;
    const assistantCount = messages.filter((m) => m.role === 'assistant').length;
    if (assistantCount === 0 && messages.length > 0) {
      const diag = {
        href: String(location.href || ''),
        conversationId,
        messageCount: messages.length,
        userCount,
        assistantCount,
        hasRoleNodes: Boolean(document.querySelector('[data-message-author-role]')),
      };
      throw new Error(
        `Claude ingest extracted 0 assistant messages (diag=${JSON.stringify(diag)})`,
      );
    }

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
