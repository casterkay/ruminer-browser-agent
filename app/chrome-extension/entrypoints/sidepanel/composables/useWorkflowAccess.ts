import { computed, onMounted, onUnmounted, ref } from 'vue';

import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import {
  DEFAULT_WORKFLOW_ACCESS_STATE,
  getRuminerHostedUrl,
  hasWorkflowAccess,
  normalizeWorkflowAccessState,
  type WorkflowAccessState,
} from '@/common/workflow-access';

type WorkflowAccessResponse = {
  success?: boolean;
  error?: string;
  state?: WorkflowAccessState;
};

export function useWorkflowAccess() {
  const state = ref<WorkflowAccessState>({ ...DEFAULT_WORKFLOW_ACCESS_STATE });
  const pending = ref(false);

  const isUnlocked = computed(() => hasWorkflowAccess(state.value));
  const isLocked = computed(() => !isUnlocked.value);
  const ctaLabel = computed(() => {
    if (state.value.syncing) {
      return 'Open linking tab again';
    }
    if (state.value.blockReason === 'billing_recovery_required') {
      return 'Update billing';
    }
    if (state.value.status === 'free') {
      return 'Upgrade to Ruminer Pro';
    }
    return 'Sign in to unlock full features';
  });

  async function refresh(): Promise<WorkflowAccessState> {
    const response = (await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_WORKFLOW_ACCESS_STATE,
    })) as WorkflowAccessResponse;

    if (response?.state) {
      state.value = normalizeWorkflowAccessState(response.state);
    }

    if (response?.success === false && response.error) {
      state.value = normalizeWorkflowAccessState({
        ...state.value,
        error: response.error,
      });
    }

    return state.value;
  }

  async function startLink(): Promise<WorkflowAccessState> {
    pending.value = true;
    try {
      const response = (await chrome.runtime.sendMessage({
        type: BACKGROUND_MESSAGE_TYPES.START_WORKFLOW_ACCESS_LINK,
      })) as WorkflowAccessResponse;

      if (response?.state) {
        state.value = normalizeWorkflowAccessState(response.state);
      }

      if (response?.success === false) {
        throw new Error(response.error || 'Unable to start workflow access link.');
      }

      return state.value;
    } finally {
      pending.value = false;
    }
  }

  async function openAccount(): Promise<void> {
    await chrome.tabs.create({ url: getRuminerHostedUrl('/account') });
  }

  function handleRuntimeMessage(message: unknown): void {
    const payload = message as { type?: string; payload?: WorkflowAccessState } | undefined;
    if (payload?.type !== BACKGROUND_MESSAGE_TYPES.WORKFLOW_ACCESS_STATE_CHANGED) {
      return;
    }

    state.value = normalizeWorkflowAccessState(payload.payload);
  }

  onMounted(() => {
    void refresh();
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  });

  onUnmounted(() => {
    chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  });

  return {
    state,
    pending,
    isLocked,
    isUnlocked,
    ctaLabel,
    refresh,
    startLink,
    openAccount,
  };
}
