/* eslint-disable */
// ruminer.claude-ingest.js
// Injected into claude.ai pages (ISOLATED world). Exposes `window.__RUMINER_INGEST__`.

(() => {
  const PLATFORM = 'claude';
  const VERSION = '2026-03-13.7';
  const LOG = '[ruminer.claude-ingest]';

  const existing = window.__RUMINER_INGEST__;
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
    const rpc = window.__RUMINER_INGEST_RPC__;
    if (rpc && rpc.platform === PLATFORM && rpc.version === VERSION) return;
    window.__RUMINER_INGEST_RPC__ = { platform: PLATFORM, version: VERSION };

    try {
      chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        try {
          if (!request || typeof request.action !== 'string') return false;

          if (request.action === 'ruminer_ingest_ping') {
            sendResponse({
              ok: true,
              platform: PLATFORM,
              version: VERSION,
              href: String(location.href || ''),
            });
            return false;
          }

          if (request.action === 'ruminer_ingest_probe') {
            const api = window.__RUMINER_INGEST__;
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

          const api = window.__RUMINER_INGEST__;
          if (!api) {
            sendResponse({ ok: false, error: '__RUMINER_INGEST__ not found on window' });
            return false;
          }
          if (api.platform !== PLATFORM) {
            sendResponse({
              ok: false,
              error: `__RUMINER_INGEST__ platform mismatch (expected=${PLATFORM}, got=${String(api.platform || '')}, version=${String(api.version || '')})`,
            });
            return false;
          }

          if (request.action === 'ruminer_ingest_extractConversation') {
            const conversationUrl = request?.payload?.conversationUrl ?? null;
            Promise.resolve()
              .then(() => api.extractConversation({ conversationUrl }))
              .then((value) => {
                if (value === undefined || value === null) {
                  sendResponse({
                    ok: false,
                    error: '__RUMINER_INGEST__.extractConversation returned no value',
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

  const normalizeContent = (s) =>
    String(s || '')
      .replace(/\r\n/g, '\n')
      .trim();

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms | 0)));

  const normalizeRole = (raw) => {
    const roleRaw = String(raw || '').toLowerCase();
    if (!roleRaw) return null;
    if (roleRaw.includes('assistant') || roleRaw.includes('ai') || roleRaw.includes('bot'))
      return 'assistant';
    if (roleRaw.includes('user') || roleRaw.includes('human') || roleRaw.includes('you'))
      return 'user';
    return null;
  };

  const fetchJson = async (url) => {
    const readCookieValue = (name) => {
      try {
        const cookie = String(document.cookie || '');
        const m = cookie.match(new RegExp(`(?:^|;\\\\s*)${name}=([^;]*)`));
        return m ? decodeURIComponent(m[1] || '') : '';
      } catch {
        return '';
      }
    };

    const csrfFromMeta = () => {
      try {
        const meta =
          document.querySelector('meta[name="csrf-token"]') ||
          document.querySelector('meta[name="csrfToken"]') ||
          document.querySelector('meta[name="xsrf-token"]') ||
          document.querySelector('meta[name="XSRF-TOKEN"]');
        const v = meta && typeof meta.content === 'string' ? meta.content.trim() : '';
        return v;
      } catch {
        return '';
      }
    };

    const csrfToken =
      csrfFromMeta() ||
      readCookieValue('csrfToken') ||
      readCookieValue('csrf_token') ||
      readCookieValue('XSRF-TOKEN') ||
      '';

    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.json();
  };

  const pickOrgIds = (data) => {
    const arr = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray(data.organizations)
        ? data.organizations
        : null;
    if (!arr || arr.length === 0) return [];
    const ids = [];
    for (const it of arr) {
      const id = it && (it.uuid || it.id);
      const s = id ? String(id).trim() : '';
      if (s) ids.push(s);
    }
    return Array.from(new Set(ids));
  };

  const fetchOrganizationIds = async () => {
    const data = await fetchJson('/api/organizations');
    return pickOrgIds(data);
  };

  const extractTextFromMessage = (msg) => {
    if (!msg || typeof msg !== 'object') return '';
    const parts = [];

    const content = msg.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        if (typeof c.text === 'string' && c.text.trim()) parts.push(c.text);
        else if (c.type === 'text' && typeof c.content === 'string' && c.content.trim())
          parts.push(c.content);
      }
    }

    if (parts.length === 0) {
      if (typeof msg.text === 'string' && msg.text.trim()) parts.push(msg.text);
      else if (typeof msg.message === 'string' && msg.message.trim()) parts.push(msg.message);
    }

    return normalizeContent(parts.join('\n'));
  };

  const getCurrentBranchMessages = (conversation) => {
    const msgs =
      conversation && Array.isArray(conversation.chat_messages) ? conversation.chat_messages : [];
    const leaf =
      conversation && conversation.current_leaf_message_uuid
        ? String(conversation.current_leaf_message_uuid)
        : '';
    if (!leaf || msgs.length === 0) return [];

    const byId = new Map();
    for (const m of msgs) {
      if (m && (m.uuid || m.id)) byId.set(String(m.uuid || m.id), m);
    }

    const chain = [];
    let cur = leaf;
    for (let i = 0; i < 20_000 && cur; i++) {
      const m = byId.get(cur);
      if (!m) break;
      chain.push(m);
      cur = m.parent_message_uuid ? String(m.parent_message_uuid) : '';
    }
    chain.reverse();
    return chain;
  };

  const extractConversationViaApi = async ({ conversationId, rawUrl }) => {
    const orgIds = await fetchOrganizationIds();
    if (!orgIds || orgIds.length === 0)
      throw new Error('Failed to resolve Claude organization ids');

    let lastErr = '';
    for (const orgId of orgIds) {
      const url = `/api/organizations/${encodeURIComponent(
        orgId,
      )}/chat_conversations/${encodeURIComponent(
        conversationId,
      )}?tree=True&rendering_mode=messages&render_all_tools=true`;

      let conv;
      try {
        conv = await fetchJson(url);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        // Common when the conversation belongs to a different org.
        if (String(msg || '').includes('HTTP 403')) continue;
        continue;
      }

      const title =
        conv && typeof conv.name === 'string' && conv.name.trim() ? conv.name.trim() : null;

      const branch = getCurrentBranchMessages(conv);
      const messages = [];
      for (const m of branch) {
        const sender = m && typeof m.sender === 'string' ? m.sender : '';
        if (!sender) continue;
        if (sender === 'system') continue;

        const role = sender === 'human' ? 'user' : 'assistant';
        const content = extractTextFromMessage(m);
        if (!content) continue;

        const createTime =
          m && (m.created_at ?? m.createdAt) != null ? String(m.created_at ?? m.createdAt) : null;
        const messageId = m && (m.uuid || m.id) ? String(m.uuid || m.id) : null;
        messages.push({
          role,
          content,
          ...(createTime ? { createTime } : {}),
          ...(messageId ? { messageId } : {}),
        });
      }

      if (messages.length === 0) continue;

      return {
        conversationId,
        conversationTitle: title,
        conversationUrl: rawUrl,
        messages,
      };
    }

    throw new Error(lastErr ? `Claude API fetch failed: ${lastErr}` : 'Claude API fetch failed');
  };

  function isInTranscript(node) {
    if (!node || typeof node.closest !== 'function') return false;
    if (node.closest('nav, aside, header')) return false;
    if (
      node.closest(
        'footer, form, textarea, input, [contenteditable="true"], [role="textbox"], [data-testid*="composer"], [data-testid*="chat-input"], [data-testid*="model"], [aria-label*="Model"], [aria-label*="model"]',
      )
    )
      return false;
    if (node.closest('button, [role="button"], [role="combobox"], [role="listbox"]')) return false;
    const main = document.querySelector('main, [role="main"]');
    if (!main) return true;
    return main.contains(node);
  }

  const findTranscriptRoot = () => {
    const candidates = [
      '[data-testid="chat"]',
      '[data-testid="conversation"]',
      '[data-testid="chat-container"]',
      '[data-testid*="conversation-turn"]',
      '[data-testid*="chat-message"]',
      'main',
      '[role="main"]',
    ];

    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (!el) continue;
      try {
        if (
          el.querySelector('[data-message-author-role]') ||
          el.querySelector('[data-testid*="assistant"], [data-testid*="ai"], [data-testid*="bot"]')
        )
          return el;
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
          const role = normalizeRole(n.getAttribute('data-message-author-role'));
          if (!role) return null;
          const content = extractMessageContent(n);
          if (!content) return null;
          return { role, content };
        })
        .filter(Boolean);
    }

    // Fallback: best-effort extraction when role attributes are unavailable.
    const userNodes = Array.from(
      root.querySelectorAll('[data-testid*="user"], [data-testid*="human"], [data-testid*="you"]'),
    ).filter((n) => isInTranscript(n));
    const assistantNodes = Array.from(
      root.querySelectorAll(
        '[data-testid*="assistant"], [data-testid*="ai"], [data-testid*="bot"]',
      ),
    ).filter((n) => isInTranscript(n));

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
    if (!parsed || !String(parsed.hostname || '').endsWith('claude.ai'))
      throw new Error('Not on claude.ai');

    const conversationId = parseConversationId(rawUrl);
    if (!conversationId) throw new Error('Failed to parse conversation id from URL');

    try {
      const apiResult = await extractConversationViaApi({ conversationId, rawUrl });
      try {
        console.debug(LOG, 'api extract ok', {
          conversationId,
          messageCount: apiResult.messages.length,
        });
      } catch {}
      return apiResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        console.debug(LOG, 'api extract failed; falling back to DOM', {
          conversationId,
          error: msg,
        });
      } catch {}
      await sleep(200);
    }

    const extracted = extractMessagesFromDom();
    const messages = extracted.map((m) => ({ role: m.role, content: m.content }));

    const userCount = messages.filter((m) => m.role === 'user').length;
    const assistantCount = messages.filter((m) => m.role === 'assistant').length;
    if (assistantCount === 0 && messages.length > 0) {
      const roleAttrSamples = Array.from(document.querySelectorAll('[data-message-author-role]'))
        .slice(0, 10)
        .map((n) => String(n.getAttribute('data-message-author-role') || ''));
      const diag = {
        href: String(location.href || ''),
        conversationId,
        messageCount: messages.length,
        userCount,
        assistantCount,
        roleAttrSamples,
        roleNodeCount: document.querySelectorAll('[data-message-author-role]').length,
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
