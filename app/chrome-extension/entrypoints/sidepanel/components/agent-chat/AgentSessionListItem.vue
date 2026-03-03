<template>
  <div
    class="group relative px-3 py-3 cursor-pointer transition-colors"
    :style="containerStyle"
    @click="handleClick"
  >
    <!-- Main Content -->
    <div class="flex items-start gap-3">
      <!-- Engine Badge (left side) -->
      <div
        class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase"
        :style="engineBadgeStyle"
      >
        {{ engineAbbrev }}
      </div>

      <!-- Session Info (center) -->
      <div class="flex-1 min-w-0">
        <!-- Title Row: Name + Model + Running Badge -->
        <div class="flex items-center gap-2 mb-0.5">
          <!-- Inline Rename Input -->
          <template v-if="isEditing">
            <input
              ref="renameInputRef"
              v-model="editingName"
              type="text"
              class="flex-1 px-2 py-0.5 text-sm"
              :style="inputStyle"
              @click.stop
              @keydown.enter="confirmRename"
              @keydown.escape="cancelRename"
              @blur="confirmRename"
            />
          </template>
          <!-- Display Name + Model -->
          <template v-else>
            <span class="text-sm font-medium truncate" :style="titleStyle">
              {{ displayName }}
            </span>
            <!-- Model Badge -->
            <span
              v-if="session.model"
              class="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded"
              :style="modelBadgeStyle"
            >
              {{ session.model }}
            </span>
            <!-- Running Badge -->
            <span
              v-if="isRunning"
              class="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide animate-pulse"
              :style="runningBadgeStyle"
            >
              Running
            </span>
          </template>
        </div>

        <!-- Preview (first message) - show chip for web editor apply, plain text otherwise -->
        <div v-if="hasPreview" class="mt-1">
          <!-- Web Editor Apply Chip Style -->
          <div v-if="isWebEditorApplyPreview" class="flex items-center gap-1 text-xs min-w-0">
            <span
              class="flex-shrink-0 inline-flex items-center justify-center w-4 h-4 rounded"
              :style="previewChipIconStyle"
            >
              <ILucidePaintbrush class="w-2.5 h-2.5" />
            </span>
            <span class="flex-1 min-w-0 truncate" :style="previewStyle">
              {{ previewDisplayText }}
            </span>
            <span
              v-if="previewElementCount"
              class="flex-shrink-0 px-1 py-0.5 text-[9px] rounded"
              :style="previewChipBadgeStyle"
            >
              {{ previewElementCount }}
            </span>
          </div>
          <!-- Plain Text Preview -->
          <div v-else class="text-xs truncate" :style="previewStyle">
            {{ session.preview }}
          </div>
        </div>

        <!-- Project Path -->
        <div
          v-if="displayProjectPath"
          class="mt-1 text-[10px] flex items-center gap-1 truncate"
          :style="{ color: 'var(--ac-text-subtle)', fontFamily: 'var(--ac-font-mono)' }"
          :title="projectPath"
        >
          <span class="truncate">{{ displayProjectPath }}</span>
        </div>
      </div>

      <!-- Right side: Time + Actions (vertically stacked, right-aligned) -->
      <div class="flex-shrink-0 flex flex-col items-end gap-1">
        <!-- Time -->
        <span class="text-[10px]" :style="{ color: 'var(--ac-text-subtle)' }">
          {{ formattedDate }}
        </span>
        <!-- Action buttons -->
        <div class="flex items-center gap-1">
          <!-- Open Project Button -->
          <button
            v-if="!isEditing"
            class="p-1.5 rounded-md transition-colors cursor-pointer"
            :style="actionButtonStyle"
            title="Open project"
            @click.stop="handleOpenProject"
          >
            <ILucideFolderOpen class="w-3.5 h-3.5" />
          </button>
          <!-- Rename Button -->
          <button
            v-if="!isEditing"
            class="p-1.5 rounded-md transition-colors cursor-pointer"
            :style="actionButtonStyle"
            title="Rename"
            @click.stop="startRename"
          >
            <ILucidePencil class="w-3.5 h-3.5" />
          </button>
          <!-- Delete Button -->
          <button
            v-if="!isEditing"
            class="p-1.5 rounded-md transition-colors cursor-pointer"
            :style="deleteButtonStyle"
            title="Delete"
            @click.stop="handleDelete"
          >
            <ILucideTrash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { AgentSession } from 'chrome-mcp-shared';
import { computed, nextTick, ref, watch } from 'vue';
import ILucidePaintbrush from '~icons/lucide/paintbrush';
import ILucideFolderOpen from '~icons/lucide/folder-open';
import ILucidePencil from '~icons/lucide/pencil';
import ILucideTrash2 from '~icons/lucide/trash-2';

// =============================================================================
// Props & Emits
// =============================================================================

const props = defineProps<{
  session: AgentSession;
  selected?: boolean;
  isRunning?: boolean;
  /** Project root path for display */
  projectPath?: string;
}>();

const emit = defineEmits<{
  click: [sessionId: string];
  rename: [sessionId: string, name: string];
  delete: [sessionId: string];
  'open-project': [sessionId: string];
}>();

// =============================================================================
// Local State
// =============================================================================

