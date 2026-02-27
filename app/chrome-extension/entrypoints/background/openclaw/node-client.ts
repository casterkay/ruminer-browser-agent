import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { STORAGE_KEYS } from '@/common/constants';
import {
  getGatewaySettings,
  getOrCreateGatewayDeviceId,
  setGatewayStatus,
} from '@/entrypoints/shared/utils/openclaw-settings';
import { OpenClawGatewayConnection } from './connection';
import { handleNodeInvokeRequest } from './node-invoke-handler';

const connection = new OpenClawGatewayConnection();
let started = false;
let listenersBound = false;

interface GatewayRpcMessage {
  type: string;
  method?: string;
  params?: unknown;
  timeoutMs?: number;
}

function broadcastGatewayEvent(event: { event: string; seq?: number; payload?: unknown }): void {
  void chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_EVENT,
    event,
  });
}

function broadcastGatewayStatus(status: {
  connected: boolean;
  lastConnectedAt: string | null;
  lastConnectionError: string | null;
  state: string;
}) {
  void chrome.runtime.sendMessage({
    type: BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_STATUS_CHANGED,
    status,
  });
}

async function connectFromSettings(): Promise<void> {
  const settings = await getGatewaySettings();
  if (!settings.gatewayWsUrl.trim() || !settings.gatewayAuthToken.trim()) {
    await setGatewayStatus({
      connected: false,
      lastConnectionError: 'OpenClaw Gateway settings are incomplete',
    });
    return;
  }

  const deviceId = settings.deviceId || (await getOrCreateGatewayDeviceId());

  await connection.connect({
    wsUrl: settings.gatewayWsUrl,
    authToken: settings.gatewayAuthToken,
    connectParams: {
      role: 'node',
      caps: ['browser'],
      auth: { token: settings.gatewayAuthToken },
      device: {
        id: deviceId,
        name: 'ruminer-browser-extension',
      },
    },
  });
}

function bindRuntimeListeners(): void {
  if (listenersBound) {
    return;
  }
  listenersBound = true;

  chrome.runtime.onMessage.addListener((message: GatewayRpcMessage, _sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_STATUS_QUERY) {
      sendResponse({ success: true, status: connection.getStatus() });
      return false;
    }

    if (message.type === BACKGROUND_MESSAGE_TYPES.OPENCLAW_GATEWAY_RPC) {
      const method = message.method;
      if (!method || typeof method !== 'string') {
        sendResponse({ success: false, error: 'Missing RPC method' });
        return false;
      }

      void connection
        .sendRequest(method, message.params, message.timeoutMs)
        .then((payload) => {
          sendResponse({ success: true, payload });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (!changes[STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS]) {
      return;
    }

    void connectFromSettings().catch((error) => {
      console.error('[OpenClaw] Failed reconnect after settings change:', error);
    });
  });
}

export async function startOpenClawNodeClient(): Promise<void> {
  if (!started) {
    started = true;

    connection.setInboundRequestListener(handleNodeInvokeRequest);

    connection.onEvent((event) => {
      broadcastGatewayEvent({
        event: event.event,
        seq: event.seq,
        payload: event.payload,
      });
    });

    connection.onStatus((status) => {
      const payload = {
        connected: status.connected,
        state: status.state,
        lastConnectedAt: status.lastConnectedAt,
        lastConnectionError: status.lastError,
      };

      void setGatewayStatus({
        connected: payload.connected,
        lastConnectedAt: payload.lastConnectedAt,
        lastConnectionError: payload.lastConnectionError,
      });

      broadcastGatewayStatus(payload);
    });

    bindRuntimeListeners();
  }

  try {
    await connectFromSettings();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setGatewayStatus({
      connected: false,
      lastConnectionError: message,
    });
    console.error('[OpenClaw] Failed to connect gateway node client:', error);
  }
}

export async function stopOpenClawNodeClient(): Promise<void> {
  await connection.disconnect();
}

export function getOpenClawConnectionStatus() {
  return connection.getStatus();
}
