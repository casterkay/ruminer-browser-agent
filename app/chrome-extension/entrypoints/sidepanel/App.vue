<template>
  <div class="agent-theme sidepanel-root" :data-agent-theme="theme.theme.value">
    <SidepanelNavigator
      :active-tab="activeTab"
      @change="setActiveTab"
      @settings="settingsOpen = true"
    />

    <div class="sidepanel-content">
      <AgentChat v-show="activeTab === 'chat'" />
      <MemoryView v-show="activeTab === 'memory'" />

      <div v-show="activeTab === 'workflows'" class="workflows-wrapper">
        <WorkflowsView
          :flows="displayFlows"
          :runs="workflows.runs.value"
          :triggers="workflows.triggers.value"
          :only-bound="onlyBound"
          :open-run-id="openRunId"
          @refresh="handleWorkflowRefresh"
          @create="createFlow"
          @run="runFlow"
          @edit="editFlow"
          @delete="deleteFlow"
          @export="exportFlow"
          @update:only-bound="onlyBound = $event"
          @toggle-run="toggleRun"
          @create-trigger="openBuilder('trigger')"
          @edit-trigger="openBuilder('trigger', $event)"
          @remove-trigger="deleteTrigger"
        />
        <div v-if="!emosConfigured" class="workflow-warning">
          <svg class="warning-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          Configure EverMemOS in Options before running ingestion workflows.
        </div>
      </div>
    </div>

    <SidepanelSettingsPanel :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AgentChat from './components/AgentChat.vue';
import MemoryView from './components/memory/MemoryView.vue';
import SidepanelNavigator from './components/SidepanelNavigator.vue';
import SidepanelSettingsPanel from './components/SidepanelSettingsPanel.vue';
import WorkflowsView from './components/workflows/WorkflowsView.vue';
import { useAgentTheme } from './composables/useAgentTheme';
import { useChatBackendPreference } from './composables/useChatBackendPreference';
import { useWorkflowsV3 } from './composables/useWorkflowsV3';

const ACTIVE_TAB_KEY = 'ruminer.sidepanel.active-tab';

type TabId = 'chat' | 'memory' | 'workflows';

const theme = useAgentTheme();
const chatBackend = useChatBackendPreference();
const activeTab = ref<TabId>('chat');
const onlyBound = ref(false);
const openRunId = ref<string | null>(null);
const activeHostname = ref<string>('');
const settingsOpen = ref(false);

const workflows = useWorkflowsV3({
  autoConnect: true,
  autoRefreshMs: 10_000,
});

const displayFlows = computed(() => {
  if (!onlyBound.value || !activeHostname.value) {
    return workflows.flows.value;
  }

  return workflows.flows.value.filter((flow) => {
    const bindings = flow.meta?.bindings || [];
    if (!bindings.length) {
      return false;
    }

    return bindings.some((binding) => {
      const value = String(binding.value || '').toLowerCase();
      return value.includes(activeHostname.value.toLowerCase());
    });
  });
});

function setActiveTab(tab: TabId): void {
  activeTab.value = tab;
  void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: tab });
}

async function handleWorkflowRefresh(): Promise<void> {
  await workflows.refresh();
}

async function runFlow(flowId: string): Promise<void> {
  await workflows.runFlow(flowId);
}

function openBuilder(mode: 'flow' | 'trigger', id?: string): void {
  const url = new URL(chrome.runtime.getURL('/popup.html'));
  url.searchParams.set('mode', mode);
  if (id) {
    url.searchParams.set('id', id);
  }
  void chrome.tabs.create({ url: url.toString() });
}

function createFlow(): void {
  openBuilder('flow');
}

function editFlow(flowId: string): void {
  openBuilder('flow', flowId);
}

async function deleteFlow(flowId: string): Promise<void> {
  await workflows.deleteFlow(flowId);
}

async function exportFlow(flowId: string): Promise<void> {
  const flow = await workflows.exportFlow(flowId);
  if (!flow) {
    return;
  }

  const blob = new Blob([JSON.stringify(flow, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename: `ruminer-flow-${flowId}.json`,
      saveAs: true,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toggleRun(runId: string): void {
  openRunId.value = openRunId.value === runId ? null : runId;
}

async function deleteTrigger(triggerId: string): Promise<void> {
  await workflows.deleteTrigger(triggerId);
}

onMounted(async () => {
  await theme.initTheme();

  const stored = await chrome.storage.local.get(ACTIVE_TAB_KEY);
  const tab = stored[ACTIVE_TAB_KEY] as TabId | undefined;
  if (tab === 'chat' || tab === 'memory' || tab === 'workflows') {
    activeTab.value = tab;
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url ? new URL(tabs[0].url) : null;
    activeHostname.value = url?.hostname || '';
  } catch {
    activeHostname.value = '';
  }
});
</script>

<style scoped>
.sidepanel-root {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  background-color: var(--ac-bg);
  background-image: var(--ac-bg-pattern);
  background-size: var(--ac-bg-pattern-size);
}

.sidepanel-content {
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.workflows-wrapper {
  height: 100%;
  position: relative;
}

.workflow-warning {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  margin: 0;
  border: var(--ac-border-width) solid var(--ac-warning);
  background-color: var(--ac-surface);
  color: var(--ac-text);
  padding: 10px 12px;
  border-radius: var(--ac-radius-inner);
  font-size: 12px;
  font-family: var(--ac-font-body);
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--ac-shadow-card);
}

.warning-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--ac-warning);
}
</style>
