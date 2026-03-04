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
        <h2 class="text-sm font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">Tools</h2>
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
      <div class="flex-1 overflow-y-auto ac-scroll px-4 py-3 space-y-2">
        <!-- Agent Builtin Tools (same pattern as Browser Tools) -->
        <section v-if="isClaudeEngine" class="space-y-2">
          <div class="flex items-center justify-between gap-3 mb-2">
            <h3
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Agent Builtin Tools
            </h3>
            <button
              class="text-[10px] ac-btn"
              :style="{ color: 'var(--ac-link, #3b82f6)' }"
              :disabled="isSaving"
              @click="handleRestoreClaudeTools"
            >
              Reset defaults
            </button>
          </div>

          <div class="space-y-2">
            <div
              v-for="group in agentBuiltinGroupsWithTools"
              :key="group.id"
              class="rounded-lg overflow-hidden"
              :style="cardStyle"
            >
              <div
                class="flex items-center gap-2 px-3 py-2 cursor-pointer"
                :style="headerStyle"
                @click="toggleAgentGroupExpanded(group.id)"
              >
                <ILucideChevronRight
                  class="w-4 h-4 flex-shrink-0 transition-transform"
                  :class="{ 'rotate-90': agentGroupExpanded[group.id] }"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
                    {{ group.label }}
                  </div>
                  <div class="text-[10px]" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                    {{ agentGroupEnabledCount(group) }} / {{ group.tools.length }} enabled
                  </div>
                </div>
                <button
                  class="relative inline-flex w-9 h-5 items-center flex-shrink-0 ac-btn"
                  :style="toggleStyle(isAgentGroupEnabled(group.id))"
                  :disabled="isSaving"
                  @click.stop="handleToggleAgentGroup(group.id)"
                >
                  <span
                    class="inline-block w-3.5 h-3.5 rounded-full"
                    :style="{
                      backgroundColor: '#ffffff',
                      transform: isAgentGroupEnabled(group.id)
                        ? 'translateX(18px)'
                        : 'translateX(2px)',
                      transition: 'transform 120ms ease-out',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }"
                  />
                </button>
              </div>

              <div
                v-show="agentGroupExpanded[group.id]"
                class="p-2 space-y-0.5 max-h-48 overflow-y-auto ac-scroll"
                :style="bodyStyle"
              >
                <label
                  v-for="tool in group.tools"
                  :key="tool"
                  class="flex items-center gap-2.5 py-1.5 px-2 rounded cursor-pointer hover:bg-black/5"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                >
                  <input
                    type="checkbox"
                    :checked="isClaudeToolEnabled(tool)"
                    :disabled="!isAgentGroupEnabled(group.id) || isSaving"
                    @change="handleToggleClaudeTool(tool)"
                  />
                  <span class="font-mono text-xs truncate flex-1">{{ tool }}</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Memory Tools (EverMemOS) -->
        <section v-if="memoryToolGroupDefinitions.length > 0" class="space-y-2">
          <div class="flex items-center justify-between gap-3 mb-2">
            <h3
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Memory Tools
            </h3>
          </div>

          <div v-if="toolGroupsLoading" class="py-4 text-center text-[10px]">
            <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Loading tools…</span>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="group in memoryToolGroupDefinitions"
              :key="group.id"
              class="rounded-lg overflow-hidden"
              :style="cardStyle"
            >
              <div
                class="flex items-center gap-2 px-3 py-2 cursor-pointer"
                :style="headerStyle"
                @click="toggleBrowserGroupExpanded(group.id)"
              >
                <ILucideChevronRight
                  class="w-4 h-4 flex-shrink-0 transition-transform"
                  :class="{ 'rotate-90': browserGroupExpanded[group.id] }"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
                    {{ group.label }}
                  </div>
                  <div class="text-[10px]" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                    {{ browserGroupEnabledCount(group) }} / {{ group.tools.length }} enabled
                  </div>
                </div>
                <button
                  class="relative inline-flex w-9 h-5 items-center flex-shrink-0 ac-btn"
                  :style="toggleStyle(!!toolGroups?.[group.id])"
                  :disabled="toolGroupsBusy"
                  @click.stop="handleToggleToolGroup(group.id)"
                >
                  <span
                    class="inline-block w-3.5 h-3.5 rounded-full"
                    :style="{
                      backgroundColor: '#ffffff',
                      transform: toolGroups?.[group.id] ? 'translateX(18px)' : 'translateX(2px)',
                      transition: 'transform 120ms ease-out',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }"
                  />
                </button>
              </div>

              <div
                v-show="browserGroupExpanded[group.id]"
                class="p-2 space-y-0.5 max-h-48 overflow-y-auto ac-scroll"
                :style="bodyStyle"
              >
                <label
                  v-for="tool in group.tools"
                  :key="tool.id"
                  class="flex items-center gap-2.5 py-1.5 px-2 rounded cursor-pointer hover:bg-black/5"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                >
                  <input
                    type="checkbox"
                    :checked="isBrowserToolEnabled(group, tool)"
                    :disabled="!toolGroups?.[group.id] || toolGroupsBusy"
                    @change="handleToggleBrowserTool(group, tool)"
                  />
                  <span class="text-xs truncate flex-1">{{ tool.name }}</span>
                  <span class="font-mono text-[9px] truncate max-w-[100px] opacity-70">
                    {{ tool.id }}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Browser Tools (collapsible groups with toggle) -->
        <section class="space-y-2">
          <div class="flex items-center justify-between gap-3 mb-2">
            <h3
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Browser Tools
            </h3>
            <button
              class="text-[10px] ac-btn"
              :style="{ color: 'var(--ac-link, #3b82f6)' }"
              :disabled="toolGroupsLoading || toolGroupsBusy"
              @click="handleResetToolGroups"
            >
              Reset defaults
            </button>
          </div>

          <div
            v-if="toolGroupsError"
            class="text-[10px] mb-2"
            :style="{ color: 'var(--ac-danger)' }"
          >
            {{ toolGroupsError }}
          </div>

          <div v-if="toolGroupsLoading" class="py-4 text-center text-[10px]">
            <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Loading tools…</span>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="group in browserToolGroupDefinitions"
              :key="group.id"
              class="rounded-lg overflow-hidden"
              :style="cardStyle"
            >
              <div
                class="flex items-center gap-2 px-3 py-2 cursor-pointer"
                :style="headerStyle"
                @click="toggleBrowserGroupExpanded(group.id)"
              >
                <ILucideChevronRight
                  class="w-4 h-4 flex-shrink-0 transition-transform"
                  :class="{ 'rotate-90': browserGroupExpanded[group.id] }"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                />
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
                    {{ group.label }}
                  </div>
                  <div class="text-[10px]" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                    {{ browserGroupEnabledCount(group) }} / {{ group.tools.length }} enabled
                  </div>
                </div>
                <button
                  class="relative inline-flex w-9 h-5 items-center flex-shrink-0 ac-btn"
                  :style="toggleStyle(!!toolGroups?.[group.id])"
                  :disabled="toolGroupsBusy"
                  @click.stop="handleToggleToolGroup(group.id)"
                >
                  <span
                    class="inline-block w-3.5 h-3.5 rounded-full"
                    :style="{
                      backgroundColor: '#ffffff',
                      transform: toolGroups?.[group.id] ? 'translateX(18px)' : 'translateX(2px)',
                      transition: 'transform 120ms ease-out',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }"
                  />
                </button>
              </div>

              <div
                v-show="browserGroupExpanded[group.id]"
                class="p-2 space-y-0.5 max-h-48 overflow-y-auto ac-scroll"
                :style="bodyStyle"
              >
                <label
                  v-for="tool in group.tools"
                  :key="tool.id"
                  class="flex items-center gap-2.5 py-1.5 px-2 rounded cursor-pointer hover:bg-black/5"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                >
                  <input
                    type="checkbox"
                    :checked="isBrowserToolEnabled(group, tool)"
                    :disabled="!toolGroups?.[group.id] || toolGroupsBusy"
                    @change="handleToggleBrowserTool(group, tool)"
                  />
                  <span class="text-xs truncate flex-1">{{ tool.name }}</span>
                  <span class="font-mono text-[9px] truncate max-w-[100px] opacity-70">
                    {{ tool.id }}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>
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
  clearIndividualToolOverrides,
  getDefaultToolGroupState,
  getIndividualToolState,
  getToolGroupState,
  setIndividualToolOverride,
  setToolGroupEnabled,
  setToolGroupState,
  type IndividualToolState,
  type ToolDefinition,
  type ToolGroupDefinition,
  type ToolGroupId,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import ILucideX from '~icons/lucide/x';
