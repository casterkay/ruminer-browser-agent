/**
 * Gateway-backed compatibility wrapper for legacy AgentServer composable.
 * This keeps older imports working while routing transport through OpenClaw Gateway.
 */
import { computed, onUnmounted, ref } from 'vue';
import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import type { AgentEngineInfo, RealtimeEvent } from 'chrome-mcp-shared';

interface ServerStatus {
  isRunning: boolean;
  port?: number;
  lastUpdated: number;
}

export interface UseAgentServerOptions {
  getSessionId?: () => string;
  onMessage?: (event: RealtimeEvent) => void;
  onError?: (error: string) => void;
}

export function useAgentServer(options: UseAgentServerOptions = {}) {
  const serverPort = ref<number | null>(18789);
  const nativeConnected = ref(false);
  const serverStatus = ref<ServerStatus | null>(null);
  const connecting = ref(false);
  const engines = ref<AgentEngineInfo[]>([]);
  const eventSource = ref<EventSource | null>(null);

  let eventListenerBound = false;

  const isServerReady = computed(() => {
    return nativeConnected.value && !!serverStatus.value?.isRunning;
  });

  async function queryGatewayStatus(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_STATUS_QUERY,
      });
      const status = response?.status;
      nativeConnected.value = !!status?.connected;
      serverStatus.value = {
        isRunning: !!status?.connected,
        port: 18789,
        lastUpdated: Date.now(),
      };
      return nativeConnected.value;
    } catch (error) {
      nativeConnected.value = false;
      serverStatus.value = {
        isRunning: false,
        port: 18789,
        lastUpdated: Date.now(),
      };
      options.onError?.(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function ensureNativeServer(): Promise<boolean> {
    connecting.value = true;
    try {
      return await queryGatewayStatus();
    } finally {
      connecting.value = false;
    }
  }

  async function fetchEngines(): Promise<void> {
    engines.value = [];
  }

  function closeEventSource(): void {
    // EventSource is not used in Gateway mode.
    eventSource.value = null;
  }

  function openEventSource(): void {
    if (eventListenerBound) {
      return;
    }
    eventListenerBound = true;

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type !== BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_EVENT) {
        return false;
      }

      const event = message.event as { event?: string; payload?: unknown } | undefined;
      if (!event?.event) {
        return false;
      }

      // Legacy callback bridge: convert Gateway push into a lightweight RealtimeEvent.
      options.onMessage?.({
        type: event.event === 'chat' ? 'message' : 'connected',
        data: event.payload as any,
      } as RealtimeEvent);

      return false;
    });
  }

  function isEventSourceConnected(): boolean {
    return nativeConnected.value;
  }

  async function reconnect(): Promise<void> {
    await ensureNativeServer();
  }

  async function initialize(): Promise<void> {
    await ensureNativeServer();
    openEventSource();
  }

  onUnmounted(() => {
    closeEventSource();
  });

  return {
    serverPort,
    nativeConnected,
    serverStatus,
    connecting,
    engines,
    eventSource,
    isServerReady,
    ensureNativeServer,
    fetchEngines,
    openEventSource,
    closeEventSource,
    isEventSourceConnected,
    reconnect,
    initialize,
  };
}
