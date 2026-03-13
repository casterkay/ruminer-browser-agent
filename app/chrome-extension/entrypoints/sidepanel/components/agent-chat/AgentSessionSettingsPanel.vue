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
        <h2 class="text-sm font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
          Session Settings
        </h2>
        <button
          class="p-1 ac-btn"
          :style="{
            color: 'var(--ac-text-muted, #6e6e6e)',
            borderRadius: 'var(--ac-radius-button)',
          }"
          @click="handleClose"
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
      </div>

      <!-- Content (scrollable) -->
      <div class="flex-1 overflow-y-auto ac-scroll px-4 py-3 space-y-4">
        <!-- Loading State -->
        <div v-if="isLoading" class="py-8 text-center">
          <div class="text-sm" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
            Loading session info...
          </div>
        </div>

        <template v-else>
          <!-- Session Info -->
          <div class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Session Info
            </label>
            <div
              class="text-xs space-y-1 p-2 mt-2"
              :style="{
                color: 'var(--ac-text, #1a1a1a)',
                backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
                borderRadius: 'var(--ac-radius-inner, 8px)',
              }"
            >
              <div class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Engine</span>
                <span
                  class="px-1.5 py-0.5 text-[10px]"
                  :style="{
                    backgroundColor: getEngineColor(session?.engineName || ''),
                    color: '#ffffff',
                    borderRadius: 'var(--ac-radius-button, 8px)',
                  }"
                >
                  {{ session?.engineName || 'Unknown' }}
                </span>
              </div>
              <div v-if="isOpenClawEngine && localOpenClawAgentId" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Agent</span>
                <span class="font-mono text-[10px]">{{ localOpenClawAgentId }}</span>
              </div>
              <div
                v-if="localModel && (isClaudeEngine || isCodexEngine)"
                class="flex justify-between"
              >
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Model</span>
                <span class="font-mono text-[10px]">{{ localModel }}</span>
              </div>
              <div v-if="session?.engineSessionId" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Engine Session</span>
                <span class="font-mono text-[10px] truncate max-w-[180px]">{{
                  session.engineSessionId
                }}</span>
              </div>
              <div v-if="sourcePlatformName" class="flex justify-between items-center gap-2">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Platform</span>
                <span class="flex items-center gap-1.5 min-w-0">
                  <img
                    v-if="sourcePlatformIconFile"
                    :src="`/platform-icons/${sourcePlatformIconFile}`"
                    :alt="sourcePlatformName"
                    class="w-4 h-4 rounded-sm object-contain"
                  />
                  <span class="text-[10px] truncate max-w-[140px]">{{ sourcePlatformName }}</span>
                  <button
                    v-if="sourceUrl"
                    class="p-1 ac-btn"
                    :style="{ color: 'var(--ac-link, #3b82f6)' }"
                    title="Open source conversation"
                    @click="openSourceUrl"
                  >
                    <ILucideExternalLink class="w-3.5 h-3.5" />
                  </button>
                </span>
              </div>
            </div>
          </div>

          <!-- Project Workspace -->
          <div class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Project Workspace
            </label>

            <!-- Workspace path -->
            <div class="space-y-2 px-2">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[10px] mt-2" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                    {{
                      'The project directory contains files that the agent can directly work on. Set it before starting the session. Locked afterwards.'
                    }}
                  </div>

                  <div
                    class="text-[10px] font-mono break-words whitespace-pre-wrap relative mt-2"
                    :style="pathBoxStyle"
                    :title="defaultProjectPath || ''"
                  >
                    {{ defaultProjectPath || 'No project selected.' }}

                    <button
                      type="button"
                      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 ac-btn ac-focus-ring"
                      :style="{ color: 'var(--ac-text-muted, #6e6e6e)', borderRadius: '8px' }"
                      @click="handleFolderButtonClick"
                      :aria-expanded="
                        isWorkspaceConfigurable ? 'false' : String(openProjectMenuOpen)
                      "
                    >
                      <ILucideFolderOpen class="w-4 h-4" />
                    </button>

                    <AgentOpenProjectMenu
                      v-if="!isWorkspaceConfigurable"
                      :open="openProjectMenuOpen"
                      :defaultTarget="openProjectDefaultTarget"
                      @select="handleOpenProjectMenuSelect"
                      @close="handleOpenProjectMenuClose"
                    />
                  </div>
                </div>

                <!-- choose-folder button removed; folder icon will invoke choose when session not started -->
              </div>
            </div>
          </div>

          <!-- EverMemOS -->
          <div class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              EverMemOS
            </label>
            <div class="flex items-start justify-between gap-3 px-2">
              <div class="min-w-0 mt-2">
                <div class="text-xs font-semibold" :style="{ color: 'var(--ac-text, #1a1a1a)' }">
                  Save Conversation to EverMemOS
                </div>
                <div class="text-[10px] mt-0.5" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">
                  When enabled, chat messages in this session are automatically saved to EverMemOS.
                </div>
              </div>

              <button
                class="relative inline-flex w-9 h-5 mt-2 items-center flex-shrink-0 ac-btn"
                :style="toggleStyle(localSaveConversationToEverMemOS)"
                :disabled="isSaving"
                @click="localSaveConversationToEverMemOS = !localSaveConversationToEverMemOS"
              >
                <span
                  class="inline-block w-3.5 h-3.5 rounded-full"
                  :style="{
                    backgroundColor: '#ffffff',
                    transform: localSaveConversationToEverMemOS
                      ? 'translateX(18px)'
                      : 'translateX(2px)',
                    transition: 'transform 120ms ease-out',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  }"
                />
              </button>
            </div>
          </div>

          <!-- Model Selection (not applicable to OpenClaw) -->
          <div v-if="!isOpenClawEngine" class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Model
            </label>
            <select
              v-model="localModel"
              class="w-full px-2 py-1.5 mt-2 text-xs"
              :style="{
                backgroundColor: 'var(--ac-surface, #ffffff)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
                color: 'var(--ac-text, #1a1a1a)',
              }"
            >
              <option v-for="m in availableModels" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </div>

          <!-- OpenClaw Agent (OpenClaw only) -->
          <div v-if="isOpenClawEngine && (openclawAgents?.length || 0) > 0" class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              OpenClaw Agent
            </label>
            <select
              v-model="localOpenClawAgentId"
              class="w-full px-2 py-1.5 mt-2 text-xs"
              :style="{
                backgroundColor: 'var(--ac-surface, #ffffff)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
                color: 'var(--ac-text, #1a1a1a)',
              }"
            >
              <option v-for="a in openclawAgents" :key="a.id" :value="a.id">
                {{ a.name || a.id }}
              </option>
            </select>
          </div>

          <!-- Reasoning Effort (Codex only) -->
          <div v-if="isCodexEngine" class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Reasoning Effort
            </label>
            <select
              v-model="localReasoningEffort"
              class="w-full px-2 py-1.5 mt-2 text-xs"
              :style="{
                backgroundColor: 'var(--ac-surface, #ffffff)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
                color: 'var(--ac-text, #1a1a1a)',
              }"
            >
              <option v-for="effort in availableReasoningEfforts" :key="effort" :value="effort">
                {{ effort }}
              </option>
            </select>
            <p class="text-[10px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
              Controls the reasoning depth. Higher effort = better quality but slower.
              <span v-if="!availableReasoningEfforts.includes('xhigh')" class="block mt-1">
                Note: xhigh is only available for gpt-5.2 and gpt-5.1-codex-max models.
              </span>
            </p>
          </div>

          <!-- Permission Mode (Claude only) -->
          <div v-if="isClaudeEngine" class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              Permission Mode
            </label>
            <select
              v-model="localPermissionMode"
              class="w-full px-2 py-1.5 mt-2 text-xs"
              :style="{
                backgroundColor: 'var(--ac-surface, #ffffff)',
                border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                borderRadius: 'var(--ac-radius-button, 8px)',
                color: 'var(--ac-text, #1a1a1a)',
              }"
            >
              <option value="">Default</option>
              <option value="default">default - Ask for approval</option>
              <option value="acceptEdits">acceptEdits - Auto-accept file edits</option>
              <option value="bypassPermissions">bypassPermissions - Auto-accept all</option>
              <option value="plan">plan - Plan mode only</option>
              <option value="dontAsk">dontAsk - No confirmation</option>
            </select>
            <p class="text-[10px]" :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }">
              Controls how the system handles tool approval requests.
            </p>
          </div>

          <!-- System Prompt Config (Claude only) -->
          <div v-if="isClaudeEngine" class="space-y-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              System Prompt
            </label>
            <div class="space-y-2 mt-2">
              <label class="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  :checked="!localUseCustomPrompt"
                  @change="localUseCustomPrompt = false"
                />
                <span :style="{ color: 'var(--ac-text, #1a1a1a)' }">Use system preset</span>
              </label>
              <div v-if="!localUseCustomPrompt" class="pl-5">
                <label class="flex items-center gap-2 text-[10px]">
                  <input v-model="localAppendToPrompt" type="checkbox" />
                  <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                    >Append custom text</span
                  >
                </label>
                <textarea
                  v-if="localAppendToPrompt"
                  v-model="localPromptAppend"
                  class="mt-1 w-full px-2 py-1.5 text-xs resize-none"
                  :style="{
                    backgroundColor: 'var(--ac-surface, #ffffff)',
                    border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                    borderRadius: 'var(--ac-radius-button, 8px)',
                    color: 'var(--ac-text, #1a1a1a)',
                    fontFamily: 'var(--ac-font-mono, monospace)',
                  }"
                  rows="3"
                  placeholder="Additional instructions to append..."
                />
              </div>
              <label class="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  :checked="localUseCustomPrompt"
                  @change="localUseCustomPrompt = true"
                />
                <span :style="{ color: 'var(--ac-text, #1a1a1a)' }">Use custom prompt</span>
              </label>
              <textarea
                v-if="localUseCustomPrompt"
                v-model="localCustomPrompt"
                class="w-full px-2 py-1.5 text-xs resize-none"
                :style="{
                  backgroundColor: 'var(--ac-surface, #ffffff)',
                  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
                  borderRadius: 'var(--ac-radius-button, 8px)',
                  color: 'var(--ac-text, #1a1a1a)',
                  fontFamily: 'var(--ac-font-mono, monospace)',
                }"
                rows="4"
                placeholder="Enter custom system prompt..."
              />
            </div>
          </div>

          <!-- Management Info (Claude only, read-only) -->
          <div v-if="isClaudeEngine && managementInfo" class="space-y-2 mt-2">
            <label
              class="text-[10px] font-bold uppercase tracking-wider"
              :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
            >
              SDK Info
            </label>
            <div
              class="text-[10px] space-y-1 p-2"
              :style="{
                backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
                borderRadius: 'var(--ac-radius-inner, 8px)',
              }"
            >
              <div v-if="managementInfo.model" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Active Model</span>
                <span class="font-mono" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">{{
                  managementInfo.model
                }}</span>
              </div>
              <div v-if="managementInfo.claudeCodeVersion" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Claude Code</span>
                <span class="font-mono" :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">{{
                  managementInfo.claudeCodeVersion
                }}</span>
              </div>
              <div v-if="managementInfo.tools?.length" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">Tools</span>
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">{{
                  managementInfo.tools.length
                }}</span>
              </div>
              <div v-if="managementInfo.mcpServers?.length" class="flex justify-between">
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">MCP Servers</span>
                <span :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }">{{
                  managementInfo.mcpServers.length
                }}</span>
              </div>
            </div>
            <!-- Tool List (expandable) -->
            <details v-if="managementInfo.tools?.length" class="text-[10px]">
              <summary class="cursor-pointer" :style="{ color: 'var(--ac-link, #3b82f6)' }">
                View tools ({{ managementInfo.tools.length }})
              </summary>
              <div
                class="mt-1 p-2 max-h-32 overflow-y-auto ac-scroll"
                :style="{
                  backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
                  borderRadius: 'var(--ac-radius-inner, 8px)',
                }"
              >
                <div
                  v-for="tool in managementInfo.tools"
                  :key="tool"
                  class="font-mono truncate"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                >
                  {{ tool }}
                </div>
              </div>
            </details>
            <!-- MCP Server List (expandable) -->
            <details v-if="managementInfo.mcpServers?.length" class="text-[10px]">
              <summary class="cursor-pointer" :style="{ color: 'var(--ac-link, #3b82f6)' }">
                View MCP servers ({{ managementInfo.mcpServers.length }})
              </summary>
              <div
                class="mt-1 p-2 max-h-32 overflow-y-auto ac-scroll"
                :style="{
                  backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
                  borderRadius: 'var(--ac-radius-inner, 8px)',
                }"
              >
                <div
                  v-for="server in managementInfo.mcpServers"
                  :key="server.name"
                  class="font-mono truncate flex justify-between gap-2"
                  :style="{ color: 'var(--ac-text-muted, #6e6e6e)' }"
                >
                  <span>{{ server.name }}</span>
                  <span
                    class="text-[9px] px-1"
                    :style="{
                      backgroundColor: server.status === 'connected' ? '#10b981' : '#6b7280',
                      color: '#fff',
                      borderRadius: 'var(--ac-radius-button, 8px)',
                    }"
                    >{{ server.status }}</span
                  >
                </div>
              </div>
            </details>
          </div>
        </template>
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
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-xs ac-btn"
          :style="{
            backgroundColor: 'var(--ac-accent, #c87941)',
            color: 'var(--ac-accent-contrast, #ffffff)',
            borderRadius: 'var(--ac-radius-button, 8px)',
          }"
          :disabled="isSaving"
          @click="handleSave"
        >
          {{ isSaving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  getCodexReasoningEfforts,
  getDefaultModelForCli,
  getModelsForCli,
} from '@/common/agent-models';
import type {
  AgentManagementInfo,
  AgentSession,
  AgentSessionOptionsConfig,
  AgentSystemPromptConfig,
  CodexReasoningEffort,
  OpenClawAgentDto,
  OpenProjectTarget,
} from 'chrome-mcp-shared';
import { computed, ref, watch } from 'vue';
import ILucideExternalLink from '~icons/lucide/external-link';
import ILucideFolderOpen from '~icons/lucide/folder-open';
import AgentOpenProjectMenu from './AgentOpenProjectMenu.vue';

const openProjectMenuOpen = ref(false);

function handleOpenProjectMenuSelect(target: OpenProjectTarget) {
  emit('open-project', target);
  openProjectMenuOpen.value = false;
}

function handleOpenProjectMenuClose() {
  openProjectMenuOpen.value = false;
}

function handleFolderButtonClick(): void {
  // If workspace is configurable (session not started), repurpose the folder button
  // to trigger folder picking; otherwise toggle the project menu.
  if (isWorkspaceConfigurable.value) {
    emit('workspace:pick');
    openProjectMenuOpen.value = false;
    return;
  }
  openProjectMenuOpen.value = !openProjectMenuOpen.value;
}

const props = defineProps<{
  open: boolean;
  session: AgentSession | null;
  managementInfo: AgentManagementInfo | null;
  projectRootPath: string;
  openProjectDefaultTarget: OpenProjectTarget | null;
  openProjectLoading: boolean;
  workspacePicking: boolean;
  openclawAgents?: OpenClawAgentDto[];
  selectedOpenclawAgentId?: string;
  isLoading: boolean;
  isSaving: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [settings: SessionSettings];
  'workspace:pick': [];
  'open-project': [target: OpenProjectTarget];
}>();

export interface SessionSettings {
  model: string;
  permissionMode: string;
  systemPromptConfig: AgentSystemPromptConfig | null;
  optionsConfig?: AgentSessionOptionsConfig;
}

// Local state
const localModel = ref('');
const localPermissionMode = ref('');
const localReasoningEffort = ref<CodexReasoningEffort>('low');
const localSaveConversationToEverMemOS = ref(false);
const localOpenClawAgentId = ref('main');
const localUseCustomPrompt = ref(false);
const localCustomPrompt = ref('');
const localAppendToPrompt = ref(false);
const localPromptAppend = ref('');

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

// Computed
const isClaudeEngine = computed(() => props.session?.engineName === 'claude');
const isCodexEngine = computed(() => props.session?.engineName === 'codex');
const isOpenClawEngine = computed(() => props.session?.engineName === 'openclaw');
const isWorkspaceConfigurable = computed(() => props.session?.id === '__new__');

const sourceUrl = computed(() => {
  const raw = props.session?.sourceUrl;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
});

const sourcePlatform = computed(() => {
  const sessionId = String(props.session?.id || '')
    .trim()
    .toLowerCase();
  return sessionId.includes(':') ? sessionId.split(':')[0] : '';
});

const sourcePlatformName = computed(() => {
  const platform = sourcePlatform.value;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
});

const sourcePlatformIconFile = computed(() => {
  switch (sourcePlatform.value) {
    case 'chatgpt':
      return 'chatgpt.svg';
    case 'gemini':
      return 'gemini.svg';
    case 'claude':
      return 'claude.png';
    case 'deepseek':
      return 'deepseek.svg';
    default:
      return null;
  }
});

const sectionCardStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface-inset, #f5f5f5)',
  borderRadius: 'var(--ac-radius-inner, 8px)',
}));

const pathBoxStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface, #ffffff)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
  borderRadius: 'var(--ac-radius-inner, 8px)',
  color: 'var(--ac-text, #1a1a1a)',
  padding: '8px 36px 8px 10px',
}));

const secondaryButtonStyle = computed(() => ({
  backgroundColor: 'var(--ac-surface, #ffffff)',
  border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
  borderRadius: 'var(--ac-radius-button, 8px)',
  color: 'var(--ac-text, #1a1a1a)',
}));

function openTargetStyle(target: OpenProjectTarget) {
  const isDefault = props.openProjectDefaultTarget === target;
  return {
    backgroundColor: isDefault
      ? 'color-mix(in srgb, var(--ac-accent) 14%, transparent)'
      : 'var(--ac-surface, #ffffff)',
    border: isDefault
      ? 'var(--ac-border-width, 1px) solid color-mix(in srgb, var(--ac-accent) 55%, transparent)'
      : 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
    borderRadius: 'var(--ac-radius-button, 8px)',
    color: isDefault ? 'var(--ac-accent, #c87941)' : 'var(--ac-text, #1a1a1a)',
  } as const;
}

// Get available reasoning efforts based on selected model
const availableReasoningEfforts = computed<readonly CodexReasoningEffort[]>(() => {
  if (!isCodexEngine.value) return [];
  const effectiveModel = localModel.value || getDefaultModelForCli('codex');
  return getCodexReasoningEfforts(effectiveModel);
});

