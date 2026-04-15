<template>
  <div ref="rootRef" class="group min-w-0">
    <!-- User Query Header -->
    <div class="mb-4">
      <div class="flex items-start gap-2">
        <!-- Edit button (placeholder, appears on hover) -->
        <button
          class="opacity-0 group-hover:opacity-100 transition-all p-1 cursor-pointer"
          :style="{ color: 'var(--ac-text-subtle)' }"
          title="Edit (coming soon)"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
        <div class="user-header-bubble min-w-0 flex-1">
          <!-- Special rendering for web editor apply messages -->
          <ApplyMessageChip v-if="thread.header?.webEditorApply" :header="thread.header" />

          <!-- Default title rendering for regular messages -->
          <h2
            v-else
            class="min-w-0 text-base leading-snug break-words"
            :style="{
              overflowWrap: 'anywhere',
            }"
          >
            {{ thread.title }}
          </h2>

          <!-- Attachment thumbnails -->
          <div v-if="thread.attachments.length > 0" class="flex flex-wrap gap-2 mt-3">
            <button
              v-for="attachment in thread.attachments"
              :key="`${attachment.messageId}:${attachment.index}`"
              type="button"
              class="relative group/thumb w-16 h-16 rounded-lg overflow-hidden transition-opacity hover:opacity-90 cursor-pointer"
              :style="{
                backgroundColor: 'var(--ac-surface-muted)',
                border: 'var(--ac-border-width) solid var(--ac-border)',
              }"
              :title="attachment.originalName"
              @click="openViewer(attachment)"
            >
              <img
                v-if="getAttachmentUrl(attachment)"
                :src="getAttachmentUrl(attachment)!"
                :alt="attachment.originalName"
                class="w-full h-full object-cover"
                loading="lazy"
              />
              <!-- Fallback placeholder when server not ready -->
              <div
                v-else
                class="w-full h-full flex items-center justify-center"
                :style="{ color: 'var(--ac-text-subtle)' }"
                title="Server not ready"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <!-- Filename overlay on hover -->
              <div
                class="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 text-[8px] truncate opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                :style="{
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  color: 'white',
                }"
              >
                {{ attachment.originalName }}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <AgentTimeline :items="thread.items" :state="thread.state" />

    <!-- Citation Detail Modal (teleported to avoid stacking context issues) -->
    <Teleport :to="overlayTarget" :disabled="!overlayTarget">
      <EmosCitationDetailModal
        v-if="selectedCitation"
        :item="selectedCitation"
        @close="selectedCitation = null"
      />
    </Teleport>

    <!-- Image Viewer Modal (teleported to avoid stacking context issues) -->
    <Teleport :to="overlayTarget" :disabled="!overlayTarget">
      <div
        v-if="viewerAttachment"
        class="fixed inset-0 z-50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60" @click="closeViewer" />

        <!-- Image container -->
        <div
          class="relative max-w-[92vw] max-h-[92vh] overflow-hidden"
          :style="{
            backgroundColor: 'var(--ac-surface, #ffffff)',
            border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
            borderRadius: 'var(--ac-radius-card, 12px)',
            boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.2))',
          }"
        >
          <!-- Close button -->
          <button
            type="button"
            class="absolute top-2 right-2 p-1 rounded-full transition-colors hover:bg-black/20 cursor-pointer"
            :style="{ color: 'white' }"
            aria-label="Close image preview"
            @click="closeViewer"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <!-- Full-size image -->
          <img
            v-if="viewerUrl"
            :src="viewerUrl"
            :alt="viewerAttachment.originalName"
            class="block max-w-[92vw] max-h-[92vh] object-contain"
          />
          <div v-else class="p-6 text-sm" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
            Agent server not ready (missing server port).
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import type { AttachmentMetadata } from 'chrome-mcp-shared';
import { computed, inject, onMounted, provide, ref, watch } from 'vue';
import { AGENT_SERVER_PORT_KEY } from '../../composables';
import {
  EMOS_CITATION_MEMORIES_BY_ID_KEY,
  EMOS_CITATION_OPEN_DETAILS_KEY,
  extractEmosCitationMemoriesFromToolResultText,
} from '../../composables/emos-citations';
import type { AgentThread } from '../../composables/useAgentThreads';
import type { MemoryItem } from '../../composables/useEmosSearch';
import AgentTimeline from './AgentTimeline.vue';
import ApplyMessageChip from './ApplyMessageChip.vue';
import EmosCitationDetailModal from './EmosCitationDetailModal.vue';

