import { TOOL_SCHEMAS } from '../../../packages/shared/src/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

type McpClientPluginConfig = {
  /**
   * MCP endpoint for the Ruminer native-host server.
   * Example: http://127.0.0.1:12306/mcp
   */
  mcpUrl?: string;
  /**
   * Transport preference:
   * - "auto": try Streamable HTTP, fallback to SSE (deprecated)
   * - "streamable-http": only try Streamable HTTP
   * - "sse": only try SSE (deprecated)
   */
  transport?: 'auto' | 'streamable-http' | 'sse';
  /**
   * Optional MCP client name shown to the server.
   */
  clientName?: string;
};

type OpenClawPluginApi = {
  registerGatewayMethod: (
    id: string,
    handler: (args: {
      respond: (ok: boolean, payload: unknown) => void;
      payload?: unknown;
    }) => void,
  ) => void;
  registerService?: (svc: {
    id: string;
    start: () => Promise<void> | void;
    stop: () => Promise<void> | void;
  }) => void;
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
  logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
  };
  config: unknown;
};

const DEFAULT_MCP_URL = 'http://127.0.0.1:12306/mcp';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConfig(raw: unknown): McpClientPluginConfig {
  if (!isObjectRecord(raw)) return {};
  const transport = typeof raw.transport === 'string' ? raw.transport : undefined;
  return {
    mcpUrl: typeof raw.mcpUrl === 'string' ? raw.mcpUrl : undefined,
    transport:
      transport === 'auto' || transport === 'streamable-http' || transport === 'sse'
        ? transport
        : undefined,
    clientName: typeof raw.clientName === 'string' ? raw.clientName : undefined,
  };
}

function resolveMcpUrl(config: McpClientPluginConfig): string {
  const trimmed = (config.mcpUrl || '').trim();
  return trimmed || DEFAULT_MCP_URL;
}

let client: Client | null = null;
let transport: { close: () => Promise<void>; terminateSession?: () => Promise<void> } | null = null;
let connectPromise: Promise<Client> | null = null;

function createClient(api: OpenClawPluginApi, config: McpClientPluginConfig): Client {
  const name = (config.clientName || 'ruminer-mcp-client').trim() || 'ruminer-mcp-client';
  const c = new Client({ name, version: '1.0.0' });
  c.onerror = (error) => {
    api.logger.error('mcp-client MCP error', { error: String(error) });
  };
  return c;
}

async function connectStreamableHttp(
  api: OpenClawPluginApi,
  config: McpClientPluginConfig,
  baseUrl: URL,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const c = createClient(api, config);
  const t = new StreamableHTTPClientTransport(baseUrl);
  await c.connect(t);
  return { client: c, transport: t };
}

async function connectSse(
  api: OpenClawPluginApi,
  config: McpClientPluginConfig,
  baseUrl: URL,
): Promise<{ client: Client; transport: SSEClientTransport }> {
  const c = createClient(api, config);
  const t = new SSEClientTransport(baseUrl);
  await c.connect(t);
  return { client: c, transport: t };
}

async function connectMcp(api: OpenClawPluginApi, config: McpClientPluginConfig): Promise<Client> {
  const url = resolveMcpUrl(config);
  const baseUrl = new URL(url);
  const pref = (config.transport || 'auto').toLowerCase();

  if (pref === 'streamable-http') {
    const connected = await connectStreamableHttp(api, config, baseUrl);
    client = connected.client;
    transport = connected.transport;
    return connected.client;
  }

  if (pref === 'sse') {
    const connected = await connectSse(api, config, baseUrl);
    client = connected.client;
    transport = connected.transport;
    return connected.client;
  }

  // auto: Streamable HTTP first, then fallback to deprecated SSE transport.
  try {
    const connected = await connectStreamableHttp(api, config, baseUrl);
    client = connected.client;
    transport = connected.transport;
    return connected.client;
  } catch (error) {
    api.logger.warn('mcp-client Streamable HTTP connect failed; falling back to SSE', {
      error: String(error),
      mcpUrl: url,
    });
    const connected = await connectSse(api, config, baseUrl);
    client = connected.client;
    transport = connected.transport;
    return connected.client;
  }
}

