<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center"
    @click.self="handleClose"
  >
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/40" />

    <!-- Panel -->
    <div
      class="relative w-full max-w-md mx-4 max-h-[85vh] overflow-hidden flex flex-col"
      :style="{
        backgroundColor: 'var(--ac-surface, #ffffff)',
        border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
        borderRadius: 'var(--ac-radius-card, 12px)',
        boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.2))',
      }"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 py-3"
        :style="{ borderBottom: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)' }"
      >
        <h2 class="text-sm font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }"> Tools </h2>
        <button
          class="p-1 ac-btn"
          :style="{
            color: 'var(--ac-text-muted, #6e6e6e)',
            borderRadius: 'var(--ac-radius-button)',
          }"
          @click="handleClose"
        >
          <ILucideX class="w-5 h-5" />
        </button>
      </div>

      <!-- Content (scrollable) -->
      <div class="flex-1 overflow-y-auto ac-scroll px-4 py-3 space-y-4">
        <!-- Claude Code Tools -->
        <div v-if="isClaudeEngine" class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Claude Code Tools
            </label>
            <button
              class="text-[10px] ac-btn"
              :style="{ color: 'var(--ac-link, #3b82f6)' }"
              @click="handleRestoreClaudeTools"
            >
              Restore preset
            </button>
          </div>

          <p class="text-[10px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
            Controls Claude Code’s built-in tools (read/search/edit/run). Changes apply to the next
            request; if a tool still seems missing, reset the session.
          </p>

          <div class="flex items-center gap-2">
            <button
              class="px-2 py-1 text-[10px] ac-btn"
              :style="{
                backgroundColor:
                  localClaudeToolsMode === 'preset'
                    ? 'var(--ac-accent-subtle, rgba(200,121,65,0.15))'
                    : 'transparent',
                color:
                  localClaudeToolsMode === 'preset'
                    ? 'var(--ac-accent, #c87941)'
                    : 'var(--ac-text-muted, #6e6e6e)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
              }"
              @click="localClaudeToolsMode = 'preset'"
            >
              Preset (claude_code)
            </button>
            <button
              class="px-2 py-1 text-[10px] ac-btn"
              :style="{
                backgroundColor:
                  localClaudeToolsMode === 'custom'
                    ? 'var(--ac-accent-subtle, rgba(200,121,65,0.15))'
                    : 'transparent',
                color:
                  localClaudeToolsMode === 'custom'
                    ? 'var(--ac-accent, #c87941)'
                    : 'var(--ac-text-muted, #6e6e6e)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
              }"
              @click="localClaudeToolsMode = 'custom'"
            >
              Custom list
            </button>
          </div>

          <div
            class="space-y-2 p-2"
            :style="{
              backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
              borderRadius: 'var(--ac-radius-inner, 8px)',
            }"
          >
            <template v-if="localClaudeToolsMode === 'preset'">
              <div class="flex items-center justify-between text-[10px]">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                  Disabled: {{ localClaudeDisallowedTools.length }}
                </span>
                <button
                  class="text-[10px] ac-btn"
                  :style="{ color: 'var(--ac-link, #3b82f6)' }"
                  @click="localClaudeDisallowedTools = []"
                >
                  Enable all
                </button>
              </div>

              <details class="text-[10px]">
                <summary class="cursor-pointer" :style="{ color: 'var(--ac-link, #3b82f6)' }">
                  Configure disabled tools
                </summary>
                <div class="mt-2 space-y-2">
                  <input
                    v-model="localClaudeToolsFilter"
                    class="w-full px-2 py-1.5 text-xs"
                    :style="{
                      backgroundColor: 'var(--ac-surface, #ffffff)',
                      border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                      borderRadius: 'var(--ac-radius-button, 8px)',
                      color: 'var(--ac-text, #1a1a1a)',
                    }"
                    placeholder="Filter tools…"
                  />

                  <div
                    class="max-h-40 overflow-y-auto ac-scroll space-y-1"
                    :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                  >
                    <div
                      v-for="tool in filteredClaudeToolCandidates"
                      :key="tool"
                      class="flex items-center justify-between gap-2"
                    >
                      <label class="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          :checked="!localClaudeDisallowedTools.includes(tool)"
                          @change="handleToggleClaudeToolDisabled(tool)"
                        />
                        <span class="font-mono truncate">{{ tool }}</span>
                      </label>
                      <span class="text-[9px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
                        {{ localClaudeDisallowedTools.includes(tool) ? 'disabled' : 'enabled' }}
                      </span>
                    </div>

                    <div
                      v-if="filteredClaudeToolCandidates.length === 0"
                      class="py-2 text-center text-[10px]"
                      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
                    >
                      No tools to show. Open Tools again to refresh the tool list.
                    </div>
                  </div>
                </div>
              </details>
            </template>

            <template v-else>
              <div class="flex items-center justify-between text-[10px]">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                  Enabled: {{ localClaudeSelectedTools.length }}
                </span>
                <div class="flex items-center gap-2">
                  <button
                    class="text-[10px] ac-btn"
                    :style="{ color: 'var(--ac-link, #3b82f6)' }"
                    @click="handleSelectAllClaudeTools"
                  >
                    Select all
                  </button>
                  <button
                    class="text-[10px] ac-btn"
                    :style="{ color: 'var(--ac-link, #3b82f6)' }"
                    @click="localClaudeSelectedTools = []"
                  >
                    Select none
                  </button>
                </div>
              </div>

              <input
                v-model="localClaudeToolsFilter"
                class="w-full px-2 py-1.5 text-xs"
                :style="{
                  backgroundColor: 'var(--ac-surface, #ffffff)',
                  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                  borderRadius: 'var(--ac-radius-button, 8px)',
                  color: 'var(--ac-text, #1a1a1a)',
                }"
                placeholder="Filter tools…"
              />

              <div
                class="max-h-44 overflow-y-auto ac-scroll space-y-1"
                :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
              >
                <div
                  v-for="tool in filteredClaudeToolCandidates"
                  :key="tool"
                  class="flex items-center justify-between gap-2"
                >
                  <label class="flex items-center gap-2 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="localClaudeSelectedTools.includes(tool)"
                      @change="handleToggleClaudeToolSelected(tool)"
                    />
                    <span class="font-mono truncate">{{ tool }}</span>
                  </label>
                  <span class="text-[9px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
                    {{ localClaudeSelectedTools.includes(tool) ? 'enabled' : 'disabled' }}
                  </span>
                </div>

                <div
                  v-if="filteredClaudeToolCandidates.length === 0"
                  class="py-2 text-center text-[10px]"
                  :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
                >
                  No tools to show. Open Tools again to refresh the tool list.
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Browser Tool Groups -->
        <div class="space-y-2">
          <div class="flex items-center justify-between gap-3">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Browser Tools
            </label>
            <div class="flex items-center gap-2">
              <button
                class="text-[10px] ac-btn"
                :style="{ color: 'var(--ac-link, #3b82f6)' }"
                :disabled="toolGroupsLoading || toolGroupsBusy"
                @click="handleResetToolGroups"
              >
                Reset defaults
              </button>
              <button
                class="text-[10px] ac-btn"
                :style="{ color: 'var(--ac-link, #3b82f6)' }"
                :disabled="toolGroupsLoading || toolGroupsBusy"
                @click="handleSetSafeToolGroups"
              >
                Safe mode (no JS/interaction)
              </button>
            </div>
          </div>

          <p class="text-[10px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
            Enable or disable categories of browser automation tools. Safe mode enables Observe +
            Navigate + Workflow only.
          </p>

          <div v-if="toolGroupsError" class="text-[10px]" :style="{ color: 'var(--ac-danger)' }">
            {{ toolGroupsError }}
          </div>

          <div
            class="space-y-2 p-2"
            :style="{
              backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
              borderRadius: 'var(--ac-radius-inner, 8px)',
            }"
          >
            <div v-if="toolGroupsLoading" class="text-[10px] py-2 text-center">
              <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Loading tools…</span>
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="group in toolGroupDefinitions"
                :key="group.id"
                class="p-2"
                :style="{
                  backgroundColor: 'var(--ac-surface, #ffffff)',
                  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                  borderRadius: 'var(--ac-radius-inner, 8px)',
                }"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div
                      class="text-xs font-semibold"
                      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
                    >
                      {{ group.label }}
                    </div>
                    <div class="text-[10px]" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                      {{ group.description }}
                    </div>
                  </div>

                  <button
                    class="relative inline-flex w-10 h-5 items-center flex-shrink-0 ac-btn"
                    :style="{
                      backgroundColor: toolGroups?.[group.id]
                        ? 'var(--ac-accent, #c87941)'
                        : 'var(--ac-border, #e5e5e5)',
                      borderRadius: '9999px',
                      border: toolGroups?.[group.id]
                        ? 'var(--ac-border-width, 1px) solid var(--ac-accent, #c87941)'
                        : 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                      padding: '1px',
                    }"
                    :disabled="toolGroupsBusy"
                    :aria-pressed="!!toolGroups?.[group.id]"
                    :data-tooltip="toolGroups?.[group.id] ? 'Enabled' : 'Disabled'"
                    @click="handleToggleToolGroup(group.id)"
                  >
                    <span
                      class="inline-block w-4 h-4"
                      :style="{
                        backgroundColor: '#ffffff',
                        borderRadius: '9999px',
                        transform: toolGroups?.[group.id] ? 'translateX(20px)' : 'translateX(0px)',
                        transition: 'transform 120ms ease-out',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                      }"
                    />
                  </button>
                </div>

                <details class="mt-2 text-[10px]">
                  <summary class="cursor-pointer" :style="{ color: 'var(--ac-link, #3b82f6)' }">
                    View tools ({{ group.tools.length }})
                  </summary>
                  <div
                    class="mt-1 p-2 max-h-24 overflow-y-auto ac-scroll space-y-1"
                    :style="{
                      backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
                      borderRadius: 'var(--ac-radius-inner, 8px)',
                    }"
                  >
                    <div
                      v-for="tool in group.tools"
                      :key="tool.id"
                      class="flex justify-between gap-2"
                      :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                    >
                      <span class="truncate">{{ tool.name }}</span>
                      <span class="font-mono text-[9px] truncate max-w-[120px]">{{ tool.id }}</span>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-end gap-2 px-4 py-3"
        :style="{ borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)' }"
      >
        <button
          class="px-3 py-1.5 text-xs ac-btn"
          :style="{
            color: 'var(--ac-text-muted, #6e6e6e)',
            border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
            borderRadius: 'var(--ac-radius-button, 8px)',
          }"
          @click="handleClose"
        >
          Close
        </button>

        <button
          v-if="isClaudeEngine"
          class="px-3 py-1.5 text-xs ac-btn"
          :style="{
            backgroundColor: 'var(--ac-accent, #c87941)',
            color: 'var(--ac-accent-contrast, #ffffff)',
            borderRadius: 'var(--ac-radius-button, 8px)',
          }"
          :disabled="isSaving || !isClaudeDirty"
          @click="handleSave"
        >
          {{ isSaving ? 'Saving...' : isClaudeDirty ? 'Save' : 'Saved' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type {
  AgentManagementInfo,
  AgentSession,
  AgentSessionOptionsConfig,
} from 'chrome-mcp-shared';
import {
  TOOL_GROUP_DEFINITIONS,
  getDefaultToolGroupState,
  getToolGroupState,
  setToolGroupEnabled,
  setToolGroupState,
  type ToolGroupDefinition,
  type ToolGroupId,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import ILucideX from '~icons/lucide/x';

type ClaudeToolsMode = 'preset' | 'custom';

const props = defineProps<{
  open: boolean;
  session: AgentSession | null;
  managementInfo: AgentManagementInfo | null;
  isLoading: boolean;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [optionsConfig: AgentSessionOptionsConfig];
}>();

const isClaudeEngine = computed(() => props.session?.engineName === 'claude');

// -----------------------------------------------------------------------------
// Browser tool groups (global)
// -----------------------------------------------------------------------------

const toolGroupDefinitions = TOOL_GROUP_DEFINITIONS as readonly ToolGroupDefinition[];
const toolGroups = ref<ToolGroupState | null>(null);
const toolGroupsLoading = ref(false);
const toolGroupsBusy = ref(false);
const toolGroupsError = ref<string | null>(null);

async function loadToolGroups(): Promise<void> {
  toolGroupsLoading.value = true;
  toolGroupsError.value = null;
  try {
    toolGroups.value = await getToolGroupState();
  } catch (reason) {
    toolGroupsError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    toolGroupsLoading.value = false;
  }
}

async function handleToggleToolGroup(groupId: ToolGroupId): Promise<void> {
  if (!toolGroups.value) {
    await loadToolGroups();
  }
  if (!toolGroups.value) return;

  const nextEnabled = !toolGroups.value[groupId];
  toolGroupsBusy.value = true;
  toolGroupsError.value = null;
  try {
    toolGroups.value = await setToolGroupEnabled(groupId, nextEnabled);
  } catch (reason) {
    toolGroupsError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    toolGroupsBusy.value = false;
  }
}

async function handleResetToolGroups(): Promise<void> {
  toolGroupsBusy.value = true;
  toolGroupsError.value = null;
  try {
    const defaults = getDefaultToolGroupState();
    toolGroups.value = await setToolGroupState({
      observe: defaults.observe,
      navigate: defaults.navigate,
      interact: defaults.interact,
      execute: defaults.execute,
      workflow: defaults.workflow,
    });
  } catch (reason) {
    toolGroupsError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    toolGroupsBusy.value = false;
  }
}

async function handleSetSafeToolGroups(): Promise<void> {
  toolGroupsBusy.value = true;
  toolGroupsError.value = null;
  try {
    toolGroups.value = await setToolGroupState({
      observe: true,
      navigate: true,
      interact: false,
      execute: false,
      workflow: true,
    });
  } catch (reason) {
    toolGroupsError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    toolGroupsBusy.value = false;
  }
}

function handleStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
): void {
  if (areaName !== 'local') return;
  if (!props.open) return;
  if (!changes.toolGroupState) return;
  void loadToolGroups();
}

onMounted(() => {
  chrome.storage.onChanged.addListener(handleStorageChange);
});

onUnmounted(() => {
  chrome.storage.onChanged.removeListener(handleStorageChange);
});

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void loadToolGroups();
    }
  },
  { immediate: true },
);

