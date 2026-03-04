import { PersistentQueue } from './queue';
import {
  AddMemoryPayload,
  EverMemSingleMessage,
  HookContext,
  OpenClawMessageEvent,
  PluginConfig,
  SearchMemPayload,
} from './types';

type AgentToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
};

type OpenClawPluginApi = {
  on: (event: string, handler: (ev: OpenClawMessageEvent, ctx: HookContext) => void) => void;
  registerService: (svc: {
    id: string;
    start: () => Promise<void> | void;
    stop: () => Promise<void> | void;
  }) => void;
  registerTool?: (
    def: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (toolCallId: string, params: unknown) => Promise<AgentToolResult>;
    },
    opts?: { optional?: boolean },
  ) => void;
  registerGatewayMethod: (
    id: string,
    handler: (args: {
      respond: (ok: boolean, payload: unknown) => void;
      payload?: unknown;
    }) => void,
  ) => void;
  logger: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
  // OpenClaw passes the full config here.
  config: unknown;
  // OpenClaw passes plugin-scoped config (plugins.entries.<id>.config) here.
  pluginConfig?: unknown;
};

const RETRY_INTERVAL_MS = 30_000;

function resolveGroupId(cfg: PluginConfig, ctx: HookContext): string {
  const key = `${ctx.channelId || 'unknown'}:${ctx.conversationId || ctx.accountId || ''}`;
  const fromMap = cfg.groupMapping?.[key];
  if (fromMap) return fromMap;
  const prefix = cfg.ingestGroupIdPrefix || 'oc-';
  return `${prefix}${ctx.channelId || 'ch'}-${ctx.conversationId || ctx.accountId || 'conv'}`;
}

function buildPayload(
  cfg: PluginConfig,
  ev: OpenClawMessageEvent,
  ctx: HookContext,
): EverMemSingleMessage {
  const messageId = ev.id || `${ctx.conversationId || 'conv'}-${Date.now()}`;
  const ts = ev.timestamp ? new Date(ev.timestamp) : new Date();
  const role = ev.direction === 'outbound' ? 'assistant' : 'user';
  const sender = ev.senderId || cfg.defaultUserId || 'unknown';
  const referList = ev.replyToId ? [ev.replyToId] : undefined;
  return {
    message_id: messageId,
    create_time: ts.toISOString(),
    sender,
    sender_name: sender,
    content: ev.text || '',
    role,
    group_id: resolveGroupId(cfg, ctx),
    group_name: ctx.channelId,
    refer_list: referList,
  };
}

async function postToEverMem(cfg: PluginConfig, body: EverMemSingleMessage): Promise<Response> {
  if (!cfg.evermemosBaseUrl || !cfg.apiKey) {
    throw new Error('EverMemOS plugin is not configured (missing evermemosBaseUrl/apiKey)');
  }
  const url = `${cfg.evermemosBaseUrl.replace(/\/$/, '')}/api/v1/memories`;
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
  const url = `${cfg.evermemosBaseUrl.replace(/\/$/, '')}/api/v1/memories/search`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.tenantId) headers['X-Tenant-Id'] = cfg.tenantId;
  if (cfg.spaceId) headers['X-Space-Id'] = cfg.spaceId;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
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
): NodeJS.Timeout {
  return setInterval(() => {
    void processQueue(queue, cfg, api.logger);
  }, RETRY_INTERVAL_MS);
}

export default function register(api: OpenClawPluginApi) {
  const cfg = ((api.pluginConfig ?? api.config) || {}) as PluginConfig;
  const queueDir = './data/evermemos/pending';
  const queue = new PersistentQueue(queueDir);
  const backlogWarn = cfg.backlogWarning ?? 100;

  const isConfigured = !!(cfg.evermemosBaseUrl && cfg.apiKey);
  if (!isConfigured) {
    api.logger.warn(
      'evermemos plugin is installed but not configured; set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey',
    );
  }

  if (isConfigured) {
    api.on('message_received', async (ev, ctx) => {
      const payload = buildPayload(cfg, ev, ctx);
      try {
        const res = await postToEverMem(cfg, payload);
        if (!res.ok) {
          await queue.enqueue(payload);
          api.logger.warn('EverMemOS POST non-200, queued', { status: res.status });
        }
      } catch (err) {
        await queue.enqueue(payload);
        api.logger.warn('EverMemOS POST error, queued', { err: String(err) });
      }
    });
  }

  api.registerService({
    id: 'evermemos-retry',
    start: async () => {
      if (!isConfigured) return;
      void processQueue(queue, cfg, api.logger);
      startRetryLoop(queue, cfg, api);
    },
    stop: async () => {
      return;
    },
  });

  api.registerGatewayMethod('evermemos.status', ({ respond }) => {
    queue
      .list()
      .then((files) => {
        respond(true, {
          configured: isConfigured,
          pending: files.length,
          evermemosBaseUrl: cfg.evermemosBaseUrl || null,
        });
      })
      .catch((err) => respond(false, { error: String(err) }));
  });

  api.registerGatewayMethod('evermemos.addMemory', ({ payload, respond }) => {
    if (!isConfigured) {
      respond(false, {
        error:
          'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
      });
      return;
    }
    const body = (payload || {}) as AddMemoryPayload;
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

  api.registerGatewayMethod('evermemos.searchMemory', ({ payload, respond }) => {
    if (!isConfigured) {
      respond(false, {
        error:
          'EverMemOS plugin is not configured. Set plugins.entries.evermemos.config.evermemosBaseUrl and apiKey.',
      });
      return;
    }
    const body = (payload || {}) as SearchMemPayload;
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
          const files = await queue.list();
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

  void queue.list().then((files) => {
    if (files.length > backlogWarn) {
      api.logger.warn('EverMemOS queue backlog high', { pending: files.length });
    }
  });
}
