<template>
  <div class="sidepanel-root">
    <SidepanelNavigator :active-tab="activeTab" @change="setActiveTab" />

    <div class="sidepanel-content">
      <AgentChat v-if="activeTab === 'chat'" />
      <MemoryView v-else-if="activeTab === 'memory'" />

      <WorkflowsView
        v-else
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
      <p v-if="activeTab === 'workflows' && !emosConfigured" class="workflow-warning">
        Configure EMOS in Options before running ingestion workflows.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getEmosSettings } from '@/entrypoints/shared/utils/openclaw-settings';
import AgentChat from './components/AgentChat.vue';
import MemoryView from './components/memory/MemoryView.vue';
import SidepanelNavigator from './components/SidepanelNavigator.vue';
import WorkflowsView from './components/workflows/WorkflowsView.vue';
import { useWorkflowsV3 } from './composables/useWorkflowsV3';

const ACTIVE_TAB_KEY = 'ruminer.sidepanel.active-tab';

type TabId = 'chat' | 'memory' | 'workflows';

const activeTab = ref<TabId>('chat');
const onlyBound = ref(false);
const openRunId = ref<string | null>(null);
const activeHostname = ref<string>('');
const emosConfigured = ref(false);

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
  if (!emosConfigured.value) {
    alert('EMOS is not configured. Open Options and set EMOS settings first.');
    return;
  }
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
  if (!emosConfigured.value) {
    alert('EMOS is not configured. Open Options and set EMOS settings first.');
    return;
  }
  openBuilder('flow');
}

function editFlow(flowId: string): void {
  if (!emosConfigured.value) {
    alert('EMOS is not configured. Open Options and set EMOS settings first.');
    return;
  }
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

  const emos = await getEmosSettings();
  emosConfigured.value = !!emos.baseUrl.trim() && !!emos.apiKey.trim();
});
</script>

<style scoped>
.sidepanel-root {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  background: #e2e8f0;
}

.sidepanel-content {
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.workflow-warning {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  margin: 0;
  border: 1px solid #fdba74;
  background: #fff7ed;
  color: #9a3412;
  padding: 8px;
  border-radius: 8px;
  font-size: 12px;
}
</style>