// -----------------------------------------------------------------------------
// Claude tools (per-session)
// -----------------------------------------------------------------------------

const localClaudeToolsMode = ref<ClaudeToolsMode>('preset');
const localClaudeDisallowedTools = ref<string[]>([]);
const localClaudeSelectedTools = ref<string[]>([]);
const localClaudeToolsFilter = ref('');
const initialClaudeSnapshot = ref<string>('');

const claudeToolCandidates = computed<string[]>(() => {
  const set = new Set<string>();

  const fromManagement = props.managementInfo?.tools ?? [];
  for (const tool of fromManagement) set.add(tool);

  const toolsConfig = props.session?.optionsConfig?.tools;
  if (Array.isArray(toolsConfig)) {
    for (const tool of toolsConfig) set.add(tool);
  }

  const allowed = props.session?.optionsConfig?.allowedTools;
  if (Array.isArray(allowed)) {
    for (const tool of allowed) set.add(tool);
  }

  const disallowed = props.session?.optionsConfig?.disallowedTools;
  if (Array.isArray(disallowed)) {
    for (const tool of disallowed) set.add(tool);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

const filteredClaudeToolCandidates = computed<string[]>(() => {
  const filter = localClaudeToolsFilter.value.trim().toLowerCase();
  if (!filter) return claudeToolCandidates.value;
  return claudeToolCandidates.value.filter((tool) => tool.toLowerCase().includes(filter));
});

function captureClaudeSnapshot(): void {
  initialClaudeSnapshot.value = JSON.stringify({
    mode: localClaudeToolsMode.value,
    disallowed: localClaudeDisallowedTools.value,
    selected: localClaudeSelectedTools.value,
  });
}

const isClaudeDirty = computed(() => {
  if (!isClaudeEngine.value) return false;
  const current = JSON.stringify({
    mode: localClaudeToolsMode.value,
    disallowed: localClaudeDisallowedTools.value,
    selected: localClaudeSelectedTools.value,
  });
  return current !== initialClaudeSnapshot.value;
});

function handleRestoreClaudeTools(): void {
  localClaudeToolsMode.value = 'preset';
  localClaudeDisallowedTools.value = [];
  localClaudeSelectedTools.value = [];
  localClaudeToolsFilter.value = '';
}

function handleToggleClaudeToolDisabled(tool: string): void {
  const normalized = String(tool || '').trim();
  if (!normalized) return;

  const current = new Set(localClaudeDisallowedTools.value);
  if (current.has(normalized)) {
    current.delete(normalized);
  } else {
    current.add(normalized);
  }

  localClaudeDisallowedTools.value = Array.from(current).sort((a, b) => a.localeCompare(b));
}

function handleToggleClaudeToolSelected(tool: string): void {
  const normalized = String(tool || '').trim();
  if (!normalized) return;

  const current = new Set(localClaudeSelectedTools.value);
  if (current.has(normalized)) {
    current.delete(normalized);
  } else {
    current.add(normalized);
  }

  localClaudeSelectedTools.value = Array.from(current).sort((a, b) => a.localeCompare(b));
}

function handleSelectAllClaudeTools(): void {
  localClaudeSelectedTools.value = claudeToolCandidates.value;
}

watch(
  () => props.session,
  (session) => {
    if (!session || session.engineName !== 'claude') {
      localClaudeToolsMode.value = 'preset';
      localClaudeDisallowedTools.value = [];
      localClaudeSelectedTools.value = [];
      localClaudeToolsFilter.value = '';
      initialClaudeSnapshot.value = '';
      return;
    }

    const options = session.optionsConfig ?? {};
    const toolsConfig = options.tools;

    if (Array.isArray(toolsConfig)) {
      localClaudeToolsMode.value = 'custom';
      localClaudeSelectedTools.value = Array.from(new Set(toolsConfig)).sort((a, b) =>
        a.localeCompare(b),
      );
      localClaudeDisallowedTools.value = [];
    } else if (Array.isArray(options.allowedTools)) {
      localClaudeToolsMode.value = 'custom';
      localClaudeSelectedTools.value = Array.from(new Set(options.allowedTools)).sort((a, b) =>
        a.localeCompare(b),
      );
      localClaudeDisallowedTools.value = [];
    } else {
      localClaudeToolsMode.value = 'preset';
      localClaudeSelectedTools.value = [];
      localClaudeDisallowedTools.value = Array.isArray(options.disallowedTools)
        ? Array.from(new Set(options.disallowedTools)).sort((a, b) => a.localeCompare(b))
        : [];
    }

    localClaudeToolsFilter.value = '';
    captureClaudeSnapshot();
  },
  { immediate: true },
);

function handleClose(): void {
  emit('close');
}

function handleSave(): void {
  if (!props.session || props.session.engineName !== 'claude') return;

  const existingOptions = props.session.optionsConfig ?? {};
  const {
    allowedTools: _allowedTools,
    disallowedTools: _disallowedTools,
    tools: _tools,
    ...rest
  } = existingOptions;

  const optionsConfig: AgentSessionOptionsConfig =
    localClaudeToolsMode.value === 'custom'
      ? {
          ...rest,
          tools: localClaudeSelectedTools.value,
        }
      : {
          ...rest,
          tools: { type: 'preset', preset: 'claude_code' },
          ...(localClaudeDisallowedTools.value.length > 0
            ? { disallowedTools: localClaudeDisallowedTools.value }
            : {}),
        };

  emit('save', optionsConfig);
  captureClaudeSnapshot();
}
</script>
