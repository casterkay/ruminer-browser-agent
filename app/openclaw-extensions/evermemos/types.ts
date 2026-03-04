export type PluginConfig = {
  evermemosBaseUrl?: string;
  apiKey?: string;
  tenantId?: string;
  spaceId?: string;
  defaultUserId?: string;
  groupMapping?: Record<string, string>;
  ingestGroupIdPrefix?: string;
  backlogWarning?: number;
};

export type OpenClawMessageEvent = {
  id?: string;
  text?: string;
  timestamp?: number;
  senderId?: string;
  senderRole?: string;
  threadId?: string;
  conversationId?: string;
  channelId?: string;
  direction?: 'inbound' | 'outbound';
  replyToId?: string;
};

export type HookContext = {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
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