import ILucideChevronRight from '~icons/lucide/chevron-right';

/** Agent Builtin Tool groups (same structure as Browser Tools) */
const AGENT_BUILTIN_GROUPS = [
  {
    id: 'file_system',
    label: 'File System',
    tools: [
      'read_file',
      'write_file',
      'search_code',
      'edit_code',
      'list_dir',
      'glob_file_search',
      'apply_patch',
      'delete_file',
    ],
  },
  {
    id: 'runtime',
    label: 'Runtime',
    tools: ['run_terminal_cmd', 'run_command'],
  },
  {
    id: 'web',
    label: 'Web',
    tools: ['web_search', 'fetch_documentation'],
  },
] as const;

const AGENT_BUILTIN_ALL_TOOLS = AGENT_BUILTIN_GROUPS.flatMap((g) => g.tools);

/** Runtime tools disabled by default */
const RUNTIME_TOOLS = AGENT_BUILTIN_GROUPS.find((g) => g.id === 'runtime')?.tools ?? [];

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

const cardStyle = {
  backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
};
const headerStyle = {
  backgroundColor: 'var(--ac-surface, #ffffff)',
  borderBottom: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
};
const bodyStyle = { backgroundColor: 'var(--ac-surface-inset, #f5f5f5)' };

function toggleStyle(enabled: boolean) {
  return {
    backgroundColor: enabled ? 'var(--ac-accent, #c87941)' : 'var(--ac-border, #e5e5e5)',
    borderRadius: '9999px',
    border: enabled
      ? 'var(--ac-border-width, 1px) solid var(--ac-accent, #c87941)'
      : 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
    padding: '1px',
  };
}

