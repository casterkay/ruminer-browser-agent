<template>
  <div class="relative" @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">
    <!-- Drag overlay -->
    <div
      v-if="isDragOver"
      class="absolute inset-0 z-10 flex items-center justify-center rounded-lg pointer-events-none"
      :style="{
        backgroundColor: 'var(--ac-accent)',
        opacity: 0.1,
        border: '2px dashed var(--ac-accent)',
      }"
    >
      <span class="text-sm font-medium" :style="{ color: 'var(--ac-accent)' }">
        Drop images here
      </span>
    </div>

    <!-- Image Previews (thumbnails) -->
    <div v-if="attachments.length > 0" class="flex flex-wrap gap-2 mb-2 px-1">
      <div v-for="(attachment, index) in attachments" :key="index" class="relative group">
        <!-- Thumbnail container -->
        <div
          class="w-14 h-14 rounded-lg overflow-hidden"
          :style="{
            backgroundColor: 'var(--ac-surface-muted)',
            border: 'var(--ac-border-width) solid var(--ac-border)',
          }"
        >
          <img
            v-if="attachment.type === 'image' && attachment.previewUrl"
            :src="attachment.previewUrl"
            :alt="attachment.name"
            class="w-full h-full object-cover"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center"
            :style="{ color: 'var(--ac-text-subtle)' }"
          >
            <ILucideImage class="w-6 h-6" />
          </div>
        </div>
        <!-- Remove button -->
        <button
          class="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity cursor-pointer z-10 shadow-sm"
          :style="{
            backgroundColor: 'var(--ac-error, #e55353)',
            color: 'white',
          }"
          title="Remove"
          @click="$emit('attachment:remove', index)"
        >
          <ILucideX class="w-2.5 h-2.5" />
        </button>
        <!-- Filename tooltip on hover -->
        <div
          class="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 text-[8px] truncate opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg"
          :style="{
            backgroundColor: 'rgba(0,0,0,0.6)',
            color: 'white',
          }"
        >
          {{ attachment.name }}
        </div>
      </div>
    </div>

    <!-- Attachment error message -->
    <div v-if="attachmentError" class="px-1 mb-1 text-xs" :style="{ color: 'var(--ac-error)' }">
      {{ attachmentError }}
    </div>

    <!-- Floating Input Card -->
    <div
      class="flex flex-col transition-all"
      :style="{
        backgroundColor: 'var(--ac-surface)',
        borderRadius: 'var(--ac-radius-card)',
        border: isDragOver
          ? '2px solid var(--ac-accent)'
          : 'var(--ac-border-width) solid var(--ac-border)',
        boxShadow: 'var(--ac-shadow-float)',
      }"
    >
      <!-- Textarea wrapper with expand button -->
      <div class="relative">
        <textarea
          ref="textareaRef"
          :value="modelValue"
          :class="[
            'w-full bg-transparent border-none focus:ring-0 focus:outline-none resize-none p-3 text-sm',
            showExpandButton ? 'pr-10' : '',
          ]"
          :style="{
            height: `${textareaHeight}px`,
            minHeight: `${MIN_HEIGHT}px`,
            maxHeight: `${MAX_HEIGHT}px`,
            overflowY: isOverflowing ? 'auto' : 'hidden',
            fontFamily: 'var(--ac-font-body)',
            color: 'var(--ac-text)',
          }"
          :placeholder="placeholder"
          rows="1"
          @input="handleInput"
          @keydown.enter.exact.prevent="handleEnter"
          @paste="handlePaste"
        />

        <!-- Fake caret overlay (opt-in comet effect, only mount when enabled) -->
        <FakeCaretOverlay
          v-if="enableFakeCaret"
          :textarea-ref="textareaRef"
          :enabled="true"
          :value="modelValue"
        />

        <!-- Expand button (visible when content exceeds max height) -->
        <Transition name="expand-btn">
          <button
            v-if="showExpandButton"
            type="button"
            class="absolute top-2 right-2 p-1.5 transition-all hover:scale-105 cursor-pointer"
            :style="expandButtonStyle"
            title="Expand editor"
            @click="openDrawer"
          >
            <ILucideMaximize2 class="w-3.5 h-3.5" />
          </button>
        </Transition>
      </div>

      <div class="flex items-center justify-between px-2 pb-2">
        <!-- Left Tools -->
        <div class="flex items-center gap-1">
          <!-- Screenshot Button -->
          <button
            v-if="supportsImages"
            class="p-1.5 ac-btn"
            :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Take screenshot"
            @click="$emit('attachment:screenshot')"
          >
            <ILucideCamera class="w-4 h-4" />
          </button>

          <!-- Attach Button -->
          <button
            v-if="supportsImages"
            class="p-1.5 ac-btn"
            :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Attach file"
            @click="$emit('attachment:add')"
          >
            <ILucidePaperclip class="w-4 h-4" />
          </button>

          <!-- OpenClaw Agent Selector (auto-width) -->
          <div
            v-if="isOpenClawEngine && (openclawAgents?.length || 0) > 0"
            class="relative"
            data-tooltip="Switch agent"
          >
            <span
              ref="openclawAgentWidthRef"
              class="invisible absolute whitespace-nowrap px-1.5 text-[10px]"
              :style="{ fontFamily: 'var(--ac-font-mono)' }"
            >
              {{ selectedOpenClawAgentName }}
            </span>
            <select
              :value="selectedOpenclawAgentId"
              class="py-0.5 text-[10px] border-none bg-transparent cursor-pointer appearance-none pr-4 pl-1.5"
              :style="{
                color: 'var(--ac-text-muted)',
                fontFamily: 'var(--ac-font-mono)',
                width: openclawAgentSelectWidth,
                borderRadius: 'var(--ac-radius-button)',
              }"
              @change="handleOpenClawAgentChange"
            >
              <option v-for="a in openclawAgents" :key="a.id" :value="a.id">
                {{ a.name || a.id }}
              </option>
            </select>
            <ILucideChevronDown
              class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              :style="{ color: 'var(--ac-text-subtle)' }"
            />
          </div>

          <!-- Model Selector (auto-width) -->
          <div v-if="availableModels.length > 0" class="relative" data-tooltip="Switch model">
            <!-- Hidden span to measure text width -->
            <span
              ref="modelWidthRef"
              class="invisible absolute whitespace-nowrap px-1.5 text-[10px]"
              :style="{ fontFamily: 'var(--ac-font-mono)' }"
            >
              {{ selectedModelName }}
            </span>
            <select
              :value="selectedModel"
              class="py-0.5 text-[10px] border-none bg-transparent cursor-pointer appearance-none pr-4 pl-1.5"
              :style="{
                color: 'var(--ac-text-muted)',
                fontFamily: 'var(--ac-font-mono)',
                width: modelSelectWidth,
                borderRadius: 'var(--ac-radius-button)',
              }"
              @change="handleModelChange"
            >
              <option v-for="m in availableModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
            <!-- Dropdown arrow -->
            <ILucideChevronDown
              class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              :style="{ color: 'var(--ac-text-subtle)' }"
            />
          </div>

          <!-- Reasoning Effort (Codex only) -->
          <select
            v-if="
              isCodexEngine && availableReasoningEfforts && availableReasoningEfforts.length > 0
            "
            :value="reasoningEffort"
            class="px-1.5 py-0.5 text-[10px] border-none bg-transparent cursor-pointer"
            :style="{
              color: 'var(--ac-text-muted)',
              fontFamily: 'var(--ac-font-mono)',
              borderRadius: 'var(--ac-radius-button)',
            }"
            data-tooltip="Reasoning effort"
            @change="handleReasoningEffortChange"
          >
            <option v-for="effort in availableReasoningEfforts" :key="effort" :value="effort">
              {{ effort }}
            </option>
          </select>

          <!-- Tools Button -->
          <button
            class="p-1 ac-btn"
            :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Tools"
            @click="handleOpenTools"
          >
            <ILucideWrench class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Right Actions -->
        <div class="flex gap-2">
          <!-- Primary Action Button: Send (idle) / Stop (loading) -->
          <button
            type="button"
            class="p-1 transition-colors cursor-pointer"
            :style="primaryActionButtonStyle"
            :disabled="primaryActionDisabled"
            :title="isRequestActive ? 'Stop' : 'Send'"
            :aria-label="isRequestActive ? 'Stop request' : 'Send message'"
            @click="handlePrimaryAction"
          >
            <!-- Stop icon (square) when request is active -->
            <ILucideSquare v-if="isRequestActive" class="w-3.5 h-3.5 fill-current" />
            <!-- Send icon (arrow up) when idle -->
            <ILucideArrowUp v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Expanded editor drawer -->
    <ComposerDrawer
      :open="isDrawerOpen"
      :model-value="modelValue"
      :placeholder="placeholder"
      :attachments="attachments"
      :attachment-error="attachmentError"
      :request-state="requestState"
      :sending="sending"
      :cancelling="cancelling"
      :can-cancel="canCancel"
      :can-send="canSend"
      :enable-fake-caret="enableFakeCaret"
      @close="closeDrawer"
      @update:model-value="handleDrawerInput"
      @submit="handleSubmit"
      @cancel="$emit('cancel')"
      @attachment:remove="$emit('attachment:remove', $event)"
      @paste="handlePaste"
    >
      <template #left-actions>
        <div class="flex items-center gap-1">
          <!-- Screenshot Button -->
          <button
            v-if="supportsImages"
            class="p-1.5 ac-btn"
            :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Take screenshot"
            @click="$emit('attachment:screenshot')"
          >
            <ILucideCamera class="w-4 h-4" />
          </button>

          <!-- Attach Button -->
          <button
            v-if="supportsImages"
            class="p-1.5 ac-btn"
            :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
            data-tooltip="Attach file"
            @click="$emit('attachment:add')"
          >
            <ILucidePaperclip class="w-4 h-4" />
          </button>

          <!-- OpenClaw Agent Selector -->
          <div
            v-if="isOpenClawEngine && (openclawAgents?.length || 0) > 0"
            class="relative"
            data-tooltip="Switch agent"
          >
            <select
              :value="selectedOpenclawAgentId"
              class="py-0.5 text-[10px] border-none bg-transparent cursor-pointer appearance-none pr-4 pl-1.5"
              :style="{
                color: 'var(--ac-text-muted)',
                fontFamily: 'var(--ac-font-mono)',
                borderRadius: 'var(--ac-radius-button)',
              }"
              @change="handleOpenClawAgentChange"
            >
              <option v-for="a in openclawAgents" :key="a.id" :value="a.id">
                {{ a.name || a.id }}
              </option>
            </select>
            <ILucideChevronDown
              class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              :style="{ color: 'var(--ac-text-subtle)' }"
            />
          </div>

          <!-- Model Selector -->
          <div v-if="availableModels.length > 0" class="relative" data-tooltip="Switch model">
            <select
              :value="selectedModel"
              class="py-0.5 text-[10px] border-none bg-transparent cursor-pointer appearance-none pr-4 pl-1.5"
              :style="{
                color: 'var(--ac-text-muted)',
                fontFamily: 'var(--ac-font-mono)',
                borderRadius: 'var(--ac-radius-button)',
              }"
              @change="handleModelChange"
            >
              <option v-for="m in availableModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
            <ILucideChevronDown
              class="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              :style="{ color: 'var(--ac-text-subtle)' }"
            />
          </div>

          <!-- Status Text -->
          <div class="text-[11px] ml-1 flex items-center gap-1" :style="{ color: statusColor }">
            <span
              v-if="sending || isRequestActive"
              class="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              :style="{ backgroundColor: 'var(--ac-accent)' }"
            />
            {{ statusText }}
          </div>
        </div>
      </template>
    </ComposerDrawer>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, nextTick, toRef } from 'vue';
