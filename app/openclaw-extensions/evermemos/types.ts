export type PluginConfig = {
  evermemosBaseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  spaceId?: string;
  groupMapping?: Record<string, string>;
  backlogWarning?: number;
};

// ---------------------------------------------------------------------------
// OpenClaw plugin hook types (structural copies from openclaw/plugin-sdk)
// ---------------------------------------------------------------------------

/** Context passed to all message hooks. channelId is always present. */
export type PluginHookMessageContext = {
  channelId: string;
  accountId?: string;
  conversationId?: string;
};

/** Fired when a message is received from the user/channel. */
export type PluginHookMessageReceivedEvent = {
  from: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

/** Fired after the agent successfully (or not) sends a reply. */
export type PluginHookMessageSentEvent = {
  to: string;
  content: string;
  success: boolean;
  error?: string;
};

/** Minimal respond function passed to gateway method handlers. */
export type GatewayRespondFn = (
  ok: boolean,
  payload?: unknown,
  error?: { message: string; code?: string },
  meta?: Record<string, unknown>,
) => void;

/** Options object passed to every registerGatewayMethod handler. */
export type GatewayHandlerOpts = {
  /** Request parameters (the payload sent by the client). */
  params: Record<string, unknown>;
  respond: GatewayRespondFn;
  /** Raw request frame and richer context are also present but not typed here. */
  [key: string]: unknown;
};

/** Context passed to registerService start/stop. */
export type OpenClawPluginServiceContext = {
  config: unknown;
  workspaceDir?: string;
  stateDir: string;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
};

export type AddMemoryPayload = EverMemSingleMessage;

export type SearchMemPayload = {
  query: string;
  user_id?: string;
  group_id?: string;
  retrieve_method?: 'keyword' | 'vector' | 'hybrid' | 'rrf' | 'agentic';
  memory_types?: string[];
  limit?: number;
};

export type EverMemSingleMessage = {
  message_id: string;
  create_time: string;
  sender: string;
  content: string;
  group_id?: string;
  group_name?: string;
  sender_name?: string;
  role?: string;
  refer_list?: string[];
};