// -----------------------------------------------------------------------------
// Collapse state
// -----------------------------------------------------------------------------

const agentGroupExpanded = ref<Record<string, boolean>>({});
const browserGroupExpanded = ref<Record<string, boolean>>({});

function toggleAgentGroupExpanded(groupId: string): void {
  agentGroupExpanded.value = {
    ...agentGroupExpanded.value,
    [groupId]: !agentGroupExpanded.value[groupId],
  };
}

function toggleBrowserGroupExpanded(groupId: ToolGroupId): void {
  browserGroupExpanded.value = {
    ...browserGroupExpanded.value,
    [groupId]: !browserGroupExpanded.value[groupId],
  };
}

// -----------------------------------------------------------------------------
// Browser tool groups (global)
// -----------------------------------------------------------------------------

const toolGroupDefinitions = TOOL_GROUP_DEFINITIONS as readonly ToolGroupDefinition[];
const memoryToolGroupDefinitions = computed(() =>
  toolGroupDefinitions.filter((g) => g.id === 'memory'),
);
const browserToolGroupDefinitions = computed(() =>
  toolGroupDefinitions.filter((g) => g.id !== 'memory'),
);
const toolGroups = ref<ToolGroupState | null>(null);
const individualToolState = ref<IndividualToolState | null>(null);
const toolGroupsLoading = ref(false);
const toolGroupsBusy = ref(false);
const toolGroupsError = ref<string | null>(null);

function browserGroupEnabledCount(group: ToolGroupDefinition): number {
  const groupEnabled = !!toolGroups.value?.[group.id];
  if (!groupEnabled) return 0;
  const overrides = individualToolState.value?.overrides ?? {};
  return group.tools.filter((t) => overrides[t.id] !== false).length;
}

function isBrowserToolEnabled(group: ToolGroupDefinition, tool: ToolDefinition): boolean {
  const groupEnabled = !!toolGroups.value?.[group.id];
  if (!groupEnabled) return false;
  const overrides = individualToolState.value?.overrides ?? {};
  return overrides[tool.id] !== false;
}

async function handleToggleBrowserTool(
  group: ToolGroupDefinition,
  tool: ToolDefinition,
): Promise<void> {
  const groupEnabled = !!toolGroups.value?.[group.id];
  if (!groupEnabled) return;
  const currentlyEnabled = isBrowserToolEnabled(group, tool);
  toolGroupsBusy.value = true;
  toolGroupsError.value = null;
  try {
    individualToolState.value = await setIndividualToolOverride(tool.id, !currentlyEnabled);
  } catch (reason) {
    toolGroupsError.value = reason instanceof Error ? reason.message : String(reason);
  } finally {
    toolGroupsBusy.value = false;
  }
}

