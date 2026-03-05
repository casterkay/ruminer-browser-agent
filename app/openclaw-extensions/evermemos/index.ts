import path from 'node:path';

import { PersistentQueue } from './queue';
import {
  AddMemoryPayload,
  EverMemSingleMessage,
  GatewayHandlerOpts,
  OpenClawPluginServiceContext,
  PluginConfig,
  PluginHookMessageContext,
  PluginHookMessageReceivedEvent,
  PluginHookMessageSentEvent,
  SearchMemPayload,
} from './types';

type AgentToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
};

type OpenClawPluginApi = {
  // Named metadata injected by OpenClaw.
  id: string;
  name: string;
  source: string;
  // Full gateway config — NOT the plugin config.
  config: Record<string, unknown>;
  // Plugin-scoped config from plugins.entries.<id>.config — use this.
  pluginConfig?: Record<string, unknown>;
  logger: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  resolvePath: (input: string) => string;
  on(
    hookName: 'message_received',
    handler: (
      ev: PluginHookMessageReceivedEvent,
      ctx: PluginHookMessageContext,
    ) => void | Promise<void>,
    opts?: { priority?: number },
  ): void;
  on(
    hookName: 'message_sent',
    handler: (
      ev: PluginHookMessageSentEvent,
      ctx: PluginHookMessageContext,
    ) => void | Promise<void>,
    opts?: { priority?: number },
  ): void;
  registerService(svc: {
    id: string;
    start: (ctx: OpenClawPluginServiceContext) => Promise<void> | void;
    stop?: (ctx: OpenClawPluginServiceContext) => Promise<void> | void;
  }): void;
  registerTool?(
    def: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (toolCallId: string, params: unknown) => Promise<AgentToolResult>;
    },
    opts?: { optional?: boolean },
  ): void;
  registerGatewayMethod(
    method: string,
    handler: (opts: GatewayHandlerOpts) => void | Promise<void>,
  ): void;
};

const RETRY_INTERVAL_MS = 30_000;

function ensureBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function resolveMemoriesApiPrefix(cfg: PluginConfig): '/api/v0' | '/api/v1' {
  const base = ensureBaseUrl(cfg.evermemosBaseUrl || '');
  if (!base) return '/api/v1';
  if (base.includes('/api/v0')) return '/api/v0';
  if (base.includes('/api/v1')) return '/api/v1';
  // Cloud uses v0; local uses v1.
  if (base.includes('api.evermind.ai')) return '/api/v0';
  return '/api/v1';
}

function getMemoriesBaseUrl(cfg: PluginConfig): string {
  const base = ensureBaseUrl(cfg.evermemosBaseUrl || '');
  const prefix = resolveMemoriesApiPrefix(cfg);
  if (base.endsWith(prefix)) return base;
  return `${base}${prefix}`;
}

function resolveGroupId(cfg: PluginConfig, ctx: PluginHookMessageContext): string {
  const key = `${ctx.channelId || 'unknown'}:${ctx.conversationId || ctx.accountId || ''}`;
  const fromMap = cfg.groupMapping?.[key];
  if (typeof fromMap === 'string' && fromMap.trim()) {
    const trimmed = fromMap.trim();
    return trimmed.includes(':') ? trimmed : `openclaw:${trimmed}`;
  }

  const conv = ctx.conversationId || ctx.accountId || 'conv';
  return `openclaw:${conv}`;
}

function buildInboundPayload(
  cfg: PluginConfig,
  ev: PluginHookMessageReceivedEvent,
  ctx: PluginHookMessageContext,
): EverMemSingleMessage {
  const groupId = resolveGroupId(cfg, ctx);
  const ts = ev.timestamp ? new Date(ev.timestamp) : new Date();
  // No stable message ID on the event; synthesize from context + timestamp.
  const messageId = `${ctx.conversationId || ctx.channelId}-${ts.getTime()}-me`;
  return {
    message_id: `${groupId}:${messageId}`,
    create_time: ts.toISOString(),
    sender: 'me',
    sender_name: 'Me',
    content: ev.content,
    role: 'user',
    group_id: groupId,
    group_name: ctx.channelId,
  };
}

function buildOutboundPayload(
  cfg: PluginConfig,
  ev: PluginHookMessageSentEvent,
  ctx: PluginHookMessageContext,
): EverMemSingleMessage {
  const groupId = resolveGroupId(cfg, ctx);
  const ts = new Date();
  const messageId = `${ctx.conversationId || ctx.channelId}-${ts.getTime()}-bot`;
  return {
    message_id: `${groupId}:${messageId}`,
    create_time: ts.toISOString(),
    sender: 'bot',
    sender_name: 'OpenClaw',
    content: ev.content,
    role: 'assistant',
    group_id: groupId,
    group_name: ctx.channelId,
  };
}

