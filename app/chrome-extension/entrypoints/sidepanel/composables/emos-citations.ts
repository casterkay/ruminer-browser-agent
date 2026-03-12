import type { InjectionKey, Ref } from 'vue';
import type { MemoryItem } from './useEmosSearch';

export type EmosCitationMemoriesById = Map<string, MemoryItem>;

export const EMOS_CITATION_MEMORIES_BY_ID_KEY: InjectionKey<Ref<EmosCitationMemoriesById>> = Symbol(
  'emosCitationMemoriesById',
);

export type EmosCitationOpenDetails = (item: MemoryItem) => void;

export const EMOS_CITATION_OPEN_DETAILS_KEY: InjectionKey<EmosCitationOpenDetails> =
  Symbol('emosCitationOpenDetails');

const FOOTNOTE_REF_LINE = /^\[\^(\d+)\]:\s*(.+?)\s*$/;
const INLINE_CITE = /\[\^(\d+(?:\s*,\s*\d+)*)\]/g;
const FOOTNOTES_HEADER_PATTERN = /\n[—-]{3,}\s*(\n+[#*\s\w:-]*)?\n*$/;

function escapeHtmlAttr(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function stripTrailingFootnoteReferences(text: string): {
  body: string;
  refs: Map<string, string>;
} {
  const src = String(text ?? '');
  const lines = src.split('\n');

  // Skip trailing blank lines.
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;

  const refs = new Map<string, string>();
  let foundAny = false;
  let refStart = i + 1;

  for (; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      // Allow blank lines within the trailing reference block.
      if (foundAny) {
        refStart = i;
        continue;
      }
      break;
    }

    const match = line.match(FOOTNOTE_REF_LINE);
    if (!match) {
      break;
    }

    foundAny = true;
    refStart = i;
    refs.set(match[1], match[2].trim());
  }

  if (!foundAny) {
    return { body: src, refs: new Map() };
  }

  const body = lines
    .slice(0, refStart)
    .join('\n')
    .replace(FOOTNOTES_HEADER_PATTERN, '')
    .replace(/\s+$/g, '');

  return { body, refs };
}

function replaceInlineCitationsOutsideCode(line: string, refs: Map<string, string>): string {
  if (!line.includes('[^')) return line;

  let out = '';
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '`') {
      // Inline code segment. Preserve verbatim.
      let n = 1;
      while (i + n < line.length && line[i + n] === '`') n++;
      const opener = '`'.repeat(n);
      const closeIdx = line.indexOf(opener, i + n);
      if (closeIdx === -1) {
        // Unclosed backticks; treat as normal text.
        out += ch;
        i += 1;
        continue;
      }
      out += line.slice(i, closeIdx + n);
      i = closeIdx + n;
      continue;
    }

    // Non-code chunk until next backtick (or end).
    const nextTick = line.indexOf('`', i);
    const chunkEnd = nextTick === -1 ? line.length : nextTick;
    const chunk = line.slice(i, chunkEnd);

    out += chunk.replace(INLINE_CITE, (_full, keysRaw: string) => {
      const keys = String(keysRaw)
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      if (keys.length === 0) return _full;

      // Get footnote contents for each key
      const contents = keys.map((k) => refs.get(k) ?? '');
      const keysAttr = escapeHtmlAttr(keys.join(','));
      const messageIds = Array.from(
        new Set(contents.map((c) => String(c || '').trim()).filter(Boolean)),
      );
      const messageIdsAttr = escapeHtmlAttr(messageIds.join(','));
      return `<emos-cite keys="${keysAttr}" message-ids="${messageIdsAttr}"></emos-cite>`;
    });

    i = chunkEnd;
  }

  return out;
}

export function injectEmosCitationTags(markdownBody: string, refs: Map<string, string>): string {
  if (refs.size === 0) return markdownBody;

  const lines = String(markdownBody ?? '').split('\n');
  const out: string[] = [];

  let inFence = false;
  let fenceChar: '`' | '~' | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*([`~]{3,})/);
    if (fenceMatch) {
      const token = fenceMatch[1];
      const char = token[0] as '`' | '~';
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (fenceChar === char) {
        inFence = false;
        fenceChar = null;
      }
      out.push(line);
      continue;
    }

    out.push(inFence ? line : replaceInlineCitationsOutsideCode(line, refs));
  }

  return out.join('\n');
}

export function formatAssistantMarkdownWithEmosCitations(text: string): string {
  const { body, refs } = stripTrailingFootnoteReferences(text);
  return injectEmosCitationTags(body, refs);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = record[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function collectEmosMemories(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectEmosMemories(entry, out);
    return;
  }
  if (!isObjectRecord(value)) return;

  // Check for standard message_id fields
  const hasIdField =
    typeof value.message_id === 'string' ||
    typeof value.id === 'string' ||
    typeof value.memory_id === 'string' ||
    typeof value.event_id === 'string';
  // Check for content fields
  const hasContentField = typeof value.summary === 'string' || typeof value.content === 'string';

  const hasEmosFormat =
    typeof value.timestamp === 'string' && typeof value.user_id === 'string' && hasContentField;

  if (hasIdField && hasContentField) {
    out.push(value);
    return;
  }

  if (hasEmosFormat) {
    out.push(value);
    return;
  }

  for (const nested of Object.values(value)) {
    if (Array.isArray(nested) || isObjectRecord(nested)) {
      collectEmosMemories(nested, out);
    }
  }
}

export function extractEmosCitationMemoriesFromToolResultText(text: string): MemoryItem[] {
  const src = String(text ?? '').trim();
  if (!src) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(src);
  } catch {
    // Content may have a text prefix (e.g. "Result: emos_search_memories\n\n{...}").
    // Try to find the first JSON object or array and parse from there.
    const jsonStart = src.search(/[{[]/);
    if (jsonStart > 0) {
      try {
        parsed = JSON.parse(src.slice(jsonStart));
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  const rawItems: Record<string, unknown>[] = [];
  collectEmosMemories(parsed, rawItems);

  const normalized = rawItems
    .map((raw) => {
      // Try to get message_id from standard fields
      let message_id = pickString(raw, ['message_id', 'event_id', 'id', 'memory_id']);

      // If no message_id, generate one from user_id + timestamp (new EMOS API format)
      if (!message_id) {
        const user_id = pickString(raw, ['user_id']);
        const timestamp = pickString(raw, ['timestamp']);
        if (user_id && timestamp) {
          message_id = `${user_id}:${timestamp}`;
        } else {
          return null;
        }
      }

      const summary = pickString(raw, ['summary']);
      const content = summary || pickString(raw, ['content', 'text', 'excerpt']);
      if (!content) return null;

      const item: MemoryItem = { message_id, content };

      const sender = pickString(raw, ['sender', 'user_id']);
      const sender_name = pickString(raw, ['sender_name']);
      const role = pickString(raw, ['role']);
      const create_time = pickString(raw, ['timestamp', 'create_time']);
      const group_id = pickString(raw, ['group_id']);
      const group_name = pickString(raw, ['group_name']);
      const source_url = pickString(raw, ['source_url', 'url']);
      const metadata = isObjectRecord(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null;

      if (sender) item.sender = sender;
      if (sender_name) item.sender_name = sender_name;
      if (role) item.role = role;
      if (create_time) item.create_time = create_time;
      if (group_id) item.group_id = group_id;
      if (group_name) item.group_name = group_name;
      if (source_url) item.source_url = source_url;
      if (metadata) item.metadata = metadata;

      return item;
    })
    .filter((item): item is MemoryItem => !!item);

  return Array.from(new Map(normalized.map((item) => [item.message_id, item])).values());
}
