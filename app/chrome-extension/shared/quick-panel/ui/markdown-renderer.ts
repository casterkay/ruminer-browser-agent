/**
 * Quick Panel Markdown Renderer
 *
 * Lightweight markdown renderer for Quick Panel.
 * Supports common markdown elements: bold, italic, code, code blocks, lists, links.
 */

// ============================================================
// Types
// ============================================================

export interface MarkdownRendererInstance {
  /** Update the markdown content */
  setContent: (content: string, isStreaming?: boolean) => void;
  /** Get current content */
  getContent: () => string;
  /** Dispose resources */
  dispose: () => void;
}

// ============================================================
// Markdown Parser
// ============================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse markdown to HTML string.
 * Handles: code blocks, inline code, bold, italic, strikethrough, links, lists, headers.
 */
function parseMarkdown(text: string): string {
  if (!text) return '';

  // Split and process line by line
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block handling
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        const langClass = codeBlockLang ? ` class="language-${escapeHtml(codeBlockLang)}"` : '';
        const code = escapeHtml(codeBlockContent.join('\n').trim());
        result.push(`<pre><code${langClass}>${code}</code></pre>`);
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      result.push(`<h${level}>${inlineMarkdown(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      result.push(`<blockquote>${inlineMarkdown(line.slice(1).trim())}</blockquote>`);
      continue;
    }

    // Horizontal rule
    if (/^(---+|\*\*\*|___)$/.test(line.trim())) {
      result.push('<hr>');
      continue;
    }

    // List items - collect consecutive items
    const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const content = listMatch[2];
      result.push(`<li data-indent="${indent}">${inlineMarkdown(content)}</li>`);
      continue;
    }

    // Ordered list items
    const orderedMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (orderedMatch) {
      const indent = orderedMatch[1].length;
      const content = orderedMatch[2];
      result.push(
        `<li data-indent="${indent}" data-ordered="true">${inlineMarkdown(content)}</li>`,
      );
      continue;
    }

    // Regular paragraph line (skip empty lines)
    if (line.trim()) {
      result.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  // Post-process: wrap consecutive <li> elements in <ul> or <ol>
  return wrapListsSimple(result);
}

/**
 * Process inline markdown elements (bold, italic, code, links, etc.)
 */
function inlineMarkdown(text: string): string {
  if (!text) return '';

  let html = escapeHtml(text);

  // Inline code (`...`) - process first to avoid other formatting inside
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Strikethrough (~~...~~)
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Bold (**...** or __...__)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic (*...* or _..._) - but not if already part of bold
  html = html.replace(/(?<!<strong[^>]*)\*([^*]+)\*(?!<\/strong>)/g, '<em>$1</em>');
  html = html.replace(/(?<!<strong[^>]*)_([^_]+)_(?!<\/strong>)/g, '<em>$1</em>');

  // Links ([text](url))
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Line breaks within paragraph
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * Wrap consecutive <li> elements in <ul> or <ol> tags
 */
function wrapListsSimple(elements: string[]): string {
  const result: string[] = [];
  let inList = false;
  let isOrdered = false;

  for (const el of elements) {
    const isLi = el.startsWith('<li');

    if (isLi && !inList) {
      // Start of list
      const ordered = el.includes('data-ordered="true"');
      isOrdered = ordered;
      result.push(ordered ? '<ol>' : '<ul>');
      inList = true;
    } else if (!isLi && inList) {
      // End of list
      result.push(isOrdered ? '</ol>' : '</ul>');
      inList = false;
    }

    // Remove data attributes from li tags
    const cleaned = el.replace(/ data-indent="\d+"/g, '').replace(/ data-ordered="true"/g, '');
    result.push(cleaned);
  }

  // Close any open list
  if (inList) {
    result.push(isOrdered ? '</ol>' : '</ul>');
  }

  return result.join('');
}

// ============================================================
// Main Factory
// ============================================================

/**
 * Create a markdown renderer instance that mounts to a container element.
 *
 * @param container - The DOM element to render content into
 * @returns Markdown renderer instance with setContent and dispose methods
 */
export function createMarkdownRenderer(container: HTMLElement): MarkdownRendererInstance {
  let currentContent = '';

  // Create a wrapper div for content
  const contentEl = document.createElement('div');
  contentEl.className = 'qp-markdown-content';
  container.appendChild(contentEl);

  return {
    setContent(newContent: string, _streaming = false) {
      currentContent = newContent;
      // Render as markdown HTML
      contentEl.innerHTML = parseMarkdown(newContent);
    },

    getContent() {
      return currentContent;
    },

    dispose() {
      try {
        contentEl.remove();
      } catch {
        // Best-effort cleanup
      }
    },
  };
}
