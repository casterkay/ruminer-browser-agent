/**
 * Gateway-backed compatibility wrapper for legacy AgentChat composable.
 */
import { computed, ref } from 'vue';
import type {
  AgentMessage,
  AgentActRequestClientMeta,
  AgentAttachment,
  RealtimeEvent,
  AgentUsageStats,
} from 'chrome-mcp-shared';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';

export type RequestState =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface UseAgentChatOptions {
  getServerPort: () => number | null;
  getSessionId: () => string;
  ensureServer: () => Promise<boolean>;
  openEventSource: () => void;
}

async function gatewayRpc(method: string, params?: unknown): Promise<any> {
  const response = await chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_RPC,
    method,
    params,
  });

  if (!response?.success) {
    throw new Error(response?.error || `Gateway RPC failed: ${method}`);
  }

  return response.payload;
}

export function useAgentChat(options: UseAgentChatOptions) {
  const messages = ref<AgentMessage[]>([]);
  const input = ref('');
  const sending = ref(false);
  const isStreaming = ref(false);
  const requestState = ref<RequestState>('idle');
  const errorMessage = ref<string | null>(null);
  const currentRequestId = ref<string | null>(null);
  const cancelling = ref(false);
  const attachments = ref<AgentAttachment[]>([]);
  const lastUsage = ref<AgentUsageStats | null>(null);

  const canSend = computed(() => input.value.trim().length > 0 && !sending.value);
  const isRequestActive = computed(() => {
    return requestState.value === 'starting' || requestState.value === 'running';
  });

  function handleRealtimeEvent(event: RealtimeEvent): void {
    if (event.type === 'message' && event.data) {
      const data: any = event.data;

      const asMessage: AgentMessage = {
        id: data.id || crypto.randomUUID(),
        sessionId: options.getSessionId(),
        role: data.role || 'assistant',
        content: data.content || data.text || JSON.stringify(data),
        messageType: 'chat',
        createdAt: data.createdAt || new Date().toISOString(),
        requestId: data.runId || data.requestId,
      };

      const index = messages.value.findIndex((item) => item.id === asMessage.id);
      if (index >= 0) {
        messages.value[index] = asMessage;
      } else {
        messages.value.push(asMessage);
      }

      if (asMessage.role !== 'user') {
        requestState.value = 'running';
      }
    }
  }

  async function send(
    chatOptions: {
      cliPreference?: string;
      model?: string;
      projectId?: string;
      projectRoot?: string;
      dbSessionId?: string;
      instruction?: string;
      displayText?: string;
      clientMeta?: AgentActRequestClientMeta;
    } = {},
  ): Promise<void> {
    const userText = input.value.trim();
    if (!userText) {
      return;
    }

    const ready = await options.ensureServer();
    if (!ready) {
      errorMessage.value = 'Gateway is not connected.';
      return;
    }

    const sessionKey = options.getSessionId() || 'main';
    const requestId = crypto.randomUUID();

    const optimistic: AgentMessage = {
      id: `temp-${requestId}`,
      sessionId: sessionKey,
      role: 'user',
      content: userText,
      messageType: 'chat',
      requestId,
      createdAt: new Date().toISOString(),
      metadata:
        chatOptions.displayText || chatOptions.clientMeta
          ? {
              displayText: chatOptions.displayText,
              clientMeta: chatOptions.clientMeta,
            }
          : undefined,
    };

    messages.value.push(optimistic);
    input.value = '';
    sending.value = true;
    requestState.value = 'starting';
    currentRequestId.value = requestId;
    options.openEventSource();

    try {
      const response = await gatewayRpc('chat.send', {
        sessionKey,
        message: chatOptions.instruction?.trim() || userText,
        idempotencyKey: requestId,
        attachments: attachments.value.length > 0 ? attachments.value : undefined,
      });

      if (response?.runId) {
        currentRequestId.value = response.runId;
      }

      requestState.value = 'running';
      isStreaming.value = true;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      requestState.value = 'error';
      input.value = userText;
      messages.value = messages.value.filter((item) => item.id !== optimistic.id);
      currentRequestId.value = null;
    } finally {
      sending.value = false;
    }
  }

  async function cancelCurrentRequest(): Promise<void> {
    if (!currentRequestId.value) {
      return;
    }

    cancelling.value = true;
    try {
      await gatewayRpc('chat.abort', {
        sessionKey: options.getSessionId() || 'main',
        runId: currentRequestId.value,
      });
      requestState.value = 'cancelled';
      isStreaming.value = false;
      currentRequestId.value = null;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      cancelling.value = false;
    }
  }

  function clearMessages(): void {
    messages.value = [];
  }

  function setMessages(newMessages: AgentMessage[]): void {
    messages.value = [...newMessages];
  }

  return {
    messages,
    input,
    sending,
    isStreaming,
    requestState,
    errorMessage,
    currentRequestId,
    cancelling,
    attachments,
    lastUsage,
    canSend,
    isRequestActive,
    handleRealtimeEvent,
    send,
    cancelCurrentRequest,
    clearMessages,
    setMessages,
  };
}