// Normalize reasoning effort when model changes
const normalizedReasoningEffort = computed(() => {
  const supported = availableReasoningEfforts.value;
  if (supported.length === 0) return localReasoningEffort.value;
  if (supported.includes(localReasoningEffort.value)) return localReasoningEffort.value;
  return supported[supported.length - 1]; // fallback to highest supported
});

const availableModels = computed(() => {
  if (!props.session?.engineName) return [];
  return getModelsForCli(props.session.engineName);
});

// Get the currently selected OpenClaw agent
const selectedOpenClawAgent = computed<OpenClawAgentDto | undefined>(() => {
  if (!props.openclawAgents?.length) return undefined;
  return props.openclawAgents.find((a) => a.id === localOpenClawAgentId.value);
});

// Get the default project path - prefer agent's workspaceDir for OpenClaw
const defaultProjectPath = computed(() => {
  if (isOpenClawEngine.value && selectedOpenClawAgent.value?.workspaceDir) {
    return selectedOpenClawAgent.value.workspaceDir;
  }
  return props.projectRootPath;
});

// Initialize local state when session changes
watch(
  () => props.session,
  (session) => {
    if (session) {
      localModel.value = session.model || getDefaultModelForCli(session.engineName);
      localPermissionMode.value = session.permissionMode || '';
      // Runtime default: enabled when unset; only disabled when explicitly false.
      localSaveConversationToEverMemOS.value =
        session.optionsConfig?.saveConversationToEverMemOS !== false;

      const selectedAgent = (props.selectedOpenclawAgentId || '').trim();
      localOpenClawAgentId.value = selectedAgent || localOpenClawAgentId.value || 'main';

      // Initialize reasoning effort from session's codex config
      const codexConfig = session.optionsConfig?.codexConfig;
      if (codexConfig?.reasoningEffort) {
        localReasoningEffort.value = codexConfig.reasoningEffort;
      } else {
        localReasoningEffort.value = 'medium';
      }

      // Parse system prompt config based on type
      const config = session.systemPromptConfig;
      if (config) {
        if (config.type === 'custom') {
          localUseCustomPrompt.value = true;
          localCustomPrompt.value = config.text || '';
          localAppendToPrompt.value = false;
          localPromptAppend.value = '';
        } else if (config.type === 'preset') {
          localUseCustomPrompt.value = false;
          localCustomPrompt.value = '';
          localAppendToPrompt.value = !!config.append;
          localPromptAppend.value = config.append || '';
        }
      } else {
        localUseCustomPrompt.value = false;
        localCustomPrompt.value = '';
        localAppendToPrompt.value = false;
        localPromptAppend.value = '';
      }
    }
  },
  { immediate: true },
);

