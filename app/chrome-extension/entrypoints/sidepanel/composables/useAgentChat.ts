/**
 * Composable for managing Agent Chat state and messages.
 * Handles message sending, receiving, and cancellation.
 */
import type {
  AgentActRequest,
  AgentAttachment,
  AgentCliPreference,
  AgentMessage,
  AgentStatusEvent,
  AgentUsageStats,
  RealtimeEvent,
} from 'chrome-mcp-shared';
import { computed, ref } from 'vue';

/**
 * Request lifecycle state.
 * - 'idle': No active request
 * - 'starting': Request accepted, waiting for engine initialization
 * - 'ready': Engine initialized, preparing to run
 * - 'running': Engine actively processing (may emit tool_use/tool_result)
 * - 'completed': Request finished successfully
 * - 'cancelled': Request was cancelled by user
 * - 'error': Request failed with error
 */
export type RequestState = 'idle' | AgentStatusEvent['status'];

export interface UseAgentChatOptions {
  getServerPort: () => number | null;
  getSessionId: () => string;
  ensureServer: () => Promise<boolean>;
  openEventSource: () => void;
}

export function useAgentChat(options: UseAgentChatOptions) {
  // State
  const messages = ref<AgentMessage[]>([]);
  const input = ref('');
  const sending = ref(false);
  /**
   * Message-level streaming state.
   * True when receiving delta updates for assistant/tool messages.
   * Note: This is separate from requestState - a request can be 'running'
   * even when isStreaming is false (e.g., during tool execution).
   */
  const isStreaming = ref(false);
  /**
   * Request lifecycle state driven by status events.
   * Use this (via isRequestActive) for UI elements like stop button,
   * loading indicators, and running badges.
   */
  const requestState = ref<RequestState>('idle');
  const errorMessage = ref<string | null>(null);
  const currentRequestId = ref<string | null>(null);
  const cancelling = ref(false);
  const attachments = ref<AgentAttachment[]>([]);
  const lastUsage = ref<AgentUsageStats | null>(null);

  // Computed
  const canSend = computed(() => {
    return input.value.trim().length > 0 && !sending.value;
  });

  /**
   * Whether there is an active request in progress.
   * Use this for UI elements like stop button, loading indicators, and running badges.
   */
  const isRequestActive = computed(() => {
    return (
      requestState.value === 'starting' ||
      requestState.value === 'ready' ||
      requestState.value === 'running'
    );
  });

  /**
   * Check if an incoming event belongs to a different active request.
   * Used to filter out stale events from previous requests.
   */
  function isDifferentActiveRequest(incomingRequestId?: string): boolean {
    const incoming = incomingRequestId?.trim();
    const current = currentRequestId.value?.trim();
    // No incoming ID or no current ID means we can't determine - don't filter
    if (!incoming || !current) return false;
    // Same request ID - don't filter
    if (incoming === current) return false;
    // Different request ID while we have an active request - filter it out
    return isRequestActive.value;
  }

  /**
   * Handle incoming realtime events.
   * Events are filtered by sessionId to prevent cross-session state pollution
   * when user switches sessions while SSE connection is still active.
   */
  function handleRealtimeEvent(event: RealtimeEvent): void {
    const currentSessionId = options.getSessionId();

    switch (event.type) {
      case 'message':
        // Guard: only handle messages for the current session
        if (event.data.sessionId !== currentSessionId) {
          return;
        }
        handleMessageEvent(event.data);
        break;
      case 'status':
        // Guard: only handle status for the current session
        if (event.data.sessionId !== currentSessionId) {
          return;
        }
        handleStatusEvent(event.data);
        break;
      case 'error':
        // Error events may not have sessionId, but if they do, filter
        if (event.data?.sessionId && event.data.sessionId !== currentSessionId) {
          return;
        }
        // Filter out errors from different active requests
        if (isDifferentActiveRequest(event.data?.requestId)) {
          return;
        }
        errorMessage.value = event.error;
        isStreaming.value = false;
        requestState.value = 'error';
        // Clear requestId if it matches the error event's requestId (or unconditionally if no requestId in error)
        if (!event.data?.requestId || event.data.requestId === currentRequestId.value) {
          currentRequestId.value = null;
        }
        break;
      case 'connected':
        console.log('[AgentChat] Connected to session:', event.data.sessionId);
        break;
      case 'heartbeat':
        // Heartbeat received, connection is alive
        break;
      case 'usage':
        // Guard: only accept usage for the current session
        if (event.data?.sessionId && event.data.sessionId !== currentSessionId) {
          return;
        }
        lastUsage.value = event.data;
        break;
    }
  }

  // Handle message events
  function handleMessageEvent(msg: AgentMessage): void {
    // For user messages from server, replace local optimistic message
    // Server echoes user message with real id/metadata, but we want to keep our display text
    // (which doesn't include injected context like web editor selection)
    if (msg.role === 'user' && msg.requestId) {
      const optimisticIndex = messages.value.findIndex(
        (m) => m.role === 'user' && m.requestId === msg.requestId && m.id.startsWith('temp-'),
      );
      if (optimisticIndex >= 0) {
        // Replace optimistic message: keep display content, update id and metadata
        const optimistic = messages.value[optimisticIndex];
        messages.value[optimisticIndex] = {
          ...msg,
          // Preserve the display content (user's raw input without injected context)
          content: optimistic.content,
          // Prefer server metadata, fallback to optimistic metadata (for chip rendering)
          metadata: msg.metadata ?? optimistic.metadata,
        };
        return;
      }
    }

    // Check if this message belongs to a different active request
    // Note: We still save the message to messages array (for auditing/replay),
    // but skip state updates if it's from a stale request
    const msgRequestId = msg.requestId?.trim() || undefined;
    const isStaleForState = isDifferentActiveRequest(msgRequestId);

    const existingIndex = messages.value.findIndex(
      (m) => m.id === msg.id && m.messageType === msg.messageType,
    );

    if (existingIndex >= 0) {
      // Update existing message (streaming update)
      messages.value[existingIndex] = msg;
    } else {
      // Add new message - always save, even if stale for state
      messages.value.push(msg);
    }

    // Skip state updates for messages from different active requests
    if (isStaleForState) {
      return;
    }

    // Track requestId from messages (handles cases where status events were missed)
    if (msgRequestId && msgRequestId !== currentRequestId.value) {
      currentRequestId.value = msgRequestId;
    }

    // Update message-level streaming state (delta updates)
    // Note: This does NOT affect requestState - tool_use with isStreaming=false
    // should not stop the overall request, only indicate this message is complete
    if (msg.role === 'assistant' || msg.role === 'tool') {
      isStreaming.value = msg.isStreaming === true && !msg.isFinal;

      // If we're receiving model/tool output but requestState hasn't progressed to 'running',
      // update it. This handles:
      // 1. Edge case where status events were missed due to SSE timing
      // 2. User enters AgentChat mid-request (e.g., from Quick Panel/toolbar trigger)
      // 3. SSE reconnection after temporary disconnect
      if (
        requestState.value === 'idle' ||
        requestState.value === 'starting' ||
        requestState.value === 'ready'
      ) {
        requestState.value = 'running';
      }
    }
  }

  // Handle status events
  function handleStatusEvent(status: AgentStatusEvent): void {
    const statusRequestId = status.requestId?.trim() || undefined;

    // Filter out status events from different active requests
    if (isDifferentActiveRequest(statusRequestId)) {
      return;
    }

    // Track requestId from status events
    if (statusRequestId && statusRequestId !== currentRequestId.value) {
      currentRequestId.value = statusRequestId;
    }

    // Update request lifecycle state (driven by status events only)
    requestState.value = status.status;

    switch (status.status) {
      case 'starting':
      case 'ready':
      case 'running':
        // Request is active - no additional state changes needed
        break;
      case 'completed':
      case 'error':
      case 'cancelled':
        // Request finished - clear message streaming and requestId
        isStreaming.value = false;
        // Reset cancelling state (in case we were waiting for SSE confirmation)
        cancelling.value = false;
        if (!statusRequestId || statusRequestId === currentRequestId.value) {
          currentRequestId.value = null;
        }
        break;
    }
  }

  // Send message
  async function send(
    chatOptions: {
      cliPreference?: string;
      model?: string;
      projectId?: string;
      dbSessionId?: string;
      projectRoot?: string;
      instruction?: string;
      attachments?: AgentAttachment[];
      clientMeta?: Record<string, unknown>;
      displayText?: string;
    } = {},
  ): Promise<void> {
    const rawInput = input.value.trim();
    const instruction = (chatOptions.instruction ?? rawInput).trim();
    if (!instruction) return;

    const sessionId = options.getSessionId();
    if (!sessionId) {
      errorMessage.value = 'No session selected';
      return;
    }

    sending.value = true;
    errorMessage.value = null;

    // Build request
    const requestId = crypto.randomUUID();
    currentRequestId.value = requestId;
    requestState.value = 'starting';

    // Add optimistic user message
    const now = new Date().toISOString();
    const optimisticUserMessage: AgentMessage = {
      id: `temp-${requestId}`,
      sessionId,
      role: 'user',
      content: (chatOptions.displayText ?? rawInput).trim(),
      messageType: 'chat',
      requestId,
      createdAt: now,
      metadata: chatOptions.clientMeta as unknown as Record<string, unknown> | undefined,
    };
    messages.value.push(optimisticUserMessage);

    // Clear input immediately
    input.value = '';

    try {
      // Ensure server is ready and open SSE before sending request
      const ok = await options.ensureServer();
      const serverPort = options.getServerPort();
      if (!ok || !serverPort) {
        throw new Error('Agent server is not available');
      }

      // Ensure SSE is open for this session
      options.openEventSource();

      const url = `http://127.0.0.1:${serverPort}/agent/chat/${encodeURIComponent(sessionId)}/act`;

      const outgoingAttachments =
        chatOptions.attachments ?? (attachments.value.length > 0 ? attachments.value : undefined);

      const body: AgentActRequest = {
        instruction,
        cliPreference: (chatOptions.cliPreference as AgentCliPreference | undefined) ?? undefined,
        model: chatOptions.model?.trim() || undefined,
        attachments: outgoingAttachments,
        projectId: chatOptions.projectId,
        dbSessionId: chatOptions.dbSessionId,
        projectRoot: chatOptions.projectRoot,
        requestId,
        clientMeta: chatOptions.clientMeta ?? undefined,
        displayText: chatOptions.displayText,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      }

      // Server responds with { requestId, sessionId, status: 'accepted' }
      // We rely on SSE for actual messages/status.
    } catch (error) {
      console.error('Failed to send message:', error);
      errorMessage.value = error instanceof Error ? error.message : 'Failed to send message';
      requestState.value = 'error';
      isStreaming.value = false;
      currentRequestId.value = null;
    } finally {
      sending.value = false;
    }
  }

  // Cancel current request
  async function cancelCurrentRequest(): Promise<void> {
    const serverPort = options.getServerPort();
    const requestId = currentRequestId.value;
    const sessionId = options.getSessionId();
    if (!serverPort || !requestId) return;

    cancelling.value = true;
    try {
      const url = `http://127.0.0.1:${serverPort}/agent/chat/${encodeURIComponent(sessionId)}/cancel/${encodeURIComponent(requestId)}`;
      await fetch(url, { method: 'DELETE' });
      // Wait for SSE status cancelled/completed; don't clear requestId here
    } catch (error) {
      console.error('Failed to cancel request:', error);
      errorMessage.value = error instanceof Error ? error.message : 'Failed to cancel request';
      cancelling.value = false;
    }
  }

  function setMessages(next: AgentMessage[]): void {
    messages.value = next;
  }

  function setAttachments(next: AgentAttachment[]): void {
    attachments.value = next;
  }

  return {
    // State
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

    // Computed
    canSend,
    isRequestActive,

    // Methods
    send,
    cancelCurrentRequest,
    setMessages,
    setAttachments,
    handleRealtimeEvent,
  };
}
