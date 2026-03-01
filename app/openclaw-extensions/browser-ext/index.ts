import { TOOL_SCHEMAS } from '../../../packages/shared/src/tools';

type BrowserExtRequestPayload = {
  name: string;
  args?: unknown;
  nodeId?: string;
  timeoutMs?: number;
};

type OpenClawPluginApi = {
  registerGatewayMethod: (
    id: string,
    handler: (args: {
      respond: (ok: boolean, payload: unknown) => void;
      payload?: unknown;
    }) => void,
  ) => void;
  registerTool?: (
    def: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (
        id: string,
        params: unknown,
      ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
    },
    opts?: { optional?: boolean },
  ) => void;
  callGatewayMethod?: (method: string, payload?: unknown) => Promise<unknown>;
  logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
  };
};

function randomIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

function normalizeNodeList(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object',
    );
  }
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.nodes)) {
    return value.nodes.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object',
    );
  }
  if (value.result && typeof value.result === 'object') {
    if (Array.isArray(value.result)) {
      return value.result.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object',
      );
    }
    const nested = value.result as Record<string, unknown>;
    if (Array.isArray(nested.nodes)) {
      return nested.nodes.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object',
      );
    }
  }
  return [];
}

function hasBrowserCapability(node: Record<string, unknown>): boolean {
  const caps = Array.isArray(node.caps) ? node.caps : [];
  return caps.some((cap) => cap === 'browser');
}

function pickNodeId(nodes: Array<Record<string, unknown>>): string | null {
  const preferred = nodes.find(hasBrowserCapability) || nodes[0];
  if (!preferred) return null;
  if (typeof preferred.nodeId === 'string' && preferred.nodeId) return preferred.nodeId;
  if (typeof preferred.id === 'string' && preferred.id) return preferred.id;
  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function splitRequestPayload(payload: unknown): {
  params: Record<string, unknown>;
  nodeId: string | null;
  timeoutMs: number | null;
} {
  if (!isObjectRecord(payload)) {
    throw new Error('browser-ext request payload must be an object');
  }

  const raw = { ...payload };
  const nodeId = typeof raw.nodeId === 'string' && raw.nodeId ? raw.nodeId : null;
  const timeoutMs = typeof raw.timeoutMs === 'number' ? raw.timeoutMs : null;
  delete raw.nodeId;
  delete raw.timeoutMs;

  if (typeof raw.name !== 'string' || !raw.name) {
    throw new Error('Missing required field: name');
  }

  return {
    params: raw,
    nodeId,
    timeoutMs,
  };
}

async function invokeBrowserExt(
  api: OpenClawPluginApi,
  payload: BrowserExtRequestPayload,
): Promise<unknown> {
  if (typeof api.callGatewayMethod !== 'function') {
    throw new Error('Gateway method invocation is unavailable in this plugin runtime');
  }

  const nodeIdFromPayload =
    typeof payload.nodeId === 'string' && payload.nodeId ? payload.nodeId : null;
  let nodeId = nodeIdFromPayload;
  if (!nodeId) {
    const listResult = await api.callGatewayMethod('node.list');
    nodeId = pickNodeId(normalizeNodeList(listResult));
  }

  if (!nodeId) {
    throw new Error('No available browser node found (node.list returned empty)');
  }

  const invokeResult = await api.callGatewayMethod('node.invoke', {
    nodeId,
    command: 'browser-ext.request',
    params: payload,
    timeoutMs: typeof payload.timeoutMs === 'number' ? payload.timeoutMs : 45_000,
    idempotencyKey: randomIdempotencyKey(),
  });

  const envelope = (invokeResult || {}) as Record<string, unknown>;
  const payloadResult = envelope.payload as
    | { ok?: unknown; result?: unknown; error?: unknown }
    | undefined;

  if (!payloadResult || payloadResult.ok !== true) {
    const error = payloadResult?.error || envelope.error || invokeResult;
    throw new Error(
      typeof error === 'string' ? error : JSON.stringify(error || 'node.invoke failed'),
    );
  }

  return payloadResult.result;
}

function serializeToolResultText(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result ?? null);
}

async function handleBrowserExtRequest(api: OpenClawPluginApi, payload: unknown): Promise<unknown> {
  const { params, nodeId, timeoutMs } = splitRequestPayload(payload);
  return invokeBrowserExt(api, {
    ...(params as unknown as BrowserExtRequestPayload),
    nodeId: nodeId ?? undefined,
    timeoutMs: timeoutMs ?? undefined,
  });
}

export default function register(api: OpenClawPluginApi) {
  api.registerGatewayMethod('browser-ext.request', ({ payload, respond }) => {
    void handleBrowserExtRequest(api, payload)
      .then((result) => respond(true, { result }))
      .catch((error) => {
        api.logger.error('browser-ext.request failed', { error: String(error) });
        respond(false, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  if (typeof api.registerTool === 'function') {
    for (const tool of TOOL_SCHEMAS) {
      try {
        api.registerTool(
          {
            name: tool.name,
            description: tool.description || `Browser extension tool: ${tool.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] },
            execute: async (_id, params) => {
              const result = await invokeBrowserExt(api, {
                name: tool.name,
                args: isObjectRecord(params) ? params : {},
              });
              return {
                content: [
                  {
                    type: 'text',
                    text: serializeToolResultText(result),
                  },
                ],
              };
            },
          },
          { optional: false },
        );
      } catch (error) {
        api.logger.warn('failed to register tool via browser-ext plugin', {
          toolName: tool.name,
          error: String(error),
        });
      }
    }
  }

  api.logger.info('browser-ext plugin ready (direct node.invoke + shared TOOL_SCHEMAS mode)', {
    registeredCount: TOOL_SCHEMAS.length,
  });
}