const isEditing = ref(false);
const editingName = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

// =============================================================================
// Computed: Display Values
// =============================================================================

const displayName = computed(() => {
  if (props.session.name) return props.session.name;
  return 'Unnamed Session';
});

const engineAbbrev = computed(() => {
  const name = props.session.engineName;
  switch (name) {
    case 'claude':
      return 'CL';
    case 'codex':
      return 'CX';
    case 'cursor':
      return 'CR';
    case 'qwen':
      return 'QW';
    case 'glm':
      return 'GL';
    default:
      // Fallback for any unknown engine name
      return (
        String(name || '')
          .slice(0, 2)
          .toUpperCase() || 'AI'
      );
  }
});

const formattedDate = computed(() => {
  const date = new Date(props.session.updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
});

/**
 * Format project path for display.
 * Shows abbreviated path with home dir shortened.
 */
const displayProjectPath = computed(() => {
  if (!props.projectPath) return '';
  const path = props.projectPath;
  // Abbreviate home directory for macOS/Linux
  if (path.includes('/Users/')) {
    return path.replace(/^\/Users\/[^/]+/, '~');
  }
  // Abbreviate home directory for Linux
  if (path.startsWith('/home/')) {
    return path.replace(/^\/home\/[^/]+/, '~');
  }
  return path;
});

// =============================================================================
// Computed: Preview Chip (for web editor apply messages)
// =============================================================================

const hasPreview = computed(() => !!props.session.preview || !!props.session.previewMeta);

const isWebEditorApplyPreview = computed(() => {
  const meta = props.session.previewMeta;
  if (!meta?.clientMeta?.kind) return false;
  return (
    meta.clientMeta.kind === 'web_editor_apply_batch' ||
    meta.clientMeta.kind === 'web_editor_apply_single'
  );
});

const previewDisplayText = computed(() => {
  const meta = props.session.previewMeta;
  return meta?.displayText || props.session.preview || '';
});

const previewElementCount = computed(() => {
  const meta = props.session.previewMeta;
  return meta?.clientMeta?.elementCount;
});

// =============================================================================
// Computed: Styles
// =============================================================================

const containerStyle = computed(() => ({
  backgroundColor: props.selected ? 'var(--ac-hover-bg)' : 'transparent',
  borderBottom: 'var(--ac-border-width) solid var(--ac-border)',
}));

const engineBadgeStyle = computed(() => {
  const colors: Record<string, string> = {
    claude: '#c87941',
    codex: '#10a37f',
    cursor: '#8b5cf6',
    qwen: '#6366f1',
    glm: '#ef4444',
  };
  const bg = colors[props.session.engineName] || '#6b7280';
  return {
    backgroundColor: bg,
    color: '#ffffff',
  };
});

const titleStyle = computed(() => ({
  color: props.selected ? 'var(--ac-accent)' : 'var(--ac-text)',
}));

const modelBadgeStyle = computed(() => ({
  color: 'var(--ac-text-subtle)',
  backgroundColor: 'var(--ac-surface-muted)',
  fontFamily: 'var(--ac-font-mono)',
}));

const previewStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
}));

const previewChipIconStyle = computed(() => ({
  backgroundColor: 'var(--ac-accent)',
  color: 'var(--ac-accent-contrast)',
}));

const previewChipBadgeStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-muted)',
  color: 'var(--ac-text-muted)',
}));

const runningBadgeStyle = computed(() => ({
  backgroundColor: 'var(--ac-success)',
  color: '#ffffff',
  borderRadius: 'var(--ac-radius-button)',
}));

const inputStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface)',
  border: 'var(--ac-border-width) solid var(--ac-accent)',
  borderRadius: 'var(--ac-radius-button)',
  color: 'var(--ac-text)',
  outline: 'none',
}));

const actionButtonStyle = computed(() => ({
  color: 'var(--ac-text-muted)',
  backgroundColor: 'transparent',
}));

const deleteButtonStyle = computed(() => ({
  color: 'var(--ac-danger)',
  backgroundColor: 'transparent',
}));

// =============================================================================
// Event Handlers
// =============================================================================

function handleClick(): void {
  if (isEditing.value) return;
  emit('click', props.session.id);
}

function startRename(): void {
  editingName.value = props.session.name || '';
  isEditing.value = true;
  nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function confirmRename(): void {
  if (!isEditing.value) return;
  const trimmed = editingName.value.trim();
  if (trimmed && trimmed !== props.session.name) {
    emit('rename', props.session.id, trimmed);
  }
  isEditing.value = false;
}

function cancelRename(): void {
  isEditing.value = false;
}

function handleDelete(): void {
  // Simple confirmation to prevent accidental deletion
  const sessionName = props.session.name || props.session.preview || 'this session';
  if (confirm(`Delete "${sessionName}"?`)) {
    emit('delete', props.session.id);
  }
}

function handleOpenProject(): void {
  emit('open-project', props.session.id);
}

// Reset editing state when session changes
watch(
  () => props.session.id,
  () => {
    isEditing.value = false;
  },
);
</script>

<style scoped>
/* Hover effect for container */
.group:hover {
  background-color: var(--ac-hover-bg);
}
</style>