const props = defineProps<{
  thread: AgentThread;
}>();

function getToolName(meta: Record<string, unknown> | undefined): string {
  const raw =
    (meta?.toolName as string | undefined) ??
    (meta?.tool_name as string | undefined) ??
    (meta?.name as string | undefined) ??
    '';
  return String(raw || '')
    .trim()
    .toLowerCase();
}

const citationMemoriesById = computed(() => {
  const map = new Map<string, MemoryItem>();
  for (const item of props.thread.items) {
    if (item.kind !== 'tool_result') continue;
    // Match by metadata toolName or by resolved tool kind
    const toolName = getToolName(item.tool.raw.metadata);
    const isEmosSearch =
      toolName === 'memory_search' ||
      toolName.endsWith('__memory_search') ||
      toolName === 'emos_search_memories' ||
      toolName.endsWith('__emos_search_memories') ||
      item.tool.kind === 'recall';
    if (!isEmosSearch) continue;

    const extracted = extractEmosCitationMemoriesFromToolResultText(item.tool.raw.content);
    for (const memory of extracted) {
      map.set(memory.message_id, memory);
    }
  }
  return map;
});

provide(EMOS_CITATION_MEMORIES_BY_ID_KEY, citationMemoriesById);

// Citation detail modal
const selectedCitation = ref<MemoryItem | null>(null);

provide(EMOS_CITATION_OPEN_DETAILS_KEY, (item: MemoryItem) => {
  selectedCitation.value = item;
});

// Inject server port from parent
const serverPort = inject(AGENT_SERVER_PORT_KEY, ref<number | null>(null));

// Compute base URL for attachment requests
const baseUrl = computed(() => {
  const port = serverPort.value;
  if (!Number.isInteger(port) || port === null || port <= 0) return null;
  return `http://127.0.0.1:${port}`;
});

/**
 * Build full URL for an attachment.
 * Ensures urlPath starts with / for proper concatenation.
 */
function getAttachmentUrl(attachment: AttachmentMetadata): string | null {
  const base = baseUrl.value;
  if (!base) return null;
  const path = attachment.urlPath.startsWith('/') ? attachment.urlPath : `/${attachment.urlPath}`;
  return `${base}${path}`;
}

// Teleport target for modal overlay
const rootRef = ref<HTMLElement | null>(null);
const overlayTarget = ref<Element | null>(null);

// Image viewer state
const viewerAttachment = ref<AttachmentMetadata | null>(null);
const viewerUrl = computed(() => {
  if (!viewerAttachment.value) return null;
  return getAttachmentUrl(viewerAttachment.value);
});

function openViewer(attachment: AttachmentMetadata): void {
  viewerAttachment.value = attachment;
}

function closeViewer(): void {
  viewerAttachment.value = null;
}

// Handle Escape key to close viewer or citation modal
function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (selectedCitation.value) {
      selectedCitation.value = null;
    } else if (viewerAttachment.value) {
      closeViewer();
    }
  }
}

// Register/unregister keyboard listener when any overlay is open
watch(
  () => viewerAttachment.value ?? selectedCitation.value,
  (current, _prev, onCleanup) => {
    if (!current) return;
    document.addEventListener('keydown', handleKeydown);
    onCleanup(() => document.removeEventListener('keydown', handleKeydown));
  },
);

onMounted(() => {
  // Find teleport target (agent-theme container or body)
  overlayTarget.value =
    rootRef.value?.closest('.agent-theme') ?? rootRef.value?.ownerDocument?.body ?? null;
});
</script>

<style scoped>
.user-header-bubble {
  border-radius: var(--ac-radius-card);
  border-color: color-mix(in srgb, var(--ac-accent) 75%, transparent);
  border-width: var(--ac-border-width);
  padding: 10px 12px;
}

.user-header-bubble :deep(*) {
  color: var(--ac-text);
}
</style>