import type { CodexReasoningEffort, OpenClawAgentDto } from 'chrome-mcp-shared';
import type { ModelDefinition } from '@/common/agent-models';
import type { AttachmentWithPreview } from '../../composables/useAttachments';
import type { RequestState } from '../../composables/useAgentChat';
import { useTextareaAutoResize } from '../../composables/useTextareaAutoResize';
import ILucideWrench from '~icons/lucide/wrench';
import ILucidePaperclip from '~icons/lucide/paperclip';
import ILucideCamera from '~icons/lucide/camera';
import ILucideImage from '~icons/lucide/image';
import ILucideX from '~icons/lucide/x';
import ILucideMaximize2 from '~icons/lucide/maximize-2';
import ILucideChevronDown from '~icons/lucide/chevron-down';
import ILucideSquare from '~icons/lucide/square';
import ILucideArrowUp from '~icons/lucide/arrow-up';
import ComposerDrawer from './ComposerDrawer.vue';
import FakeCaretOverlay from './FakeCaretOverlay.vue';

const props = defineProps<{
  modelValue: string;
  attachments: AttachmentWithPreview[];
  attachmentError?: string | null;
  isDragOver?: boolean;
  /** Message-level streaming state (delta updates) */
  isStreaming: boolean;
  /** Request lifecycle state for UI (stop button, loading indicators) */
  requestState: RequestState;
  sending: boolean;
  cancelling: boolean;
  canCancel: boolean;
  canSend: boolean;
  placeholder?: string;
  // Model selection props
  engineName?: string;
  selectedModel: string;
  availableModels: ModelDefinition[];
  // OpenClaw agent selection props
  openclawAgents?: OpenClawAgentDto[];
  selectedOpenclawAgentId?: string;
  // Codex reasoning effort props
  reasoningEffort?: CodexReasoningEffort;
  availableReasoningEfforts?: readonly CodexReasoningEffort[];
  // Fake caret feature flag
  enableFakeCaret?: boolean;
}>();

