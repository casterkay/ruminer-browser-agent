<template>
  <span class="emos-cite-root" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <button type="button" class="emos-cite-pill ac-btn ac-focus-ring" @click="handleClick">
      {{ displayText }}
    </button>
    <div v-if="hovered" class="emos-cite-bubble" role="tooltip">
      <!-- Show citation items if available -->
      <button
        v-for="item in displayItems"
        :key="item.key"
        type="button"
        class="emos-cite-bubble-item ac-btn"
        @click="handleOpenItem(item)"
      >
        {{ item.content }}
      </button>
    </div>
  </span>
</template>

<script lang="ts" setup>
import { computed, inject, ref } from 'vue';
import {
  EMOS_CITATION_OPEN_DETAILS_KEY,
  type EmosCitationOpenDetails,
} from '../../../composables/emos-citations';

interface EmosCiteNodeType {
  type: 'emos-cite';
  tag?: string;
  content: string;
  raw: string;
  loading?: boolean;
  autoClosed?: boolean;
  attrs?: Array<[string, string]>;
}

interface CitationItem {
  key: string;
  senderLabel: string;
  dateLabel: string;
  content: string;
  rawTimestamp: string; // Raw timestamp for the modal
}

const props = defineProps<{
  node: EmosCiteNodeType;
}>();

const hovered = ref(false);

const openDetails = inject<EmosCitationOpenDetails | null>(EMOS_CITATION_OPEN_DETAILS_KEY, null);

function getAttr(name: string): string {
  const attrs = props.node.attrs ?? [];
  for (const [k, v] of attrs) {
    if (k === name) return String(v ?? '');
  }
  return '';
}

const keys = computed(() => {
  const raw = getAttr('keys');
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
});

const contents = computed(() => {
  const raw = getAttr('contents');
  return raw.split('|||').map((v) => v.trim());
});

const displayText = computed(() => {
  if (keys.value.length === 0) return '[^?]';
  return `[^${keys.value.join(',')}]`;
});

// Parse footnote content like "user_123,2024-01-15T10:30:00: Discussed coffee choices"
// Format: {sender}, {time}: {summary}
// Fallback: if format doesn't match, treat whole content as summary
function parseFootnoteContent(content: string): {
  sender: string;
  date: string;
  summary: string;
  rawTimestamp: string;
} {
  // Try to match the expected format: "sender,timestamp: summary"
  const match = content.match(/^(.+?),(.+?):\s*(.+)$/);
  if (match) {
    const sender = match[1].trim();
    const rawTimestamp = match[2].trim();
    const summary = match[3].trim();
    let date = '';
    try {
      date = new Date(rawTimestamp).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      date = rawTimestamp;
    }
    return { sender, date, summary, rawTimestamp };
  }

  // Fallback: treat whole content as summary
  return { sender: '', date: '', summary: content, rawTimestamp: '' };
}

const citationItems = computed((): CitationItem[] => {
  const items: CitationItem[] = [];
  const k = keys.value;
  const c = contents.value;

  for (let idx = 0; idx < k.length; idx++) {
    const key = k[idx];
    const content = c[idx] ?? '';
    if (!content) continue;

    const parsed = parseFootnoteContent(content);
    items.push({
      key,
      senderLabel: parsed.sender,
      dateLabel: parsed.date,
      content: parsed.summary,
      rawTimestamp: parsed.rawTimestamp,
    });
  }

  return items;
});

const displayItems = computed(() => citationItems.value);

function handleOpenItem(item: CitationItem): void {
  if (!openDetails) return;
  // Create a minimal MemoryItem for the modal
  openDetails({
    message_id: item.key,
    content: item.content,
    sender: item.senderLabel,
    create_time: item.dateLabel,
  });
}

function handleClick(): void {
  const first = citationItems.value[0];
  if (!first) return;
  handleOpenItem(first);
}
</script>

<style scoped>
.emos-cite-root {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.emos-cite-pill {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 18px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--ac-font-mono);
  color: var(--ac-accent);
  background: color-mix(in srgb, var(--ac-accent) 10%, transparent);
  border: var(--ac-border-width) solid color-mix(in srgb, var(--ac-accent) 45%, transparent);
  cursor: pointer;
  transform: translateY(-1px);
}

.emos-cite-bubble {
  position: absolute;
  z-index: 1000;
  top: 22px;
  left: 0;
  width: min(420px, 72vw);
  border-radius: var(--ac-radius-card);
  background: var(--ac-surface);
  border: var(--ac-border-width) solid var(--ac-border);
  box-shadow: var(--ac-shadow-float);
}

.emos-cite-bubble-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ac-text-subtle);
  margin-bottom: 6px;
  font-family: var(--ac-font-body);
}

.emos-cite-bubble-empty {
  font-size: 11px;
  color: var(--ac-text-muted);
  font-family: var(--ac-font-body);
}

.emos-cite-bubble-empty code {
  font-family: var(--ac-font-mono);
}

.emos-cite-bubble-item {
  width: 100%;
  text-align: left;
  padding: 4px;
  border-radius: var(--ac-radius-inner);
  background: var(--ac-surface-inset);
  border: var(--ac-border-width) solid var(--ac-border);
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.emos-cite-bubble-item:hover {
  background: color-mix(in srgb, var(--ac-accent) 8%, var(--ac-surface-inset));
}

.emos-cite-bubble-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--ac-text-subtle);
  font-family: var(--ac-font-mono);
  margin-bottom: 4px;
}

.emos-cite-bubble-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