async function loadToolGroups(): Promise<void> {
  toolGroupsLoading.value = true;
  toolGroupsError.value = null;
  try {
    const [groups, individual] = await Promise.all([getToolGroupState(), getIndividualToolState()]);
    toolGroups.value = groups;
    individualToolState.value = individual;
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
    const [groups, individual] = await Promise.all([
      setToolGroupState({
        observe: defaults.observe,
        navigate: defaults.navigate,
        interact: defaults.interact,
        execute: defaults.execute,
        workflow: defaults.workflow,
        memory: defaults.memory,
      }),
      clearIndividualToolOverrides(),
    ]);
    toolGroups.value = groups;
    individualToolState.value = individual;
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
  if (!changes.toolGroupState && !changes.individualToolState) return;
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

const localAgentGroupEnabled = ref<Record<string, boolean>>({});
const localClaudeDisallowedTools = ref<string[]>([]);
const localClaudeSelectedTools = ref<string[]>([]);
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

  const result = Array.from(set).sort((a, b) => a.localeCompare(b));
  return result.length > 0 ? result : [...AGENT_BUILTIN_ALL_TOOLS];
});

const agentBuiltinGroupsWithTools = computed(() => {
  const candidates = claudeToolCandidates.value;
  const assigned = new Set(AGENT_BUILTIN_GROUPS.flatMap((g) => g.tools));
  const groups = AGENT_BUILTIN_GROUPS.map((group) => ({
    ...group,
    tools: group.tools.filter((t) => candidates.includes(t)),
  })).filter((g) => g.tools.length > 0);
  const otherTools = candidates.filter((t) => !assigned.has(t));
  if (otherTools.length > 0) {
    groups.push({ id: 'other', label: 'Other', tools: otherTools });
  }
  return groups;
});

function isAgentGroupEnabled(groupId: string): boolean {
  return localAgentGroupEnabled.value[groupId] !== false;
}

function handleToggleAgentGroup(groupId: string): void {
  localAgentGroupEnabled.value = {
    ...localAgentGroupEnabled.value,
    [groupId]: !isAgentGroupEnabled(groupId),
  };
  performSave();
}

function agentGroupEnabledCount(group: { id: string; tools: readonly string[] }): number {
  if (!isAgentGroupEnabled(group.id)) return 0;
  const toolsConfig = props.session?.optionsConfig?.tools;
  if (Array.isArray(toolsConfig)) {
    return group.tools.filter((t) => localClaudeSelectedTools.value.includes(t)).length;
  }
  return group.tools.filter((t) => !localClaudeDisallowedTools.value.includes(t)).length;
}

function isClaudeToolEnabled(tool: string): boolean {
  const group = agentBuiltinGroupsWithTools.value.find((g) => g.tools.includes(tool));
  if (!group || !isAgentGroupEnabled(group.id)) return false;
  const toolsConfig = props.session?.optionsConfig?.tools;
  if (Array.isArray(toolsConfig)) {
    return localClaudeSelectedTools.value.includes(tool);
  }
  return !localClaudeDisallowedTools.value.includes(tool);
}

function handleToggleClaudeTool(tool: string): void {
  const normalized = String(tool || '').trim();
  if (!normalized) return;

  const toolsConfig = props.session?.optionsConfig?.tools;
  if (Array.isArray(toolsConfig)) {
    const current = new Set(localClaudeSelectedTools.value);
    if (current.has(normalized)) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    localClaudeSelectedTools.value = Array.from(current).sort((a, b) => a.localeCompare(b));
  } else {
    const current = new Set(localClaudeDisallowedTools.value);
    if (current.has(normalized)) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    localClaudeDisallowedTools.value = Array.from(current).sort((a, b) => a.localeCompare(b));
  }
  performSave();
}

function captureClaudeSnapshot(): void {
  initialClaudeSnapshot.value = JSON.stringify({
    groupEnabled: localAgentGroupEnabled.value,
    disallowed: localClaudeDisallowedTools.value,
    selected: localClaudeSelectedTools.value,
  });
}

const isClaudeDirty = computed(() => {
  if (!isClaudeEngine.value) return false;
  const current = JSON.stringify({
    groupEnabled: localAgentGroupEnabled.value,
    disallowed: localClaudeDisallowedTools.value,
    selected: localClaudeSelectedTools.value,
  });
  return current !== initialClaudeSnapshot.value;
});