/**
 * Whether there is an active request in progress.
 * Derived from requestState for use in UI conditions.
 */
const isRequestActive = computed(() => {
  return (
    props.requestState === 'starting' ||
    props.requestState === 'ready' ||
    props.requestState === 'running'
  );
});

const isCodexEngine = computed(() => props.engineName === 'codex');
const isOpenClawEngine = computed(() => props.engineName === 'openclaw');

// Image upload is supported for Claude, Codex, and OpenClaw engines
const supportsImages = computed(() => {
  const engine = props.engineName;
  return engine === 'claude' || engine === 'codex' || engine === 'openclaw';
});

// Model selector auto-width
const modelWidthRef = ref<HTMLSpanElement | null>(null);
const modelSelectWidth = ref('auto');

// OpenClaw agent selector auto-width
const openclawAgentWidthRef = ref<HTMLSpanElement | null>(null);
const openclawAgentSelectWidth = ref('auto');

const selectedModelName = computed(() => {
  const model = props.availableModels.find((m) => m.id === props.selectedModel);
  return model?.name || props.selectedModel || '';
});

const selectedOpenClawAgentName = computed(() => {
  const selectedId = (props.selectedOpenclawAgentId || '').trim();
  if (!selectedId) return '';
  const agent = (props.openclawAgents || []).find((a) => a.id === selectedId);
  return agent?.name || agent?.id || selectedId;
});

