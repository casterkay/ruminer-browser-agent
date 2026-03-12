/* eslint-disable */
/**
 * Ruminer – ChatGPT conversation ingest (inject-script)
 *
 * This script is injected into a ChatGPT tab via `chrome.scripting.executeScript({ files })`
 * from the extension background. It runs in the ISOLATED world and exposes:
 *
 *   window.__RUMINER_CHATGPT_INGEST__(payload) => Promise<{ ok: true, ... } | { ok: false, error }>
 *
 * Notes:
 * - This file is copied verbatim into `.output/.../inject-scripts/` (no bundling).
 * - Keep it as plain JS (no TypeScript) and avoid external imports.
 */

(function ruminerChatgptIngestIife() {
  'use strict';

  const LOG = '[chatgpt-ingest]';
  const API_TIMEOUTS = {
    session: 15_000,
    backend: 30_000,
    accountCheck: 20_000,
    sendMessage: 120_000,
  };

  /**
   * Best-effort JSON parse.
   * @param {Response} response
   */
  async function safeJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Fetch with an abort timeout.
   * @param {string} input
   * @param {RequestInit} init
   * @param {number} timeoutMs
   */
  async function fetchWithTimeout(input, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1_000, Math.floor(timeoutMs)));
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * ChatGPT sometimes exposes auth in page runtime state. In an ISOLATED world, this may be
   * unavailable depending on how the site is structured. This is best-effort only.
   */
  function getPageAccessToken() {
    try {
      const remixContext = window.__remixContext;
      const token =
        remixContext &&
        remixContext.state &&
        remixContext.state.loaderData &&
        remixContext.state.loaderData.root &&
        remixContext.state.loaderData.root.clientBootstrap &&
        remixContext.state.loaderData.root.clientBootstrap.session &&
        remixContext.state.loaderData.root.clientBootstrap.session.accessToken;
      return typeof token === 'string' ? token : null;
    } catch {
      return null;
    }
  }

  function getCookie(key) {
    try {
      const m = document.cookie.match('(^|;)\\s*' + key + '\\s*=\\s*([^;]+)');
      return m ? String(m.pop() || '') : '';
    } catch {
      return '';
    }
  }

  async function fetchSessionAccessToken() {
    const pageToken = getPageAccessToken();
    if (pageToken) {
      console.log(`${LOG} got access token from page context`);
      return pageToken;
    }

    console.log(`${LOG} fetching session from API`);
    const sessionUrl = new URL('/api/auth/session', location.origin).toString();
    const resp = await fetchWithTimeout(
      sessionUrl,
      { credentials: 'include' },
      API_TIMEOUTS.session,
    );
    if (!resp.ok) throw new Error('Not logged in to ChatGPT');

    const payload = await safeJson(resp);
    const accessToken =
      payload && typeof payload === 'object' && typeof payload.accessToken === 'string'
        ? payload.accessToken
        : '';

    if (!String(accessToken).trim()) throw new Error('ChatGPT session missing access token');
    return accessToken;
  }

  async function getTeamAccountId(accessToken) {
    const workspaceId = getCookie('_account');
    if (!workspaceId) return null;

    try {
      const checkUrl = new URL(
        '/backend-api/accounts/check/v4-2023-04-27',
        location.origin,
      ).toString();
      const resp = await fetchWithTimeout(
        checkUrl,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Authorization': `Bearer ${accessToken}`,
          },
          credentials: 'include',
        },
        API_TIMEOUTS.accountCheck,
      );
      if (!resp.ok) return null;

      const payload = await safeJson(resp);
      const account =
        payload && typeof payload === 'object' && payload.accounts && payload.accounts[workspaceId]
          ? payload.accounts[workspaceId]
          : null;

      const aid = account && account.account ? account.account.account_id : null;
      return typeof aid === 'string' && aid.trim() ? aid.trim() : null;
    } catch {
      return null;
    }
  }

  async function fetchBackendApi(path, accessToken, accountId) {
    const url = new URL('/backend-api' + path, location.origin);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'X-Authorization': `Bearer ${accessToken}`,
    };
    if (accountId) headers['Chatgpt-Account-Id'] = accountId;

    console.log(`${LOG} fetching backend API`, { path });
    const resp = await fetchWithTimeout(
      url.toString(),
      { headers, credentials: 'include' },
      API_TIMEOUTS.backend,
    );

    if (!resp.ok) {
      const body = await safeJson(resp);
      const detail =
        body && typeof body === 'object' ? String(body.detail || body.error || '') : '';
      throw new Error(`ChatGPT backend API failed (${resp.status}): ${detail || resp.statusText}`);
    }

    return safeJson(resp);
  }

  function extractContentText(content) {
    if (!content || typeof content !== 'object') return '';
    const t = content.content_type;

    if (t === 'text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts.filter((p) => typeof p === 'string').join('');
    }
    if (t === 'code' || t === 'execution_output')
      return typeof content.text === 'string' ? content.text : '';

    if (t === 'multimodal_text') {
      const parts = Array.isArray(content.parts) ? content.parts : [];
      return parts
        .map((p) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
          return '';
        })
        .join('');
    }

    if (t === 'tether_quote') {
      const bits = [];
      if (typeof content.title === 'string') bits.push(content.title);
      if (typeof content.text === 'string') bits.push(content.text);
      return bits.join('\n');
    }

    if (t === 'image_asset_pointer')
      return typeof content.alt_text === 'string' ? content.alt_text : '';
    if (t === 'refusal') return typeof content.refusal === 'string' ? content.refusal : '';
    return '';
  }

  function extractConversationMessages(conversation) {
    const mapping = conversation && typeof conversation === 'object' ? conversation.mapping : null;
    const current =
      conversation && typeof conversation === 'object' ? conversation.current_node : null;
    if (!mapping || typeof mapping !== 'object' || !current) {
      console.warn(`${LOG} no mapping or current_node`, {
        hasMapping: !!mapping,
        hasCurrent: !!current,
      });
      return [];
    }

    const chain = [];
    const visited = new Set();

    let nodeId = String(current);
    while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      chain.push(node);
      nodeId = node && node.parent ? String(node.parent) : '';
    }

    chain.reverse();
    console.log(`${LOG} built message chain`, { chainLength: chain.length });

    const out = [];
    for (const node of chain) {
      const msg = node && node.message ? node.message : null;
      const role = msg && msg.author ? msg.author.role : null;
      if (role !== 'user' && role !== 'assistant') continue;

      const content = extractContentText(msg ? msg.content : null)
        .replace(/\r\n/g, '\n')
        .trim();
      if (!content) continue;

      const ct = msg ? (msg.create_time ?? msg.createTime) : null;
      out.push({ role, content, createTime: ct != null ? String(ct) : null });
    }
    return out;
  }

  /**
   * Promise wrapper around chrome.runtime.sendMessage with a timeout.
   * @template T
   * @param {any} msg
   * @param {number} timeoutMs
   * @returns {Promise<T>}
   */
  function sendMessageWithTimeout(msg, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          reject(new Error(`chrome.runtime.sendMessage timed out after ${timeoutMs}ms`));
        },
        Math.max(1_000, Math.floor(timeoutMs)),
      );

      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          clearTimeout(timer);

          const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : '';
          if (err) {
            reject(new Error(err));
            return;
          }

          resolve(resp);
        });
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  async function ingestConversation(payload) {
    try {
      console.log(`${LOG} start`, {
        runId: payload && typeof payload.runId === 'string' ? payload.runId : null,
        conversationUrl:
          payload && typeof payload.conversationUrl === 'string' ? payload.conversationUrl : null,
        href: window.location.href,
        origin: window.location.origin,
      });

      const runId = payload && typeof payload.runId === 'string' ? payload.runId.trim() : '';
      if (!runId) throw new Error('Missing runId');

      const rawUrl = String(
        window.location.href || (payload ? payload.conversationUrl : '') || '',
      ).trim();
      if (!rawUrl) throw new Error('Missing conversation URL');

      const url = new URL(rawUrl);
      const pathname = url.pathname || '';
      const segments = pathname.split('/').filter(Boolean);
      const markerIdx = segments.findIndex((s) => s === 'c' || s === 'chat');
      const conversationId =
        markerIdx >= 0 && markerIdx + 1 < segments.length
          ? String(segments[markerIdx + 1] || '').trim()
          : '';

      console.log(`${LOG} parsed URL`, { rawUrl, pathname, segments, markerIdx, conversationId });
      if (!conversationId) throw new Error('Failed to parse conversation id from URL');

      if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        throw new Error(
          'chrome.runtime.sendMessage unavailable (not running in extension isolated world?)',
        );
      }

      const accessToken = await fetchSessionAccessToken();
      console.log(`${LOG} got access token`, { tokenLength: accessToken.length });

      const accountId = await getTeamAccountId(accessToken);
      console.log(`${LOG} account resolution`, { accountId });

      console.log(`${LOG} fetching conversation`, { conversationId, accountId });
      const conv = await fetchBackendApi(
        `/conversation/${encodeURIComponent(conversationId)}`,
        accessToken,
        accountId,
      );

      const title = conv && typeof conv === 'object' ? (conv.title ?? null) : null;
      console.log(`${LOG} got conversation`, {
        title,
        hasMapping: !!(conv && typeof conv === 'object' && conv.mapping),
        mappingKeys:
          conv && typeof conv === 'object' && conv.mapping && typeof conv.mapping === 'object'
            ? Object.keys(conv.mapping).length
            : 0,
      });

      const messages = extractConversationMessages(conv);
      console.log(`${LOG} extracted messages`, { messageCount: messages.length });
      if (!messages.length) throw new Error('No messages extracted from conversation');

      console.log(`${LOG} sending to background for ingestion`, {
        platform: 'chatgpt',
        conversationId,
        messageCount: messages.length,
      });

      const ingestResp = await sendMessageWithTimeout(
        {
          type: 'ruminer.ingest.ingestConversation',
          platform: 'chatgpt',
          conversationId,
          runId,
          conversationTitle: title,
          conversationUrl: rawUrl,
          messages,
        },
        API_TIMEOUTS.sendMessage,
      );

      console.log(`${LOG} ingestion response`, {
        ok: ingestResp && typeof ingestResp === 'object' ? ingestResp.ok : undefined,
        error: ingestResp && typeof ingestResp === 'object' ? ingestResp.error : undefined,
        hasResult: !!(ingestResp && typeof ingestResp === 'object' && ingestResp.result),
      });

      if (!ingestResp || ingestResp.ok !== true) {
        const err =
          ingestResp && typeof ingestResp === 'object' && ingestResp.error
            ? String(ingestResp.error)
            : 'Unknown ingest error';
        throw new Error(err);
      }

      console.log(`${LOG} success`, { conversationId, title, messageCount: messages.length });
      return {
        ok: true,
        conversationId,
        conversationTitle: title,
        conversationUrl: rawUrl,
        messageCount: messages.length,
        ingest: ingestResp.result ?? null,
      };
    } catch (e) {
      console.error(`${LOG} error`, {
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Expose on window for the background `executeScript({ func })` call.
  window.__RUMINER_CHATGPT_INGEST__ = ingestConversation;
  console.log(`${LOG} script loaded, __RUMINER_CHATGPT_INGEST__ exposed`);
})();
