<template>
  <div class="agent-theme sidepanel-root" :data-agent-theme="theme.theme.value">
    <SidepanelNavigator :active-tab="activeTab" @change="setActiveTab" />

    <div class="sidepanel-content">
      <AgentChat v-show="activeTab === 'chat'" />
      <MemoryView v-show="activeTab === 'memory'" />

      <div v-show="activeTab === 'settings'" class="settings-wrapper">
        <SystemSettingsForm />
      </div>

      <div v-show="activeTab === 'workflows'" class="workflows-wrapper">
        <WorkflowsView
          :flows="displayFlows"
          :runs="workflows.runs.value"
          :triggers="workflows.triggers.value"
          :only-bound="onlyBound"
          :open-run-id="openRunId"
          :get-run-events="workflows.getRunEvents"
          @refresh="handleWorkflowRefresh"
          @create="createFlow"
          @run="runFlow"
          @stop-run="stopRun"
          @edit="editFlow"
          @delete="deleteFlow"
          @export="exportFlow"
          @schedule-change="scheduleChange"
          @update:only-bound="onlyBound = $event"
          @toggle-run="toggleRun"
          @create-trigger="openBuilder('trigger')"
          @edit-trigger="openBuilder('trigger', $event)"
          @remove-trigger="deleteTrigger"
        />
      </div>
    </div>

    <FlowApprovalModal
      :open="Boolean(flowApprovalModal)"
      :flow-name="flowApprovalModal?.flowName ?? ''"
      :required-tools="flowApprovalModal?.requiredTools ?? []"
      :added-tools="flowApprovalModal?.addedTools ?? []"
      @approve="handleFlowApproval(true)"
      @cancel="handleFlowApproval(false)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AgentChat from './components/AgentChat.vue';
import MemoryView from './components/memory/MemoryView.vue';
import SidepanelNavigator from './components/SidepanelNavigator.vue';
import SystemSettingsForm from '@/entrypoints/shared/components/SystemSettingsForm.vue';
import WorkflowsView from './components/workflows/WorkflowsView.vue';
import FlowApprovalModal from './components/workflows/FlowApprovalModal.vue';
import { useAgentTheme } from './composables/useAgentTheme';
import { useChatBackendPreference } from './composables/useChatBackendPreference';
import { useWorkflowsV3 } from './composables/useWorkflowsV3';
import { STORAGE_KEYS } from '@/common/constants';
import { sha256Hex } from '@/entrypoints/background/ruminer/hash';
import { stableJson } from '@/entrypoints/shared/utils/stable-json';

const ACTIVE_TAB_KEY = 'ruminer.sidepanel.active-tab';

type TabId = 'chat' | 'memory' | 'workflows' | 'settings';

const theme = useAgentTheme();
const chatBackend = useChatBackendPreference();
const activeTab = ref<TabId>('chat');
const onlyBound = ref(false);
const openRunId = ref<string | null>(null);
const activeHostname = ref<string>('');

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

type FlowApprovalRecord = {
  approvedToolsHash: string;
  approvedTools: string[];
  approvedAt: string;
};

type FlowApprovalsStore = Record<string, FlowApprovalRecord>;

const flowApprovalModal = ref<{
  flowId: string;
  flowName: string;
  requiredToolsHash: string;
  requiredTools: string[];
  addedTools: string[];
} | null>(null);

let flowApprovalResolver: ((approved: boolean) => void) | null = null;

function handleFlowApproval(approved: boolean) {
  const resolver = flowApprovalResolver;
  flowApprovalResolver = null;
  flowApprovalModal.value = null;
  resolver?.(approved);
}

function requestFlowApproval(input: {
  flowId: string;
  flowName: string;
  requiredToolsHash: string;
  requiredTools: string[];
  addedTools: string[];
}): Promise<boolean> {
  flowApprovalModal.value = input;
  return new Promise<boolean>((resolve) => {
    flowApprovalResolver = resolve;
  });
}

async function loadFlowApprovals(): Promise<FlowApprovalsStore> {
  const raw = (await chrome.storage.local.get(STORAGE_KEYS.FLOW_APPROVALS))[
    STORAGE_KEYS.FLOW_APPROVALS
  ];
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as FlowApprovalsStore) : {};
}

async function saveFlowApprovals(store: FlowApprovalsStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.FLOW_APPROVALS]: store });
}

async function runFlow(flowId: string): Promise<void> {
  const flow = await workflows.getFlowById(flowId);

  const requiredTools = Array.isArray(flow?.meta?.requiredTools)
    ? flow!
        .meta!.requiredTools!.filter((tool) => typeof tool === 'string' && tool.trim())
        .map((t) => t.trim())
    : [];

  const normalizedTools = Array.from(new Set(requiredTools)).sort();
  if (normalizedTools.length === 0) {
    await workflows.runFlow(flowId);
    return;
  }

  const requiredToolsHash = await sha256Hex(stableJson(normalizedTools));
  const approvals = await loadFlowApprovals();
  const existing = approvals[flowId];

  if (existing?.approvedToolsHash === requiredToolsHash) {
    await workflows.runFlow(flowId);
    return;
  }

  const prevTools = Array.isArray(existing?.approvedTools) ? existing.approvedTools : [];
  const addedTools = normalizedTools.filter((tool) => !prevTools.includes(tool));

  const approved = await requestFlowApproval({
    flowId,
    flowName: flow?.name ?? flowId,
    requiredToolsHash,
    requiredTools: normalizedTools,
    addedTools,
  });

  if (!approved) {
    return;
  }

  await saveFlowApprovals({
    ...approvals,
    [flowId]: {
      approvedToolsHash: requiredToolsHash,
      approvedTools: normalizedTools,
      approvedAt: new Date().toISOString(),
    },
  });

  await workflows.runFlow(flowId);
}

async function stopRun(payload: { runId: string; status: string }): Promise<void> {
  const reason = 'Stopped by user';
  if (payload.status === 'queued') {
    await workflows.cancelQueueItem(payload.runId, reason);
    return;
  }
  await workflows.cancelRun(payload.runId, reason);
}

async function scheduleChange(payload: {
  flowId: string;
  cron: string | null;
  enabled: boolean;
}): Promise<void> {
  await workflows.upsertCronSchedule(payload.flowId, payload.cron, payload.enabled);
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
  if (tab === 'chat' || tab === 'memory' || tab === 'workflows' || tab === 'settings') {
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

.settings-wrapper {
  height: 100%;
  overflow-y: auto;
  padding: 16px 20px;
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
