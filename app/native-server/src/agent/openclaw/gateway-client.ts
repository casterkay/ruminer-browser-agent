import { randomUUID } from 'node:crypto';
import {
  buildSignedConnectParams,
  extractConnectChallengeNonce,
  OPENCLAW_CLIENT_IDS,
  OPENCLAW_CLIENT_MODES,
  type GatewayClientInfo,
} from './device-auth';
import { getOrCreateOpenClawDeviceIdentity } from './device-identity';

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

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

function normalizeGatewayEventName(eventName: string): string {
  // OpenClaw upstream uses `agent` for streaming tool output; Ruminer standardizes this as `openclaw`.
  return eventName === 'agent' ? 'openclaw' : eventName;
}

export interface OpenClawGatewayClientOptions {
  wsUrl: string;
  authToken: string;
  clientInfo?: Partial<GatewayClientInfo>;
}

function isLocalhostGatewayUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

export class OpenClawGatewayClient {
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Set<(event: EventFrame) => void>();

  constructor(private readonly options: OpenClawGatewayClientOptions) {}

  get isConnected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  onEvent(listener: (event: EventFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Gateway client closed'));
      this.pending.delete(id);
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') {
      return;
    }

    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (
      typeof frame === 'object' &&
      frame !== null &&
      (frame as ResponseFrame).type === 'res' &&
      typeof (frame as ResponseFrame).id === 'string'
    ) {
      const response = frame as ResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(response.id);

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
      const evt = frame as EventFrame;
      this.listeners.forEach((listener) =>
        listener({
          ...evt,
          event: normalizeGatewayEventName(evt.event),
        }),
      );
      return;
    }
  }

  async connect(timeoutMs = 12_000, challengeTimeoutMs = 6_000): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (this.ws) {
      this.close();
    }

    const wsUrl = this.options.wsUrl.trim();
    if (!wsUrl) {
      throw new Error('Gateway WebSocket URL is empty');
    }

    const authToken = this.options.authToken.trim();
    if (!authToken && !isLocalhostGatewayUrl(wsUrl)) {
      throw new Error('Gateway auth token is empty');
    }

    let resolveChallenge: ((nonce: string | null) => void) | null = null;
    const challengePromise = new Promise<string | null>((resolve) => {
      resolveChallenge = resolve;
    });

    let challengeSettled = false;
    const settleChallenge = (nonce: string | null): void => {
      if (challengeSettled) return;
      challengeSettled = true;
      resolveChallenge?.(nonce);
    };

    const challengeTimer = setTimeout(() => settleChallenge(null), challengeTimeoutMs);

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        this.ws = socket;

        const timer = setTimeout(() => {
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(new Error('Gateway connect timeout'));
        }, timeoutMs);

        socket.onopen = () => {
          clearTimeout(timer);
          resolve();
        };

        socket.onmessage = (event) => {
          const nonce = extractConnectChallengeNonce((event as MessageEvent).data);
          if (nonce !== undefined) {
            settleChallenge(nonce || null);
          }
          this.handleMessage((event as MessageEvent).data);
        };

        socket.onerror = () => {
          // let onclose handle the rejection if needed
        };

        socket.onclose = () => {
          this.close();
          settleChallenge(null);
          reject(new Error('Gateway connection closed'));
        };
      });

      const challengeNonce = await challengePromise;
      const identity = await getOrCreateOpenClawDeviceIdentity();

      const connectParams = buildSignedConnectParams({
        identity,
        role: 'operator',
        authToken,
        client: {
          id: OPENCLAW_CLIENT_IDS.NODE_HOST,
          version: this.options.clientInfo?.version || '0.1.0',
          platform: this.options.clientInfo?.platform || process.platform,
          mode: OPENCLAW_CLIENT_MODES.NODE,
        },
        scopes: ['operator.read', 'operator.write'],
        caps: [],
        commands: [],
        permissions: {},
        locale: 'en-US',
        userAgent: 'ruminer-node-host',
        nonce: challengeNonce,
      });

      await this.request('connect', connectParams);
    } finally {
      clearTimeout(challengeTimer);
    }
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = 12_000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect(timeoutMs);
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Gateway is not connected');
      }
    }

    const id = randomUUID();
    const frame: RequestFrame = { type: 'req', id, method, params };

    const response = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway request timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });

    try {
      this.ws.send(JSON.stringify(frame));
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
      }
      throw error;
    }

    return response;
  }
}
