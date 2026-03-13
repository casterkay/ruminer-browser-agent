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
          :is-active="activeTab === 'workflows'"
          :flows="displayFlows"
          :runs="workflows.runs.value"
          :triggers="workflows.triggers.value"
          :progress-by-run-id="workflows.progressByRunId.value"
          :queue-progress="workflows.queueProgress.value"
          :manual-run-ids="manualResultRunIds"
          :only-bound="onlyBound"
          :open-run-id="openRunId"
          :refreshing="workflowRefreshing"
          :running-flow-ids="runningFlowIds"
          :active-hostname="activeHostname"
          :get-run-events="workflows.getRunEvents"
          :on-run-event="workflows.onRunEvent"
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
          @pause-queue="pauseQueue"
          @resume-queue="resumeQueue"
          @stop-queue="stopQueue"
          @manual-run-handled="handleManualRunHandled"
          @open-chat-session="openChatSession"
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

    <FlowArgsModal
      :open="Boolean(flowArgsModal)"
      :flow-name="flowArgsModal?.flowName ?? ''"
      :variables="flowArgsModal?.variables ?? []"
      :initial-values="flowArgsModal?.initialValues ?? {}"
      @run="handleFlowArgs($event)"
      @cancel="handleFlowArgs(null)"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computeToolListHash,
  diffAddedTools,
  isToolListSuperset,
  loadFlowApprovals,
  normalizeToolList,
  saveFlowApprovals,
  type FlowApprovalsStore,
} from '@/common/flow-approvals';
import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import SystemSettingsForm from '@/entrypoints/shared/components/SystemSettingsForm.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AgentChat from './components/AgentChat.vue';
import MemoryView from './components/memory/MemoryView.vue';
import SidepanelNavigator from './components/SidepanelNavigator.vue';
import FlowApprovalModal from './components/workflows/FlowApprovalModal.vue';
import FlowArgsModal, { type FlowArgVar } from './components/workflows/FlowArgsModal.vue';
import WorkflowsView from './components/workflows/WorkflowsView.vue';
import { useAgentTheme } from './composables/useAgentTheme';
import { useChatBackendPreference } from './composables/useChatBackendPreference';
import { useWorkflowsV3 } from './composables/useWorkflowsV3';

const ACTIVE_TAB_KEY = 'ruminer.sidepanel.active-tab';

type TabId = 'chat' | 'memory' | 'workflows' | 'settings';

async function getActiveTabUrl(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return typeof tabs[0]?.url === 'string' && tabs[0].url ? tabs[0].url : null;
  } catch {
    return null;
  }
}

async function getActiveTabId(): Promise<number | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return typeof tabs[0]?.id === 'number' && Number.isFinite(tabs[0].id) ? tabs[0].id : null;
  } catch {
    return null;
  }
}

function parseChatConversationId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(?:c|chat)\/([^/?#]+)/i);
    return m ? String(m[1]) : null;
  } catch {
    return null;
  }
}

const theme = useAgentTheme();
const chatBackend = useChatBackendPreference();
const activeTab = ref<TabId>('chat');
const onlyBound = ref(false);
const openRunId = ref<string | null>(null);
const activeTabId = ref<number | null>(null);
const activeTabUrl = ref<string>('');
const activeHostname = ref<string>('');

const workflows = useWorkflowsV3({
  autoConnect: true,
  autoRefreshMs: 10_000,
});

const workflowRefreshing = ref(false);
const runningFlowIds = ref<Set<string>>(new Set());
const manualResultRunIds = ref<Set<string>>(new Set());

function trackManualRun(runId: string | null | undefined): void {
  const rid = String(runId || '').trim();
  if (!rid) return;
  manualResultRunIds.value = new Set([...manualResultRunIds.value, rid]);
}

