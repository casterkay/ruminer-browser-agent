import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { definePluginEntry, type OpenClawPluginApi } from 'openclaw/plugin-sdk/plugin-entry';

type McpClientPluginConfig = {
  /**
   * MCP endpoint for an MCP server (Streamable HTTP preferred).
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

type McpTransport = { close: () => Promise<void>; terminateSession?: () => Promise<void> };
type TransportKind = 'none' | 'streamable-http' | 'sse';

class McpClientManager {
  private client: Client | null = null;
  private transport: McpTransport | null = null;
  private connectPromise: Promise<Client> | null = null;
  private transportKind: TransportKind = 'none';
  private registeredToolNames = new Set<string>();

  constructor(
    private api: OpenClawPluginApi,
    private config: McpClientPluginConfig,
  ) {}

  public isConnected(): boolean {
    return this.client !== null;
  }

  public getTransportKind(): TransportKind {
    return this.transportKind;
  }

  public markToolRegistered(name: string): void {
    if (name) this.registeredToolNames.add(name);
  }

  public getRegisteredToolCount(): number {
    return this.registeredToolNames.size;
  }

  private createClient(): Client {
    const name = (this.config.clientName || 'openclaw-mcp-client').trim() || 'openclaw-mcp-client';
    const c = new Client({ name, version: '1.0.0' });
    c.onerror = (error) => {
      this.api.logger.error('mcp-client MCP error', { error: String(error) });
    };
    return c;
  }

  private async connectStreamableHttp(baseUrl: URL): Promise<void> {
    const c = this.createClient();
    const t = new StreamableHTTPClientTransport(baseUrl);
    await c.connect(t);
    this.client = c;
    this.transport = t;
    this.transportKind = 'streamable-http';
  }

  private async connectSse(baseUrl: URL): Promise<void> {
    const c = this.createClient();
    const t = new SSEClientTransport(baseUrl);
    await c.connect(t);
    this.client = c;
    this.transport = t;
    this.transportKind = 'sse';
  }

  private async connectMcp(): Promise<Client> {
    const url = resolveMcpUrl(this.config);
    const baseUrl = new URL(url);
    const pref = (this.config.transport || 'auto').toLowerCase();

    // Clear any previous partial state before (re)connecting.
    this.client = null;
    this.transport = null;
    this.transportKind = 'none';

    if (pref === 'streamable-http') {
      await this.connectStreamableHttp(baseUrl);
      return this.client!;
    }

    if (pref === 'sse') {
      await this.connectSse(baseUrl);
      return this.client!;
    }

    // auto: Streamable HTTP first, then fallback to deprecated SSE transport.
    try {
      await this.connectStreamableHttp(baseUrl);
      return this.client!;
    } catch (error) {
      this.api.logger.warn('mcp-client Streamable HTTP connect failed; falling back to SSE', {
        error: String(error),
        mcpUrl: url,
      });
      await this.connectSse(baseUrl);
      return this.client!;
    }
  }

  public async ensureClient(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connectMcp()
      .then((connected) => {
        this.api.logger.info('mcp-client connected', { mcpUrl: resolveMcpUrl(this.config) });
        return connected;
      })
      .catch((error) => {
        this.client = null;
        this.transport = null;
        this.transportKind = 'none';
        this.connectPromise = null;
        throw error;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }

  public async disconnect(): Promise<void> {
    const t = this.transport;
    this.client = null;
    this.transport = null;
    this.transportKind = 'none';
    this.connectPromise = null;

    if (!t) return;
    try {
      await t.close();
      this.api.logger.info('mcp-client disconnected');
    } catch (error) {
      this.api.logger.warn('mcp-client disconnect failed', { error: String(error) });
    }
  }

  public async callTool(payload: McpCallPayload): Promise<unknown> {
    if (!payload?.name) {
      throw new Error('Missing required field: name');
    }

    const c = await this.ensureClient();
    const args = isObjectRecord(payload.args) ? payload.args : {};
    const options =
      typeof payload.timeoutMs === 'number' &&
      Number.isFinite(payload.timeoutMs) &&
      payload.timeoutMs > 0
        ? { timeout: Math.floor(payload.timeoutMs) }
        : undefined;

    return c.callTool({ name: payload.name, arguments: args }, undefined, options);
  }

  /**
   * Best-effort: list MCP tools and register any that we haven't already
   * registered from our static list. This is mainly to surface dynamic tools
   * (e.g. `flow.*`) and new server-side tools without shipping a plugin update.
   */
  public async refreshToolsFromMcp(): Promise<void> {
    if (typeof this.api.registerTool !== 'function') return;

    const c = await this.ensureClient();
    const toolsResult = await c.listTools();
    const tools = Array.isArray((toolsResult as any)?.tools) ? (toolsResult as any).tools : [];

    for (const tool of tools) {
      const name = typeof tool?.name === 'string' ? tool.name : '';
      if (!name || this.registeredToolNames.has(name)) continue;

      try {
        this.api.registerTool(
          {
            name,
            description:
              typeof tool?.description === 'string' && tool.description.trim()
                ? tool.description
                : `MCP tool: ${name}`,
            parameters: tool?.inputSchema || { type: 'object', properties: {}, required: [] },
            execute: async (_id, params) => {
              const result = await this.callTool({
                name,
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
        this.registeredToolNames.add(name);
      } catch (error) {
        this.api.logger.warn('failed to register dynamic MCP tool via mcp-client plugin', {
          toolName: name,
          error: String(error),
        });
      }
    }
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

export default definePluginEntry({
  id: 'openclaw-mcp-client',
  name: 'MCP Client Plugin',
  description: 'Routes OpenClaw tool calls to a configurable MCP server URL.',
  register(api: OpenClawPluginApi) {
    // api.config is the full gateway config — never use it as plugin config.
    const config = normalizeConfig(api.pluginConfig ?? {});
    const manager = new McpClientManager(api, config);

    api.registerGatewayMethod('mcp-client.status', ({ respond }) => {
      respond(true, {
        connected: manager.isConnected(),
        mcpUrl: resolveMcpUrl(config),
        transport: config.transport || 'auto',
      });
    });

    api.registerGatewayMethod('mcp-client.disconnect', ({ respond }) => {
      manager
        .disconnect()
        .then(() => respond(true, { disconnected: true }))
        .catch((error) => respond(false, { error: String(error) }));
    });

    api.registerGatewayMethod('mcp-client.request', ({ params, respond }) => {
      const body = (params || {}) as McpCallPayload;
      manager.refreshToolsFromMcp().catch(() => undefined);
      manager
        .callTool(body)
        .then((result) => respond(true, { result }))
        .catch((error) => {
          api.logger.error('mcp-client.request failed', { error: String(error), tool: body?.name });
          respond(false, { error: error instanceof Error ? error.message : String(error) });
        });
    });

    api.registerService({
      id: 'mcp-client-connection',
      start: async () => {
        try {
          await manager.refreshToolsFromMcp();
        } catch (error) {
          api.logger.warn('mcp-client tool refresh on startup failed', { error: String(error) });
        }
      },
      stop: async () => {
        await manager.disconnect();
      },
    });

    // Kick off a best-effort tool discovery immediately (do not block plugin registration).
    manager.refreshToolsFromMcp().catch((error) => {
      api.logger.warn('mcp-client initial tool discovery failed', { error: String(error) });
    });

    api.logger.info('mcp-client plugin ready (OpenClaw → MCP client → MCP server)', {
      registeredCount: manager.getRegisteredToolCount(),
      mcpUrl: resolveMcpUrl(config),
      transport: config.transport || 'auto',
    });
  },
});