function handleRestoreClaudeTools(): void {
  localAgentGroupEnabled.value = { runtime: false };
  localClaudeDisallowedTools.value = [...RUNTIME_TOOLS];
  localClaudeSelectedTools.value = [];
  performSave();
}

watch(
  () => [props.session, agentBuiltinGroupsWithTools.value] as const,
  ([session, groups]) => {
    if (!session || session.engineName !== 'claude') {
      localAgentGroupEnabled.value = {};
      localClaudeDisallowedTools.value = [];
      localClaudeSelectedTools.value = [];
      initialClaudeSnapshot.value = '';
      return;
    }

    const options = session.optionsConfig ?? {};
    const toolsConfig = options.tools;

    if (Array.isArray(toolsConfig)) {
      const selected = new Set(toolsConfig);
      localAgentGroupEnabled.value = {};
      for (const g of groups) {
        localAgentGroupEnabled.value[g.id] = g.tools.some((t) => selected.has(t));
      }
      localClaudeSelectedTools.value = Array.from(selected).sort((a, b) => a.localeCompare(b));
      localClaudeDisallowedTools.value = [];
    } else if (Array.isArray(options.allowedTools)) {
      const allowed = new Set(options.allowedTools);
      localAgentGroupEnabled.value = {};
      for (const g of groups) {
        localAgentGroupEnabled.value[g.id] = g.tools.some((t) => allowed.has(t));
      }
      localClaudeSelectedTools.value = Array.from(allowed).sort((a, b) => a.localeCompare(b));
      localClaudeDisallowedTools.value = [];
    } else {
      const disallowed = new Set(
        Array.isArray(options.disallowedTools) ? options.disallowedTools : [],
      );
      if (disallowed.size === 0) {
        localAgentGroupEnabled.value = { runtime: false };
        localClaudeDisallowedTools.value = [...RUNTIME_TOOLS];
      } else {
        localAgentGroupEnabled.value = {};
        for (const g of groups) {
          localAgentGroupEnabled.value[g.id] = g.tools.some((t) => !disallowed.has(t));
        }
        localClaudeDisallowedTools.value = Array.from(disallowed).sort((a, b) =>
          a.localeCompare(b),
        );
      }
      localClaudeSelectedTools.value = [];
    }

    captureClaudeSnapshot();
  },
  { immediate: true },
);

function handleClose(): void {
  emit('close');
}

function performSave(): void {
  handleSave();
}

function handleSave(): void {
  if (!props.session || props.session.engineName !== 'claude') return;

  const groups = agentBuiltinGroupsWithTools.value;
  const toolsConfig = props.session?.optionsConfig?.tools;

  const effectiveDisabled = new Set<string>();
  const effectiveSelected = new Set<string>();
  for (const g of groups) {
    if (!isAgentGroupEnabled(g.id)) {
      for (const t of g.tools) effectiveDisabled.add(t);
    } else if (Array.isArray(toolsConfig)) {
      for (const t of g.tools) {
        if (localClaudeSelectedTools.value.includes(t)) effectiveSelected.add(t);
      }
    } else {
      for (const t of g.tools) {
        if (!localClaudeDisallowedTools.value.includes(t)) effectiveSelected.add(t);
        else effectiveDisabled.add(t);
      }
    }
  }

  const allDisabled = groups.every((g) => !isAgentGroupEnabled(g.id));
  if (allDisabled) {
    emit('save', { ...(props.session.optionsConfig ?? {}), tools: [] });
    captureClaudeSnapshot();
    return;
  }

  const existingOptions = props.session.optionsConfig ?? {};
  const {
    allowedTools: _allowedTools,
    disallowedTools: _disallowedTools,
    tools: _tools,
    ...rest
  } = existingOptions;

  const optionsConfig: AgentSessionOptionsConfig = Array.isArray(toolsConfig)
    ? { ...rest, tools: Array.from(effectiveSelected).sort((a, b) => a.localeCompare(b)) }
    : {
        ...rest,
        tools: { type: 'preset', preset: 'claude_code' },
        ...(effectiveDisabled.size > 0
          ? { disallowedTools: Array.from(effectiveDisabled).sort((a, b) => a.localeCompare(b)) }
          : {}),
      };

  emit('save', optionsConfig);
  captureClaudeSnapshot();
}
</script>