async function ensureClient(
  api: OpenClawPluginApi,
  config: McpClientPluginConfig,
): Promise<Client> {
  if (client) return client;
  if (connectPromise) return connectPromise;

  connectPromise = connectMcp(api, config)
    .then((connected) => {
      api.logger.info('mcp-client connected', { mcpUrl: resolveMcpUrl(config) });
      return connected;
    })
    .catch((error) => {
      client = null;
      transport = null;
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
}

async function disconnectMcp(api: OpenClawPluginApi): Promise<void> {
  const t = transport;
  client = null;
  transport = null;
  connectPromise = null;

  if (!t) return;
  try {
    await t.close();
    api.logger.info('mcp-client disconnected');
  } catch (error) {
    api.logger.warn('mcp-client disconnect failed', { error: String(error) });
  }
}

function serializeToolResultText(result: unknown): string {
  if (typeof result === 'string') return result;

  if (isObjectRecord(result)) {
    const structured = (result as any).structuredContent;
    if (structured !== undefined) {
      return JSON.stringify(structured ?? null);
    }

    const content = (result as any).content;
    if (Array.isArray(content)) {
      const texts = content
        .filter((item) => item && typeof item === 'object' && (item as any).type === 'text')
        .map((item) => String((item as any).text ?? ''))
        .filter(Boolean);
      if (texts.length > 0) return texts.join('\n');
    }
  }

  return JSON.stringify(result ?? null);
}

type McpCallPayload = {
  name: string;
  args?: unknown;
  timeoutMs?: number;
};

async function callToolViaMcp(
  api: OpenClawPluginApi,
  config: McpClientPluginConfig,
  payload: McpCallPayload,
): Promise<unknown> {
  if (!payload?.name) {
    throw new Error('Missing required field: name');
  }

  const c = await ensureClient(api, config);
  const args = isObjectRecord(payload.args) ? payload.args : {};
  const options =
    typeof payload.timeoutMs === 'number' &&
    Number.isFinite(payload.timeoutMs) &&
    payload.timeoutMs > 0
      ? { timeoutMs: Math.floor(payload.timeoutMs) }
      : undefined;

  return c.callTool({ name: payload.name, arguments: args }, undefined, options);
}

export default function register(api: OpenClawPluginApi) {
  const config = normalizeConfig(api.config);

  api.registerGatewayMethod('mcp-client.status', ({ respond }) => {
    respond(true, {
      connected: client !== null,
      mcpUrl: resolveMcpUrl(config),
      transport: config.transport || 'auto',
    });
  });

  api.registerGatewayMethod('mcp-client.disconnect', ({ respond }) => {
    disconnectMcp(api)
      .then(() => respond(true, { disconnected: true }))
      .catch((error) => respond(false, { error: String(error) }));
  });

  api.registerGatewayMethod('mcp-client.request', ({ payload, respond }) => {
    const body = (payload || {}) as McpCallPayload;
    callToolViaMcp(api, config, body)
      .then((result) => respond(true, { result }))
      .catch((error) => {
        api.logger.error('mcp-client.request failed', { error: String(error), tool: body?.name });
        respond(false, { error: error instanceof Error ? error.message : String(error) });
      });
  });

  if (typeof api.registerService === 'function') {
    api.registerService({
      id: 'mcp-client-connection',
      start: async () => {
        return;
      },
      stop: async () => {
        await disconnectMcp(api);
      },
    });
  }

  if (typeof api.registerTool === 'function') {
    for (const tool of TOOL_SCHEMAS) {
      try {
        api.registerTool(
          {
            name: tool.name,
            description: tool.description || `MCP tool: ${tool.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] },
            execute: async (_id, params) => {
              const result = await callToolViaMcp(api, config, {
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
        api.logger.warn('failed to register tool via mcp-client plugin', {
          toolName: tool.name,
          error: String(error),
        });
      }
    }
  }

  api.logger.info('mcp-client plugin ready (OpenClaw → MCP client → Ruminer MCP server)', {
    registeredCount: TOOL_SCHEMAS.length,
    mcpUrl: resolveMcpUrl(config),
    transport: config.transport || 'auto',
  });
}