watch(
  () => props.selectedOpenclawAgentId,
  (next) => {
    const trimmed = (next || '').trim();
    if (!trimmed) return;
    localOpenClawAgentId.value = trimmed;
  },
  { immediate: true },
);

// Auto-adjust reasoning effort when model changes
watch(localModel, () => {
  if (isCodexEngine.value) {
    localReasoningEffort.value = normalizedReasoningEffort.value;
  }
});

function getEngineColor(engineName: string): string {
  const colors: Record<string, string> = {
    claude: '#c87941',
    codex: '#10a37f',
    cursor: '#8b5cf6',
    qwen: '#6366f1',
    glm: '#ef4444',
  };
  return colors[engineName] || '#6b7280';
}

function handleClose(): void {
  emit('close');
}

function openSourceUrl(): void {
  const url = sourceUrl.value;
  if (!url) return;
  void chrome.tabs.create({ url });
}

function handleSave(): void {
  // Build systemPromptConfig based on local state
  let systemPromptConfig: AgentSystemPromptConfig | null = null;

  if (localUseCustomPrompt.value && localCustomPrompt.value.trim()) {
    systemPromptConfig = {
      type: 'custom',
      text: localCustomPrompt.value.trim(),
    };
  } else if (localAppendToPrompt.value && localPromptAppend.value.trim()) {
    systemPromptConfig = {
      type: 'preset',
      preset: 'claude_code',
      append: localPromptAppend.value.trim(),
    };
  } else {
    // Use default preset without append
    systemPromptConfig = {
      type: 'preset',
      preset: 'claude_code',
    };
  }

  const existingOptions = props.session?.optionsConfig ?? {};
  const existingCodexConfig = existingOptions.codexConfig ?? {};
  const existingOpenClaw = existingOptions.openclaw ?? {};

  const openclawAgentId = localOpenClawAgentId.value.trim();

  const optionsConfig: AgentSessionOptionsConfig = {
    ...existingOptions,
    saveConversationToEverMemOS: localSaveConversationToEverMemOS.value,
    ...(isCodexEngine.value
      ? {
          codexConfig: {
            ...existingCodexConfig,
            reasoningEffort: normalizedReasoningEffort.value,
          },
        }
      : {}),
    ...(isOpenClawEngine.value && openclawAgentId
      ? {
          openclaw: {
            ...existingOpenClaw,
            sessionKey: openclawAgentId,
          },
        }
      : {}),
  };

  const settings: SessionSettings = {
    model: localModel.value.trim(),
    permissionMode: localPermissionMode.value,
    systemPromptConfig,
    optionsConfig,
  };
  emit('save', settings);
}
</script>
