import { computed, onUnmounted, ref, type Ref } from 'vue';
import {
  buildToolGroupRestrictionText,
  getToolGroupState,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import type { GatewayEvent, UseOpenClawGateway } from './useOpenClawGateway';

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  runId?: string;
  isStreaming?: boolean;
}

export interface UseOpenClawChat {
  messages: Ref<ChatMessage[]>;
  input: Ref<string>;
  sending: Ref<boolean>;
  loadingHistory: Ref<boolean>;
  error: Ref<string | null>;
  activeRunId: Ref<string | null>;
  canSend: Ref<boolean>;
  hydrateHistory: () => Promise<void>;
  send: () => Promise<void>;
  abort: () => Promise<void>;
  newChat: () => Promise<void>;
  applyToolGroupsToPrompt: (message: string, toolGroups: ToolGroupState) => string;
}

const SESSION_KEY = 'main';

function normalizeMessage(payload: any): ChatMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const content =
    typeof payload.content === 'string'
      ? payload.content
      : typeof payload.message === 'string'
        ? payload.message
        : typeof payload.text === 'string'
          ? payload.text
          : '';

  if (!content && !payload.delta) {
    return null;
  }

  const roleRaw = String(
    payload.role || payload.sender || payload.type || 'assistant',
  ).toLowerCase();
  const role: ChatRole = roleRaw === 'user' ? 'user' : roleRaw === 'tool' ? 'tool' : 'assistant';

  return {
    id: String(payload.id || payload.messageId || payload.requestId || crypto.randomUUID()),
    role,
    content,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
    runId: typeof payload.runId === 'string' ? payload.runId : undefined,
    isStreaming: payload.isStreaming === true,
  };
}

function upsertMessage(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) {
    return [...messages, next];
  }

  const cloned = [...messages];
  cloned[index] = {
    ...cloned[index],
    ...next,
  };
  return cloned;
}

async function requestWithFallback(
  gateway: UseOpenClawGateway,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    return await gateway.request(method, params);
  } catch {
    if (method === 'chat.history') {
      return gateway.request(method, SESSION_KEY);
    }
    if (method === 'chat.abort') {
      return gateway.request(method, { sessionKey: SESSION_KEY });
    }
    throw new Error(`Gateway request failed for ${method}`);
  }
}

export function useOpenClawChat(gateway: UseOpenClawGateway): UseOpenClawChat {
  const messages = ref<ChatMessage[]>([]);
  const input = ref('');
  const sending = ref(false);
  const loadingHistory = ref(false);
  const error = ref<string | null>(null);
  const activeRunId = ref<string | null>(null);

  const canSend = computed(() => {
    return gateway.connected.value && input.value.trim().length > 0 && !sending.value;
  });

  function applyToolGroupsToPrompt(message: string, toolGroups: ToolGroupState): string {
    const restrictionText = buildToolGroupRestrictionText(toolGroups);
    if (!restrictionText) {
      return message;
    }
    return `${restrictionText}\n\nUser request:\n${message}`;
  }

  async function hydrateHistory(): Promise<void> {
    loadingHistory.value = true;
    error.value = null;

    try {
      const response = await requestWithFallback(gateway, 'chat.history', {
        sessionKey: SESSION_KEY,
      });

      const payload: any = response || {};
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.messages)
          ? payload.messages
          : Array.isArray(payload.items)
            ? payload.items
            : [];

      const normalized = list
        .map((item) => normalizeMessage(item))
        .filter((item): item is ChatMessage => item !== null);

      messages.value = normalized;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loadingHistory.value = false;
    }
  }

  async function send(): Promise<void> {
    const messageText = input.value.trim();
    if (!messageText || sending.value) {
      return;
    }

    sending.value = true;
    error.value = null;

    const optimisticMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      createdAt: new Date().toISOString(),
    };

    messages.value = [...messages.value, optimisticMessage];
    input.value = '';

    try {
      const toolGroups = await getToolGroupState();
      const finalMessage = applyToolGroupsToPrompt(messageText, toolGroups);

      const response: any = await gateway.request('chat.send', {
        sessionKey: SESSION_KEY,
        message: finalMessage,
        idempotencyKey: crypto.randomUUID(),
      });

      if (response && typeof response.runId === 'string') {
        activeRunId.value = response.runId;
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      input.value = messageText;
      messages.value = messages.value.filter((item) => item.id !== optimisticMessage.id);
    } finally {
      sending.value = false;
    }
  }

  async function abort(): Promise<void> {
    if (!activeRunId.value) {
      return;
    }

    try {
      await requestWithFallback(gateway, 'chat.abort', {
        sessionKey: SESSION_KEY,
        runId: activeRunId.value,
      });
      activeRunId.value = null;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function newChat(): Promise<void> {
    messages.value = [];
    activeRunId.value = null;
    await hydrateHistory();
  }

  function handleChatEvent(event: GatewayEvent): void {
    if (event.event === 'chat') {
      const payload: any = event.payload;

      if (Array.isArray(payload?.messages)) {
        payload.messages.forEach((raw: unknown) => {
          const normalized = normalizeMessage(raw);
          if (!normalized) return;
          messages.value = upsertMessage(messages.value, normalized);
        });
        return;
      }

      const normalized = normalizeMessage(payload);
      if (normalized) {
        messages.value = upsertMessage(messages.value, normalized);
      }

      if (typeof payload?.runId === 'string') {
        activeRunId.value = payload.runId;
      }
      if (payload?.status === 'completed' || payload?.status === 'ok') {
        activeRunId.value = null;
      }
      return;
    }

    if (event.event === 'agent') {
      const payload: any = event.payload;
      const text =
        typeof payload?.text === 'string'
          ? payload.text
          : typeof payload?.summary === 'string'
            ? payload.summary
            : JSON.stringify(payload || {});

      messages.value = [
        ...messages.value,
        {
          id: crypto.randomUUID(),
          role: 'tool',
          content: text,
          createdAt: new Date().toISOString(),
          runId: typeof payload?.runId === 'string' ? payload.runId : undefined,
        },
      ];

      if (payload?.status === 'completed' || payload?.status === 'ok') {
        activeRunId.value = null;
      }
    }
  }

  const unsubscribe = gateway.onEvent(handleChatEvent);
  onUnmounted(() => {
    unsubscribe();
  });

  return {
    messages,
    input,
    sending,
    loadingHistory,
    error,
    activeRunId,
    canSend,
    hydrateHistory,
    send,
    abort,
    newChat,
    applyToolGroupsToPrompt,
  };
}