async function postToEverMem(cfg: PluginConfig, body: EverMemSingleMessage): Promise<Response> {
  if (!cfg.evermemosBaseUrl || !cfg.apiKey) {
    throw new Error('EverMemOS plugin is not configured (missing evermemosBaseUrl/apiKey)');
  }
  const url = `${getMemoriesBaseUrl(cfg)}/memories`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.tenantId) headers['X-Tenant-Id'] = cfg.tenantId;
  if (cfg.spaceId) headers['X-Space-Id'] = cfg.spaceId;
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function searchEverMem(cfg: PluginConfig, body: SearchMemPayload): Promise<any> {
  if (!cfg.evermemosBaseUrl || !cfg.apiKey) {
    throw new Error('EverMemOS plugin is not configured (missing evermemosBaseUrl/apiKey)');
  }
  const params = new URLSearchParams();
  if (body.query) params.append('query', body.query);
  if (body.user_id) params.append('user_id', body.user_id);
  if (body.group_id) params.append('group_id', body.group_id);
  if (body.limit) params.append('limit', String(body.limit));
  if (body.retrieve_method) params.append('retrieve_method', body.retrieve_method);
  if (Array.isArray(body.memory_types)) {
    for (const t of body.memory_types) params.append('memory_types', String(t));
  }

  const url = `${getMemoriesBaseUrl(cfg)}/memories/search?${params.toString()}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.tenantId) headers['X-Tenant-Id'] = cfg.tenantId;
  if (cfg.spaceId) headers['X-Space-Id'] = cfg.spaceId;
  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(`EverMemOS search failed: ${res.status}`);
  }
  return res.json();
}

async function processQueue(
  queue: PersistentQueue,
  cfg: PluginConfig,
  logger: OpenClawPluginApi['logger'],
) {
  const files = await queue.list();
  for (const file of files) {
    const item = await queue.read(file);
    if (!item) {
      await queue.remove(file);
      continue;
    }
    try {
      const res = await postToEverMem(cfg, item as EverMemSingleMessage);
      if (res.ok) {
        await queue.remove(file);
      } else {
        logger.warn('EverMemOS POST failed', { status: res.status });
      }
    } catch (err) {
      logger.warn('EverMemOS POST error', { err: String(err) });
    }
  }
}

function startRetryLoop(
  queue: PersistentQueue,
  cfg: PluginConfig,
  api: OpenClawPluginApi,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void processQueue(queue, cfg, api.logger);
  }, RETRY_INTERVAL_MS);
}

export default function register(api: OpenClawPluginApi) {
  // api.config is the full gateway config — never use it as plugin config.
  const cfg = (api.pluginConfig ?? {}) as PluginConfig;
  let queue: PersistentQueue | undefined;
  let stateDir: string | undefined;
  const backlogWarn = cfg.backlogWarning ?? 100;

  const ensureQueue = (): PersistentQueue => {
    if (queue) return queue;
    const dir = stateDir
      ? path.join(stateDir, 'evermemos', 'pending')
      : api.resolvePath('./data/evermemos/pending');
    queue = new PersistentQueue(dir);
    return queue;
  };

  const isConfigured = !!(cfg.evermemosBaseUrl && cfg.apiKey);
  if (!isConfigured) {
    api.logger.warn(
      'evermemos plugin is installed but not configured; set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey',
    );
  }

  if (isConfigured) {
    api.on('message_received', async (ev, ctx) => {
      const payload = buildInboundPayload(cfg, ev, ctx);
      try {
        const res = await postToEverMem(cfg, payload);
        if (!res.ok) {
          await ensureQueue().enqueue(payload);
          api.logger.warn('EverMemOS POST non-200, queued', { status: res.status });
        }
      } catch (err) {
        await ensureQueue().enqueue(payload);
        api.logger.warn('EverMemOS POST error, queued', { err: String(err) });
      }
    });

    api.on('message_sent', async (ev, ctx) => {
      if (!ev.success) return; // skip failed sends
      const payload = buildOutboundPayload(cfg, ev, ctx);
      try {
        const res = await postToEverMem(cfg, payload);
        if (!res.ok) {
          await ensureQueue().enqueue(payload);
          api.logger.warn('EverMemOS POST non-200 (outbound), queued', { status: res.status });
        }
      } catch (err) {
        await ensureQueue().enqueue(payload);
        api.logger.warn('EverMemOS POST error (outbound), queued', { err: String(err) });
      }
    });
  }

  let retryInterval: ReturnType<typeof setInterval> | undefined;

  api.registerService({
    id: 'evermemos-retry',
    start: async (_ctx) => {
      if (!isConfigured) return;

      stateDir = _ctx.stateDir;

      const q = ensureQueue();

      const files = await q.list();
      if (files.length > backlogWarn) {
        api.logger.warn('EverMemOS queue backlog high', { pending: files.length });
      }

      void processQueue(q, cfg, api.logger);
      retryInterval = startRetryLoop(q, cfg, api);
    },
    stop: async (_ctx) => {
      if (retryInterval !== undefined) {
        clearInterval(retryInterval);
        retryInterval = undefined;
      }
    },
  });

  api.registerGatewayMethod('evermemos.status', ({ params: _params, respond }) => {
    if (!queue) {
      respond(true, {
        configured: isConfigured,
        pending: 0,
        evermemosBaseUrl: cfg.evermemosBaseUrl || null,
      });
      return;
    }
    queue
      .list()
      .then((files) =>
        respond(true, {
          configured: isConfigured,
          pending: files.length,
          evermemosBaseUrl: cfg.evermemosBaseUrl || null,
        }),
      )
      .catch((err) => respond(false, { error: String(err) }));
  });

  api.registerGatewayMethod('evermemos.addMemory', ({ params, respond }) => {
    if (!isConfigured) {
      respond(false, {
        error:
          'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
      });
      return;
    }
    const body = (params || {}) as AddMemoryPayload;
    if (!body.message_id || !body.create_time || !body.sender || !body.content) {
      respond(false, {
        error: 'Missing required fields: message_id, create_time, sender, content',
      });
      return;
    }
    postToEverMem(cfg, body)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error(`status ${res.status}`);
      })
      .then((data) => respond(true, { result: data }))
      .catch((err) => respond(false, { error: String(err) }));
  });

  api.registerGatewayMethod('evermemos.searchMemory', ({ params, respond }) => {
    if (!isConfigured) {
      respond(false, {
        error:
          'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
      });
      return;
    }
    const body = (params || {}) as SearchMemPayload;
    if (!body.query) {
      respond(false, { error: 'Missing required field: query' });
      return;
    }
    searchEverMem(cfg, body)
      .then((data) => respond(true, { result: data }))
      .catch((err) => respond(false, { error: String(err) }));
  });

  // Register agent tools (so EverMemOS appears in the tool list).
  if (typeof api.registerTool === 'function') {
    api.registerTool(
      {
        name: 'evermemos.status',
        description: 'Show EverMemOS plugin status and pending queue size.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        execute: async () => {
          const files = await ensureQueue().list();
          const payload = {
            configured: isConfigured,
            pending: files.length,
            evermemosBaseUrl: cfg.evermemosBaseUrl || null,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
            details: payload,
          };
        },
      },
      { optional: false },
    );

    api.registerTool(
      {
        name: 'evermemos.searchMemory',
        description: 'Search EverMemOS memories.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query.' },
            user_id: { type: 'string' },
            group_id: { type: 'string' },
            retrieve_method: {
              type: 'string',
              enum: ['keyword', 'vector', 'hybrid', 'rrf', 'agentic'],
            },
            memory_types: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number' },
          },
          required: ['query'],
          additionalProperties: false,
        },
        execute: async (_toolCallId, params) => {
          if (!isConfigured) {
            throw new Error(
              'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
            );
          }
          const body = (params || {}) as SearchMemPayload;
          if (!body.query) {
            throw new Error('Missing required field: query');
          }
          const data = await searchEverMem(cfg, body);
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            details: data,
          };
        },
      },
      { optional: false },
    );

    api.registerTool(
      {
        name: 'evermemos.addMemory',
        description: 'Add a memory (single message) to EverMemOS.',
        parameters: {
          type: 'object',
          properties: {
            message_id: { type: 'string' },
            create_time: { type: 'string', description: 'ISO timestamp.' },
            sender: { type: 'string' },
            content: { type: 'string' },
            group_id: { type: 'string' },
            group_name: { type: 'string' },
            sender_name: { type: 'string' },
            role: { type: 'string' },
            refer_list: { type: 'array', items: { type: 'string' } },
          },
          required: ['message_id', 'create_time', 'sender', 'content'],
          additionalProperties: false,
        },
        execute: async (_toolCallId, params) => {
          if (!isConfigured) {
            throw new Error(
              'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
            );
          }
          const body = (params || {}) as AddMemoryPayload;
          const missing: string[] = [];
          for (const key of ['message_id', 'create_time', 'sender', 'content'] as const) {
            if (!(body as any)[key]) missing.push(key);
          }
          if (missing.length > 0) {
            throw new Error(`Missing required field(s): ${missing.join(', ')}`);
          }
          const res = await postToEverMem(cfg, body as EverMemSingleMessage);
          if (!res.ok) {
            throw new Error(`EverMemOS POST failed: ${res.status}`);
          }
          const data = await res.json().catch(() => ({ ok: true }));
          return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            details: data,
          };
        },
      },
      { optional: false },
    );
  }

  // TODO: add agentic retrieval methods

  // Backlog warning is handled on service start (where stateDir is available).
}