// Update width when model changes
watch(
  [selectedModelName, () => props.availableModels],
  async () => {
    await nextTick();
    if (modelWidthRef.value) {
      const width = modelWidthRef.value.offsetWidth;
      // Add extra space for dropdown arrow (16px)
      modelSelectWidth.value = `${width + 16}px`;
    }
  },
  { immediate: true },
);

// Update width when OpenClaw agent changes
watch(
  [selectedOpenClawAgentName, () => props.openclawAgents],
  async () => {
    await nextTick();
    if (openclawAgentWidthRef.value) {
      const width = openclawAgentWidthRef.value.offsetWidth;
      openclawAgentSelectWidth.value = `${Math.max(width + 16, 48)}px`;
    }
  },
  { immediate: true },
);

const statusText = computed(() => {
  if (props.sending) return 'Sending...';
  if (props.cancelling) return 'Stopping...';
  // Use requestState for more accurate status display
  switch (props.requestState) {
    case 'starting':
      return 'Starting...';
    case 'ready':
      return 'Preparing...';
    case 'running':
      return 'Working...';
    default:
      return 'Ready';
  }
});

const statusColor = computed(() => {
  if (props.sending || isRequestActive.value) return 'var(--ac-accent)';
  return 'var(--ac-text-subtle)';
});

// =============================================================================
// Primary Action Button (Send / Stop)
// =============================================================================

/**
 * Style for the primary action button.
 * Changes based on whether a request is active.
 */
const primaryActionButtonStyle = computed(() => {
  const baseStyle = {
    borderRadius: 'var(--ac-radius-button)',
    // Always have border to prevent size change when switching modes
    border: 'var(--ac-border-width) solid transparent',
  };

  if (isRequestActive.value) {
    // Stop mode: danger style
    const isDisabled = props.cancelling || !props.canCancel;
    return {
      ...baseStyle,
      backgroundColor: 'var(--ac-diff-del-bg)',
      color: 'var(--ac-danger)',
      border: 'var(--ac-border-width) solid var(--ac-diff-del-border)',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.6 : 1,
    };
  }

  // Send mode: accent style when enabled, muted when disabled
  return {
    ...baseStyle,
    backgroundColor: props.canSend ? 'var(--ac-accent)' : 'var(--ac-surface-muted)',
    color: props.canSend ? 'var(--ac-accent-contrast)' : 'var(--ac-text-subtle)',
    cursor: props.canSend ? 'pointer' : 'not-allowed',
  };
});

