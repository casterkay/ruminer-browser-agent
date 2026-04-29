/* eslint-disable */
// ruminer.shared.js
// Shared normalization helpers for Ruminer platform conversation extractors.

(() => {
  const VERSION = '2026-04-28.1';
  const existing = window.__RUMINER_EXTRACTOR_UTILS__;
  if (existing && existing.version === VERSION) return;

  const normalizeContent = (value) =>
    String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const normalizeTitle = (value) => {
    const raw = String(value || '')
      .replace(/\r\n?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return null;
    return (
      raw
        .replace(/\s+[|-]\s+(Claude|ChatGPT|Gemini|DeepSeek|Grok)$/i, '')
        .replace(/^(Claude|ChatGPT|Gemini|DeepSeek|Grok)\s*[-|]\s*/i, '')
        .trim() || raw
    );
  };

  const normalizeTimestamp = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) return normalizeTimestamp(Number(raw));
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  };

  const isHidden = (el) => {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (el.hasAttribute('hidden')) return true;
      if (el.getAttribute('aria-hidden') === 'true') return true;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      return Boolean(style && (style.display === 'none' || style.visibility === 'hidden'));
    } catch {
      return false;
    }
  };

  const escapeMarkdownUrl = (url) => String(url || '').replace(/\)/g, '%29');

  const collapseBlankLines = (value) =>
    String(value || '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');

  const renderChildren = (node, ctx) => {
    const children = node && node.childNodes ? Array.from(node.childNodes) : [];
    return children.map((child) => renderNode(child, ctx)).join('');
  };

  const linePrefix = (text, prefix) =>
    normalizeContent(text)
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');

  const renderList = (el, ordered, ctx) => {
    const items = Array.from(el.children || []).filter(
      (child) => String(child.tagName || '').toUpperCase() === 'LI',
    );
    return (
      '\n' +
      items
        .map((li, index) => {
          const marker = ordered ? `${index + 1}. ` : '- ';
          const body = normalizeContent(renderChildren(li, { ...ctx, inList: true }));
          return linePrefix(body, marker);
        })
        .join('\n') +
      '\n\n'
    );
  };

  function renderNode(node, ctx = {}) {
    if (!node) return '';
    const nodeType = node.nodeType;
    if (nodeType === 3) return node.nodeValue || '';
    if (nodeType !== 1) return '';

    const el = node;
    if (isHidden(el)) return '';

    const tag = String(el.tagName || '').toUpperCase();
    if (!tag || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') {
      return '';
    }
    if (tag === 'BUTTON' || tag === 'SVG' || tag === 'INPUT' || tag === 'SELECT') return '';
    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n\n---\n\n';

    if (tag === 'PRE') {
      const code = el.textContent || '';
      return `\n\n\`\`\`\n${String(code).replace(/\n+$/, '')}\n\`\`\`\n\n`;
    }

    if (tag === 'CODE') {
      const text = el.textContent || '';
      if (ctx.inPre) return text;
      return `\`${String(text).replace(/`/g, '\\`')}\``;
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const body = normalizeContent(renderChildren(el, ctx));
      return body ? `\n\n${'#'.repeat(level)} ${body}\n\n` : '';
    }

    if (tag === 'STRONG' || tag === 'B') {
      const body = normalizeContent(renderChildren(el, ctx));
      return body ? `**${body}**` : '';
    }

    if (tag === 'EM' || tag === 'I') {
      const body = normalizeContent(renderChildren(el, ctx));
      return body ? `*${body}*` : '';
    }

    if (tag === 'A') {
      const body = normalizeContent(renderChildren(el, ctx)) || normalizeTitle(el.textContent);
      const href = el.getAttribute && el.getAttribute('href');
      if (!body) return '';
      if (!href) return body;
      let absolute = href;
      try {
        absolute = new URL(href, location.href).toString();
      } catch {}
      return `[${body}](${escapeMarkdownUrl(absolute)})`;
    }

    if (tag === 'UL') return renderList(el, false, ctx);
    if (tag === 'OL') return renderList(el, true, ctx);
    if (tag === 'LI') {
      const body = normalizeContent(renderChildren(el, ctx));
      return ctx.inList ? body : `\n- ${body}\n`;
    }

    if (tag === 'BLOCKQUOTE') {
      const body = linePrefix(renderChildren(el, ctx), '> ');
      return body ? `\n\n${body}\n\n` : '';
    }

    if (tag === 'P') {
      const body = normalizeContent(renderChildren(el, ctx));
      return body ? `\n\n${body}\n\n` : '';
    }

    if (tag === 'TR') return `${normalizeContent(renderChildren(el, ctx))}\n`;
    if (tag === 'TD' || tag === 'TH') return `${normalizeContent(renderChildren(el, ctx))} | `;

    const body = renderChildren(el, ctx);
    if (
      tag === 'DIV' ||
      tag === 'SECTION' ||
      tag === 'ARTICLE' ||
      tag === 'HEADER' ||
      tag === 'FOOTER'
    ) {
      return body ? `${body}\n` : '';
    }
    return body;
  }

  const elementToMarkdown = (element) => normalizeContent(collapseBlankLines(renderNode(element)));

  const pickTimestamp = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return null;
    for (const key of keys || []) {
      const value = obj[key];
      const normalized = normalizeTimestamp(value);
      if (normalized) return normalized;
    }
    return null;
  };

  window.__RUMINER_EXTRACTOR_UTILS__ = {
    version: VERSION,
    normalizeContent,
    normalizeTitle,
    normalizeTimestamp,
    pickTimestamp,
    elementToMarkdown,
  };
})();
