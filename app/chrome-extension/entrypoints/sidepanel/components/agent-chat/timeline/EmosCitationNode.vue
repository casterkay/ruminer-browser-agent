<template>
  <span class="emos-cite-root" @mouseenter="hovered = true" @mouseleave="hovered = false">
    <button
      type="button"
      class="emos-cite-pill ac-btn ac-focus-ring"
      :title="titleText"
      @click="handleClick"
    >
      {{ displayText }}
    </button>

    <div v-if="hovered" class="emos-cite-bubble" role="tooltip">
      <div class="emos-cite-bubble-title">Citations</div>
      <div v-if="citationItems.length === 0" class="emos-cite-bubble-empty">
        No preview yet. Ask the agent to run <code>emos_search_memories</code>.
      </div>

      <button
        v-for="item in citationItems"
        :key="item.message_id"
        type="button"
        class="emos-cite-bubble-item ac-btn"
        @click="handleOpenItem(item)"
      >
        <div class="emos-cite-bubble-meta">
          <span class="emos-cite-bubble-key">[^{{ item.key }}]</span>
          <span class="emos-cite-bubble-id">{{ item.message_id }}</span>
        </div>
        <div class="emos-cite-bubble-summary">{{ item.content }}</div>
      </button>
    </div>
  </span>
</template>

<script lang="ts" setup>
import { computed, inject, ref } from 'vue';
import type { MemoryItem } from '../../../composables/useEmosSearch';
import {
  EMOS_CITATION_MEMORIES_BY_ID_KEY,
  EMOS_CITATION_OPEN_DETAILS_KEY,
  type EmosCitationMemoriesById,
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

const props = defineProps<{
  node: EmosCiteNodeType;
}>();

const hovered = ref(false);

const memoriesByIdRef = inject(
  EMOS_CITATION_MEMORIES_BY_ID_KEY,
  ref<EmosCitationMemoriesById>(new Map()),
);
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

const messageIds = computed(() => {
  const raw = getAttr('message-ids');
  // Keep positional mapping with `keys` (do not drop empty IDs).
  return raw.split(',').map((v) => v.trim());
});

const displayText = computed(() => {
  if (keys.value.length === 0) return '[^?]';
  return `[^${keys.value.join(',')}]`;
});

const titleText = computed(() => {
  const ids = messageIds.value;
  const filtered = ids.filter((id) => id.length > 0);
  if (filtered.length === 0) return 'Citation';
  return filtered.join('\n');
});

const citationItems = computed(() => {
  const items: Array<MemoryItem & { key: string }> = [];
  const k = keys.value;
  const ids = messageIds.value;

  for (let idx = 0; idx < k.length; idx++) {
    const key = k[idx];
    const messageId = ids[idx] ?? '';
    const item = messageId ? memoriesByIdRef.value.get(messageId) : undefined;
    if (!item) continue;
    items.push({ ...item, key });
  }

  return items;
});

function handleOpenItem(item: MemoryItem): void {
  if (!openDetails) return;
  openDetails(item);
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
  padding: 10px;
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
  padding: 8px;
  margin: 6px 0 0;
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

.emos-cite-bubble-summary {
  font-size: 11px;
  color: var(--ac-text);
  font-family: var(--ac-font-body);
  display: -webkit-box;
  overflow: hidden;
  line-clamp: 4;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
}
</style>