/**
 * Whether the primary action button should be disabled.
 */
const primaryActionDisabled = computed(() => {
  if (isRequestActive.value) {
    // In stop mode: disabled when already cancelling or cannot cancel
    return props.cancelling || !props.canCancel;
  }
  // In send mode: disabled when cannot send
  return !props.canSend;
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  cancel: [];
  'attachment:add': [];
  'attachment:screenshot': [];
  'attachment:remove': [index: number];
  'attachment:drop': [event: DragEvent];
  'attachment:paste': [event: ClipboardEvent];
  'attachment:dragover': [event: DragEvent];
  'attachment:dragleave': [event: DragEvent];
  'model:change': [modelId: string];
  'openclaw-agent:change': [agentId: string];
  'reasoning-effort:change': [effort: CodexReasoningEffort];
  'tools:open': [];
  'session:reset': [];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

// =============================================================================
// Textarea Auto-Resize
// =============================================================================

const MIN_HEIGHT = 50;
const MAX_HEIGHT = 200;

const { height: textareaHeight, isOverflowing } = useTextareaAutoResize({
  textareaRef,
  value: toRef(props, 'modelValue'),
  minHeight: MIN_HEIGHT,
  maxHeight: MAX_HEIGHT,
});

// Show expand button when content exceeds max height
const showExpandButton = computed(() => isOverflowing.value);

// Expand button style
const expandButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text)',
  border: 'var(--ac-border-width) solid var(--ac-border)',
  borderRadius: 'var(--ac-radius-button)',
}));

// =============================================================================
// Expanded Editor Drawer
// =============================================================================

const isDrawerOpen = ref(false);

function openDrawer(): void {
  isDrawerOpen.value = true;
}

function closeDrawer(): void {
  isDrawerOpen.value = false;
  // Focus back to main textarea
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

function handleDrawerInput(value: string): void {
  emit('update:modelValue', value);
}

// =============================================================================
// Input Handlers
// =============================================================================

function handleInput(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  emit('update:modelValue', value);
}

function handleEnter(): void {
  // Don't send when request is active (button shows Stop, not Send)
  if (isRequestActive.value) return;
  if (props.canSend && !props.sending) {
    emit('submit');
  }
}

function handleSubmit(): void {
  emit('submit');
}

/**
 * Handle primary action button click.
 * Sends message when idle, cancels request when active.
 */
function handlePrimaryAction(): void {
  if (isRequestActive.value) {
    emit('cancel');
  } else {
    handleSubmit();
  }
}

function handleModelChange(event: Event): void {
  const modelId = (event.target as HTMLSelectElement).value;
  emit('model:change', modelId);
}

function handleOpenClawAgentChange(event: Event): void {
  const agentId = (event.target as HTMLSelectElement).value;
  emit('openclaw-agent:change', agentId);
}

function handleReasoningEffortChange(event: Event): void {
  const effort = (event.target as HTMLSelectElement).value as CodexReasoningEffort;
  emit('reasoning-effort:change', effort);
}

function handleReset(): void {
  if (
    confirm(
      'Reset this conversation? All messages will be deleted and the session will start fresh.',
    )
  ) {
    emit('session:reset');
  }
}

function handleOpenTools(): void {
  emit('tools:open');
}

// Drag and drop handlers - delegate to parent
// Always preventDefault to avoid browser default behavior (opening files)
function handleDragOver(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (supportsImages.value) {
    emit('attachment:dragover', event);
  }
}

function handleDragLeave(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (supportsImages.value) {
    emit('attachment:dragleave', event);
  }
}

function handleDrop(event: DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (supportsImages.value) {
    emit('attachment:drop', event);
  }
}

// Paste handler - delegate to parent
function handlePaste(event: ClipboardEvent): void {
  if (supportsImages.value) {
    // Check if clipboard contains images
    const items = event.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          emit('attachment:paste', event);
          return;
        }
      }
    }
  }
  // Let text paste through normally
}

// Expose ref for parent focus control
defineExpose({
  focus: () => textareaRef.value?.focus(),
});
</script>

<style scoped>
/* Expand button transition */
.expand-btn-enter-active,
.expand-btn-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.expand-btn-enter-from,
.expand-btn-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
