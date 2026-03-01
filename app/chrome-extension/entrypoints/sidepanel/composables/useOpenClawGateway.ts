import { onUnmounted, ref, type Ref } from 'vue';
import { getGatewaySettings } from '@/entrypoints/shared/utils/openclaw-settings';
import {
  buildSignedConnectParams,
  extractConnectChallengeNonce,
  OPENCLAW_CLIENT_IDS,
  OPENCLAW_CLIENT_MODES,
} from '@/entrypoints/shared/utils/openclaw-device-auth';

export interface GatewayEvent {
  event: string;
  seq?: number;
  payload?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
}

interface EventFrame {
  type: 'evt' | 'event';
  event: string;
  seq?: number;
  payload?: unknown;
}

export interface UseOpenClawGateway {
  connected: Ref<boolean>;
  connecting: Ref<boolean>;
  lastError: Ref<string | null>;
  lastConnectedAt: Ref<string | null>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  reconnect: () => Promise<boolean>;
  request: <T = unknown>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>;
  onEvent: (listener: (event: GatewayEvent) => void) => () => void;
}

const REQUEST_TIMEOUT_MS = 12_000;
const CONNECT_CHALLENGE_TIMEOUT_MS = 6_000;

export function useOpenClawGateway(): UseOpenClawGateway {
  const connected = ref(false);
  const connecting = ref(false);
  const lastError = ref<string | null>(null);
  const lastConnectedAt = ref<string | null>(null);

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shouldReconnect = true;

  const pendingRequests = new Map<string, PendingRequest>();
  const listeners = new Set<(event: GatewayEvent) => void>();

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function rejectAllPending(error: Error): void {
    pendingRequests.forEach((pending, id) => {
      clearTimeout(pending.timer);
      pending.reject(error);
      pendingRequests.delete(id);
    });
  }

  function emitEvent(frame: EventFrame): void {
    const event: GatewayEvent = {
      event: frame.event,
      seq: frame.seq,
      payload: frame.payload,
    };
    listeners.forEach((listener) => listener(event));
  }

  function handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }

    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch (error) {
      lastError.value = `Invalid Gateway message: ${String(error)}`;
      return;
    }

    if (
      typeof frame === 'object' &&
      frame !== null &&
      (frame as ResponseFrame).type === 'res' &&
      typeof (frame as ResponseFrame).id === 'string'
    ) {
      const response = frame as ResponseFrame;
      const pending = pendingRequests.get(response.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      pendingRequests.delete(response.id);

      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        const message =
          typeof response.payload === 'string'
            ? response.payload
            : `Gateway request failed for id=${response.id}`;
        pending.reject(new Error(message));
      }
      return;
    }

    if (
      typeof frame === 'object' &&
      frame !== null &&
      ((frame as EventFrame).type === 'evt' || (frame as EventFrame).type === 'event') &&
      typeof (frame as EventFrame).event === 'string'
    ) {
      emitEvent(frame as EventFrame);
    }
  }

  async function openSocket(): Promise<void> {
    const settings = await getGatewaySettings();
    if (!settings.gatewayWsUrl.trim()) {
      throw new Error('Gateway WebSocket URL is empty');
    }
    if (!settings.gatewayAuthToken.trim()) {
      throw new Error('Gateway auth token is empty');
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    const wsUrl = settings.gatewayWsUrl.trim();

    let resolveChallenge: ((nonce: string | null) => void) | null = null;
    const challengePromise = new Promise<string | null>((resolve) => {
      resolveChallenge = resolve;
    });
    let challengeSettled = false;
    const settleChallenge = (nonce: string | null): void => {
      if (challengeSettled) {
        return;
      }
      challengeSettled = true;
      resolveChallenge?.(nonce);
    };
    const challengeTimer = setTimeout(() => settleChallenge(null), CONNECT_CHALLENGE_TIMEOUT_MS);

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        ws = socket;

        const timer = setTimeout(() => {
          try {
            socket.close();
          } catch {
            // Ignore close errors.
          }
          reject(new Error('Gateway connect timeout'));
        }, REQUEST_TIMEOUT_MS);

        socket.onopen = () => {
          clearTimeout(timer);
          resolve();
        };

        socket.onmessage = (event) => {
          const nonce = extractConnectChallengeNonce(event.data);
          if (nonce !== undefined) {
            settleChallenge(nonce || null);
          }
          handleMessage(event.data);
        };

        socket.onerror = () => {
          lastError.value = 'Gateway socket error';
        };

        socket.onclose = () => {
          connected.value = false;
          rejectAllPending(new Error('Gateway connection closed'));
          ws = null;
          settleChallenge(null);

          if (shouldReconnect) {
            scheduleReconnect();
          }
        };
      });

      const challengeNonce = await challengePromise;

      const connectParams = await buildSignedConnectParams({
        role: 'operator',
        authToken: settings.gatewayAuthToken.trim(),
        client: {
          id: OPENCLAW_CLIENT_IDS.CONTROL_UI,
          version: chrome.runtime.getManifest().version || '0.1.0',
          platform: typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
          mode: OPENCLAW_CLIENT_MODES.WEBCHAT,
        },
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ruminer-control-ui',
        nonce: challengeNonce,
      });
      await request('connect', connectParams);
    } finally {
      clearTimeout(challengeTimer);
    }

    reconnectAttempts = 0;
    connected.value = true;
    lastConnectedAt.value = new Date().toISOString();
    lastError.value = null;
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || connecting.value || connected.value) {
      return;
    }

    reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 15_000);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  async function connect(): Promise<boolean> {
    if (connected.value) {
      return true;
    }
    if (connecting.value) {
      return false;
    }

    connecting.value = true;
    clearReconnectTimer();
    shouldReconnect = true;

    try {
      await openSocket();
      return true;
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error);
      connected.value = false;
      scheduleReconnect();
      return false;
    } finally {
      connecting.value = false;
    }
  }

  function disconnect(): void {
    shouldReconnect = false;
    clearReconnectTimer();
    connected.value = false;

    rejectAllPending(new Error('Gateway disconnected by user'));

    if (ws) {
      ws.close();
      ws = null;
    }
  }

  async function reconnect(): Promise<boolean> {
    disconnect();
    shouldReconnect = true;
    reconnectAttempts = 0;
    return connect();
  }

  async function request<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const ok = await connect();
      if (!ok || !ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error(lastError.value || 'Gateway is not connected');
      }
    }

    const id = crypto.randomUUID();
    const frame: RequestFrame = {
      type: 'req',
      id,
      method,
      params,
    };

    const response = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Gateway request timeout: ${method}`));
      }, timeoutMs);

      pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });

    try {
      ws.send(JSON.stringify(frame));
    } catch (error) {
      const pending = pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRequests.delete(id);
      }
      throw error;
    }

    return response;
  }

  function onEvent(listener: (event: GatewayEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  onUnmounted(() => {
    disconnect();
  });

  return {
    connected,
    connecting,
    lastError,
    lastConnectedAt,
    connect,
    disconnect,
    reconnect,
    request,
    onEvent,
  };
}