function handleManualRunHandled(runId: string): void {
  const rid = String(runId || '').trim();
  if (!rid || !manualResultRunIds.value.has(rid)) return;
  const next = new Set(manualResultRunIds.value);
  next.delete(rid);
  manualResultRunIds.value = next;
}

function openChatSession(payload: { sessionId: string } | string): void {
  const sessionId = typeof payload === 'string' ? payload : payload.sessionId;
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  setActiveTab('chat');
  window.dispatchEvent(
    new CustomEvent('ruminer.agentChat.navigateSession', {
      detail: { sessionId: sid },
    }),
  );
}

function safeParseUrl(url: string): URL | null {
  try {
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}

function hostMatchesDomain(activeHost: string, domain: string): boolean {
  const host = String(activeHost || '')
    .trim()
    .toLowerCase();
  const d = String(domain || '')
    .trim()
    .toLowerCase();
  if (!host || !d) return false;
  return host === d || host.endsWith(`.${d}`);
}

function normalizePath(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function bindingMatchesActiveTab(binding: any): boolean {
  const kind = typeof binding?.kind === 'string' ? binding.kind.trim().toLowerCase() : '';
  const value = typeof binding?.value === 'string' ? binding.value.trim() : '';
  if (!kind || !value) return false;

  const activeUrlRaw = activeTabUrl.value.trim();
  const activeHost = activeHostname.value.trim().toLowerCase();

  if (kind === 'domain') {
    return hostMatchesDomain(activeHost, value);
  }

  const activeUrl = safeParseUrl(activeUrlRaw);
  if (!activeUrl) return false;

  if (kind === 'path') {
    const expected = normalizePath(value).toLowerCase();
    return expected ? activeUrl.pathname.toLowerCase().startsWith(expected) : false;
  }

  if (kind === 'url') {
    const expectedUrl = safeParseUrl(value);
    if (expectedUrl) {
      if (activeUrl.origin !== expectedUrl.origin) return false;
      const expectedPath = expectedUrl.pathname || '/';
      return activeUrl.pathname.startsWith(expectedPath);
    }

    return activeUrlRaw.toLowerCase().startsWith(value.toLowerCase());
  }

  return false;
}

const displayFlows = computed(() => {
  if (!onlyBound.value || !activeHostname.value) {
    return workflows.flows.value;
  }

  return workflows.flows.value.filter((flow) => {
    const bindings = flow.meta?.bindings || [];
    if (!bindings.length) {
      return false;
    }

    return bindings.some((binding) => bindingMatchesActiveTab(binding));
  });
});

function setActiveTab(tab: TabId): void {
  activeTab.value = tab;
  void chrome.storage.local.set({ [ACTIVE_TAB_KEY]: tab });
}

async function handleWorkflowRefresh(): Promise<void> {
  if (workflowRefreshing.value) return;
  workflowRefreshing.value = true;
  try {
    const minVisible = new Promise((r) => setTimeout(r, 500));
    await Promise.all([workflows.refresh(), minVisible]);
  } finally {
    workflowRefreshing.value = false;
  }
}

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

const flowArgsModal = ref<{
  flowId: string;
  flowName: string;
  variables: FlowArgVar[];
  initialValues: Record<string, string | undefined>;
} | null>(null);

let flowArgsResolver: ((args: Record<string, string> | null) => void) | null = null;

function handleFlowArgs(args: Record<string, string> | null) {
  const resolver = flowArgsResolver;
  flowArgsResolver = null;
  flowArgsModal.value = null;
  resolver?.(args);
}

function requestFlowArgs(input: {
  flowId: string;
  flowName: string;
  variables: FlowArgVar[];
  initialValues: Record<string, string | undefined>;
}): Promise<Record<string, string> | null> {
  flowArgsModal.value = input;
  return new Promise<Record<string, string> | null>((resolve) => {
    flowArgsResolver = resolve;
  });
}

async function runFlow(flowId: string): Promise<void> {
  if (runningFlowIds.value.has(flowId)) return;
  runningFlowIds.value = new Set([...runningFlowIds.value, flowId]);

  try {
    const flow = await workflows.getFlowById(flowId);

    const requiredVars = (flow?.variables || []).filter(
      (v) => v.required && v.default === undefined,
    );

    let args: Record<string, string> | undefined;
    if (requiredVars.length > 0) {
      const initialValues: Record<string, string | undefined> = {};

      const activeUrl = await getActiveTabUrl();
      if (activeUrl) {
        try {
          const host = new URL(activeUrl).hostname.toLowerCase();
          if (host === 'chatgpt.com' || host === 'chat.openai.com') {
            if (requiredVars.some((v) => v.name === 'conversationUrl')) {
              initialValues.conversationUrl = activeUrl;
            }
            if (requiredVars.some((v) => v.name === 'conversationId')) {
              const seedUrl = initialValues.conversationUrl || activeUrl;
              const parsed = parseChatConversationId(seedUrl);
              if (parsed) {
                initialValues.conversationId = parsed;
              }
            }
          }
        } catch {}
      }

      const provided = await requestFlowArgs({
        flowId,
        flowName: flow?.name ?? flowId,
        variables: requiredVars.map((v) => ({
          name: v.name,
          label: v.label,
          description: v.description,
          sensitive: v.sensitive,
        })),
        initialValues,
      });

      if (!provided) {
        return;
      }
      args = provided;
    }

    const requiredTools = normalizeToolList(flow?.meta?.requiredTools);
    if (requiredTools.length === 0) {
      const nextArgs = await maybeAddConversationUrlArg(flowId, flow, args);
      if (nextArgs === null) return;
      const tabId = flowId.endsWith('.conversation_ingest.v1') ? await getActiveTabId() : null;
      const r = await workflows.runFlow(flowId, nextArgs, { tabId });
      trackManualRun(r?.runId);
      return;
    }

    const requiredToolsHash = await computeToolListHash(requiredTools);
    const approvals = await loadFlowApprovals();
    const existing = approvals[flowId];

    if (existing?.approvedToolsHash === requiredToolsHash) {
      const nextArgs = await maybeAddConversationUrlArg(flowId, flow, args);
      if (nextArgs === null) return;
      const tabId = flowId.endsWith('.conversation_ingest.v1') ? await getActiveTabId() : null;
      const r = await workflows.runFlow(flowId, nextArgs, { tabId });
      trackManualRun(r?.runId);
      return;
    }

    const prevTools = normalizeToolList(existing?.approvedTools);
    if (existing && isToolListSuperset(prevTools, requiredTools)) {
      const nextArgs = await maybeAddConversationUrlArg(flowId, flow, args);
      if (nextArgs === null) return;
      const tabId = flowId.endsWith('.conversation_ingest.v1') ? await getActiveTabId() : null;
      const r = await workflows.runFlow(flowId, nextArgs, { tabId });
      trackManualRun(r?.runId);
      return;
    }

    const addedTools = diffAddedTools(prevTools, requiredTools);

    const approved = await requestFlowApproval({
      flowId,
      flowName: flow?.name ?? flowId,
      requiredToolsHash,
      requiredTools,
      addedTools,
    });

    if (!approved) {
      return;
    }

    await saveFlowApprovals({
      ...approvals,
      [flowId]: {
        approvedToolsHash: requiredToolsHash,
        approvedTools: requiredTools,
        approvedAt: new Date().toISOString(),
      },
    });

    const nextArgs = await maybeAddConversationUrlArg(flowId, flow, args);
    if (nextArgs === null) return;
    const tabId = flowId.endsWith('.conversation_ingest.v1') ? await getActiveTabId() : null;
    const r = await workflows.runFlow(flowId, nextArgs, { tabId });
    trackManualRun(r?.runId);
  } finally {
    const next = new Set(runningFlowIds.value);
    next.delete(flowId);
    runningFlowIds.value = next;
  }
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  if (!h || !d) return false;
  if (h === d) return true;
  return h.endsWith(`.${d}`);
}

function urlMatchesFlowBindings(urlString: string, flow: FlowV3 | null): boolean {
  if (!flow?.meta?.bindings?.length) return true;
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }

  for (const binding of flow.meta.bindings) {
    const kind = String((binding as any).kind || '');
    const value = String((binding as any).value || '');
    if (!kind || !value) continue;
    if (kind === 'url' && urlString.startsWith(value)) return true;
    if (kind === 'path' && parsed.pathname.startsWith(value.startsWith('/') ? value : `/${value}`))
      return true;
    if (kind === 'domain' && hostnameMatchesDomain(parsed.hostname, value)) return true;
  }

  return false;
}

async function maybeAddConversationUrlArg(
  flowId: string,
  flow: FlowV3 | null,
  args: Record<string, string> | undefined,
): Promise<Record<string, string> | undefined | null> {
  if (!flowId.endsWith('.conversation_ingest.v1')) {
    return args;
  }

  const activeUrl = await getActiveTabUrl();

  const bindings = Array.isArray(flow?.meta?.bindings) ? flow!.meta!.bindings : [];
  const bindingHints = bindings
    .map((b: any) => {
      const kind = String(b?.kind || '').trim();
      const value = String(b?.value || '').trim();
      if (!kind || !value) return null;
      if (kind === 'domain') return value;
      if (kind === 'url') return value;
      if (kind === 'path') return `path:${value}`;
      return `${kind}:${value}`;
    })
    .filter(Boolean)
    .join(', ');

  if (!activeUrl) {
    window.alert(
      `This workflow requires a conversation page.\n\nOpen a matching tab${
        bindingHints ? ` (${bindingHints})` : ''
      } and try again.`,
    );
    return null;
  }

  if (!urlMatchesFlowBindings(activeUrl, flow)) {
    let host = '';
    try {
      host = new URL(activeUrl).hostname;
    } catch {}
    window.alert(
      `Active tab does not match this workflow’s bindings.\n\nActive tab: ${
        host || activeUrl
      }\nExpected: ${bindingHints || 'any site'}`,
    );
    return null;
  }

  return { ...(args ?? {}), ruminerConversationUrl: activeUrl };
}

async function stopRun(payload: { runId: string; status: string }): Promise<void> {
  const reason = 'Stopped by user';
  if (payload.status === 'queued') {
    await workflows.cancelQueueItem(payload.runId, reason);
    return;
  }
  await workflows.cancelRun(payload.runId, reason);
}

async function pauseQueue(): Promise<void> {
  await workflows.pauseQueueWave('Paused by user');
}

async function resumeQueue(): Promise<void> {
  await workflows.resumeQueueWave();
}

async function stopQueue(): Promise<void> {
  await workflows.stopQueueWave('Stopped by user');
}

async function scheduleChange(payload: {
  flowId: string;
  cron: string | null;
  enabled: boolean;
}): Promise<void> {
  if (!payload.enabled || !payload.cron) {
    await workflows.upsertCronSchedule(payload.flowId, payload.cron, payload.enabled);
    return;
  }

  const flow = await workflows.getFlowById(payload.flowId);
  const requiredVars = (flow?.variables || []).filter((v) => v.required && v.default === undefined);
  if (requiredVars.length > 0) {
    // The simple schedule UI can't capture per-trigger args yet; avoid silently scheduling broken runs.
    // TODO(plan2 D3): Support scheduling flows with args (persist args per-trigger and plumb through
    // rr_v3 cron trigger firing into enqueueRun input.args).
    window.alert('This workflow requires parameters and cannot be scheduled from this UI yet.');
    return;
  }
  const requiredTools = normalizeToolList(flow?.meta?.requiredTools);
  if (requiredTools.length === 0) {
    await workflows.upsertCronSchedule(payload.flowId, payload.cron, payload.enabled);
    return;
  }

  const requiredToolsHash = await computeToolListHash(requiredTools);
  const approvals: FlowApprovalsStore = await loadFlowApprovals();
  const existing = approvals[payload.flowId];

  const prevTools = normalizeToolList(existing?.approvedTools);
  if (existing && isToolListSuperset(prevTools, requiredTools)) {
    await workflows.upsertCronSchedule(payload.flowId, payload.cron, payload.enabled);
    return;
  }

  const addedTools = diffAddedTools(prevTools, requiredTools);
  const approved = await requestFlowApproval({
    flowId: payload.flowId,
    flowName: flow?.name ?? payload.flowId,
    requiredToolsHash,
    requiredTools,
    addedTools,
  });
  if (!approved) {
    return;
  }

  await saveFlowApprovals({
    ...approvals,
    [payload.flowId]: {
      approvedToolsHash: requiredToolsHash,
      approvedTools: requiredTools,
      approvedAt: new Date().toISOString(),
    },
  });

  await workflows.upsertCronSchedule(payload.flowId, payload.cron, payload.enabled);
}

function openBuilder(mode: 'flow' | 'trigger', id?: string): void {
  const url = new URL(chrome.runtime.getURL('/builder.html'));

  if (mode === 'flow') {
    if (id) {
      url.searchParams.set('flowId', id);
    } else {
      url.searchParams.set('new', '1');
    }
  } else {
    url.searchParams.set('openTriggers', '1');

    if (id) {
      const trigger = workflows.triggers.value.find((t) => t.id === id);
      if (trigger?.flowId) {
        url.searchParams.set('flowId', trigger.flowId);
      } else {
        url.searchParams.set('new', '1');
      }
    } else {
      url.searchParams.set('new', '1');
    }
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

async function refreshActiveTabInfo(nextTabId?: number | null): Promise<void> {
  const resolvedId =
    typeof nextTabId === 'number' && Number.isFinite(nextTabId)
      ? nextTabId
      : await getActiveTabId();
  activeTabId.value = resolvedId;

  let urlString: string | null = null;
  if (resolvedId !== null) {
    const tab = await chrome.tabs.get(resolvedId).catch(() => null);
    urlString = typeof tab?.url === 'string' && tab.url ? tab.url : null;
  }

  if (!urlString) {
    urlString = await getActiveTabUrl();
  }

  activeTabUrl.value = urlString || '';

  try {
    const parsed = urlString ? new URL(urlString) : null;
    activeHostname.value = parsed?.hostname || '';
  } catch {
    activeHostname.value = '';
  }
}

function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): void {
  void refreshActiveTabInfo(activeInfo?.tabId ?? null);
}

function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab,
): void {
  if (activeTabId.value === null || tabId !== activeTabId.value) return;
  if (changeInfo.url || changeInfo.status === 'complete') {
    void refreshActiveTabInfo(tabId);
    return;
  }

  // Fallback: sometimes changeInfo.url is missing but tab.url updates.
  if (typeof tab?.url === 'string' && tab.url && tab.url !== activeTabUrl.value) {
    void refreshActiveTabInfo(tabId);
  }
}

onMounted(async () => {
  await theme.initTheme();

  const stored = await chrome.storage.local.get(ACTIVE_TAB_KEY);
  const tab = stored[ACTIVE_TAB_KEY] as TabId | undefined;
  if (tab === 'chat' || tab === 'memory' || tab === 'workflows' || tab === 'settings') {
    activeTab.value = tab;
  }

  await refreshActiveTabInfo();
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.tabs.onUpdated.addListener(handleTabUpdated);
});

onUnmounted(() => {
  chrome.tabs.onActivated.removeListener(handleTabActivated);
  chrome.tabs.onUpdated.removeListener(handleTabUpdated);
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
