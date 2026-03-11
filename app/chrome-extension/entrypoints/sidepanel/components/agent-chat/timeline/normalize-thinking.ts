function stripBlockquotePrefix(line: string): string {
  return line.replace(/^\s*>\s?/, '');
}

function stripBlockquoteFromBlock(block: string): string {
  return block.split('\n').map(stripBlockquotePrefix).join('\n');
}

function parseCalloutHeaderLine(line: string): { kind: string; title: string } | null {
  const match = String(line ?? '').match(/^\s*(?:>\s*)?\[!([a-zA-Z]+)\]\s*(.*?)\s*$/);
  if (!match) return null;
  return {
    kind: (match[1] ?? '').trim().toLowerCase(),
    title: (match[2] ?? '').trim(),
  };
}

function squashBlankLines(text: string): string {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Converts Obsidian/GitHub-style callouts that look like "agent thoughts" into
 * `<thinking>...</thinking>` blocks so they render with `ThinkingNode.vue`.
 *
 * Example:
 * > [!info] Deciding on a plan
 * > I will do X...
 *
 * becomes:
 * <thinking>**Deciding on a plan**\n\nI will do X...</thinking>
 */
export function wrapThoughtCalloutsAsThinking(markdown: string): string {
  const src = String(markdown ?? '');
  if (!src.includes('[!')) return src;

  const blocks = src.split(/\n{2,}/);
  const out: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] ?? '';
    const firstLine = block.split('\n')[0] ?? '';
    const header = parseCalloutHeaderLine(firstLine);

    if (!header) {
      out.push(block);
      continue;
    }

    // Only convert "info/note" style callouts (structural signal).
    if (!['info', 'note', 'tip', 'abstract'].includes(header.kind)) {
      out.push(block);
      continue;
    }

    // Body from the same block (after the header line).
    const bodyFromSameBlock = stripBlockquoteFromBlock(block)
      .split('\n')
      .slice(1)
      .join('\n')
      .trim();

    let finalBody = bodyFromSameBlock;

    // Structural merge for streaming outputs:
    // Some models emit the callout header as a standalone paragraph, then emit the body
    // as the next paragraph (without `>` blockquote prefixes). When we see a header-only
    // callout, absorb exactly one following block as its body, unless it starts another callout.
    if (!finalBody) {
      const nextBlock = blocks[i + 1] ?? '';
      const nextFirstLine = nextBlock.split('\n')[0] ?? '';
      if (nextBlock.trim() && !parseCalloutHeaderLine(nextFirstLine)) {
        finalBody = stripBlockquoteFromBlock(nextBlock).trim();
        i += 1;
      }
    }

    // Keep the entire <thinking>...</thinking> content in a single markdown paragraph.
    // Blank lines can cause the markdown parser to close the HTML tag early, leaving the closing
    // tag as a stray `html_inline` node and making the section non-expandable.
    const payloadParts = [
      header.title ? `**${header.title}**` : null,
      finalBody ? squashBlankLines(finalBody) : null,
    ].filter((part): part is string => !!part && part.trim().length > 0);

    const payload = payloadParts.join('\n');
    out.push(`<thinking>${payload}</thinking>`);
  }

  return out.join('\n\n');
}

/**
 * Normalizes existing <thinking>/<think> blocks (from engines) so they stay within a
 * single markdown paragraph. This prevents markdown parsers from splitting the tag
 * across multiple paragraphs, which can leave a stray closing tag as `html_inline`
 * and make the ThinkingNode appear non-expandable.
 */
export function squashBlankLinesInsideThinkingTags(markdown: string): string {
  const src = String(markdown ?? '');
  if (!src.toLowerCase().includes('<thinking') && !src.toLowerCase().includes('<think')) return src;

  return src.replace(
    /<(thinking|think)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_full, tagName: string, attrs: string, inner: string) => {
      const normalizedInner = squashBlankLines(inner);
      return `<${tagName}${attrs}>${normalizedInner}</${tagName}>`;
    },
  );
}
