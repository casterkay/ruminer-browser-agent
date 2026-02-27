import {
  GatewayConnectParams,
  GatewayEventFrame,
  GatewayHelloOkPayload,
  GatewayRequestFrame,
  GatewayResponseFrame,
  isGatewayEventFrame,
  isGatewayRequestFrame,
  isGatewayResponseFrame,
} from './protocol';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export interface GatewayConnectionConfig {
  wsUrl: string;
  authToken: string;
  connectParams: GatewayConnectParams;
  handshakeTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export interface GatewayConnectionStatus {
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  connected: boolean;
  wsUrl: string | null;
  reconnectAttempts: number;
  lastConnectedAt: string | null;
  lastError: string | null;
}

export interface InboundRequestResult {
  ok: boolean;
  payload?: unknown;
}

type StatusListener = (status: GatewayConnectionStatus) => void;
type EventListener = (frame: GatewayEventFrame) => void;
type InboundRequestListener = (frame: GatewayRequestFrame) => Promise<InboundRequestResult>;

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export class OpenClawGatewayConnection {
  private ws: WebSocket | null = null;
  private config: GatewayConnectionConfig | null = null;
  private status: GatewayConnectionStatus = {
    state: 'disconnected',
    connected: false,
    wsUrl: null,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastError: null,
  };
  private pendingRequests = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private explicitlyClosed = false;

  private readonly statusListeners = new Set<StatusListener>();
  private readonly eventListeners = new Set<EventListener>();
  private inboundRequestListener: InboundRequestListener | null = null;

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  setInboundRequestListener(listener: InboundRequestListener | null): void {
    this.inboundRequestListener = listener;
  }

  getStatus(): GatewayConnectionStatus {
    return { ...this.status };
  }

  async connect(config: GatewayConnectionConfig): Promise<GatewayHelloOkPayload> {
    this.config = config;
    this.explicitlyClosed = false;
    this.clearReconnectTimer();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const hello = await this.sendRequest<GatewayHelloOkPayload>('connect', config.connectParams);
      this.updateStatus({
        state: 'connected',
        connected: true,
        wsUrl: config.wsUrl,
        lastConnectedAt: new Date().toISOString(),
        lastError: null,
      });
      return hello;
    }

    this.updateStatus({
      state: 'connecting',
      connected: false,
      wsUrl: config.wsUrl,
      lastError: null,
    });

    await this.openSocket(config.wsUrl, config.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS);

    const hello = await this.sendRequest<GatewayHelloOkPayload>('connect', config.connectParams);

    this.updateStatus({
      state: 'connected',
      connected: true,
      wsUrl: config.wsUrl,
      reconnectAttempts: 0,
      lastConnectedAt: new Date().toISOString(),
      lastError: null,
    });

    return hello;
  }

  async disconnect(): Promise<void> {
    this.explicitlyClosed = true;
    this.clearReconnectTimer();
    this.rejectPendingRequests(new Error('Gateway connection closed'));

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.close();
    }

    this.updateStatus({
      state: 'disconnected',
      connected: false,
    });
  }

  async sendRequest<TPayload = unknown>(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<TPayload> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway WebSocket is not connected');
    }

    const id = crypto.randomUUID();
    const requestTimeout = timeoutMs ?? this.config?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    const payload = {
      type: 'req' as const,
      id,
      method,
      params,
    };

    const responsePromise = new Promise<TPayload>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Gateway request timeout: ${method}`));
      }, requestTimeout);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as TPayload),
        reject,
        timeoutId,
      });
    });

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (error) {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(id);
      }
      throw error;
    }

    return responsePromise;
  }

  private async openSocket(wsUrl: string, timeoutMs: number): Promise<void> {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors.
      }
      this.ws = null;
    }

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      const timeoutId = setTimeout(() => {
        try {
          ws.close();
        } catch {
          // Ignore close errors.
        }
        reject(new Error(`Gateway connect timeout: ${wsUrl}`));
      }, timeoutMs);

      ws.onopen = () => {
        clearTimeout(timeoutId);
        resolve();
      };

      ws.onmessage = (event) => {
        void this.handleMessage(event.data);
      };

      ws.onerror = () => {
        this.updateStatus({ state: 'error', connected: false });
      };

      ws.onclose = () => {
        this.onSocketClosed();
      };
    });
  }

  private async handleMessage(raw: unknown): Promise<void> {
    if (typeof raw !== 'string') {
      return;
    }

    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch (error) {
      this.updateStatus({ state: 'error', lastError: `Invalid JSON frame: ${String(error)}` });
      return;
    }

    if (isGatewayResponseFrame(frame)) {
      this.handleResponse(frame);
      return;
    }

    if (isGatewayEventFrame(frame)) {
      this.eventListeners.forEach((listener) => listener(frame));
      return;
    }

    if (isGatewayRequestFrame(frame)) {
      await this.handleInboundRequest(frame);
      return;
    }
  }

  private handleResponse(frame: GatewayResponseFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingRequests.delete(frame.id);

    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      const message =
        typeof frame.payload === 'string'
          ? frame.payload
          : `Gateway request failed for id=${frame.id}`;
      pending.reject(new Error(message));
    }
  }

  private async handleInboundRequest(frame: GatewayRequestFrame): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      if (!this.inboundRequestListener) {
        this.ws.send(
          JSON.stringify({
            type: 'res',
            id: frame.id,
            ok: false,
            payload: `No handler registered for inbound method: ${frame.method}`,
          }),
        );
        return;
      }

      const result = await this.inboundRequestListener(frame);
      this.ws.send(
        JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: result.ok,
          payload: result.payload,
        }),
      );
    } catch (error) {
      this.ws.send(
        JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: false,
          payload: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private onSocketClosed(): void {
    this.ws = null;
    this.rejectPendingRequests(new Error('Gateway connection closed'));

    this.updateStatus({
      state: 'disconnected',
      connected: false,
    });

    if (!this.explicitlyClosed && this.config) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.config || this.reconnectTimer !== null) {
      return;
    }

    const attempt = this.status.reconnectAttempts + 1;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);

    this.updateStatus({ reconnectAttempts: attempt });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.config) {
        return;
      }
      void this.connect(this.config).catch((error) => {
        this.updateStatus({
          state: 'error',
          connected: false,
          lastError: error instanceof Error ? error.message : String(error),
        });
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectPendingRequests(error: Error): void {
    this.pendingRequests.forEach((pending, id) => {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
      this.pendingRequests.delete(id);
    });
  }

  private updateStatus(patch: Partial<GatewayConnectionStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
    };

    this.statusListeners.forEach((listener) => listener(this.getStatus()));
  }
}
