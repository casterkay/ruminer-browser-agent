import {
  buildToolGroupRestrictionText,
  getIndividualToolState,
  getToolGroupState,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import { computed, onUnmounted, ref, type Ref } from 'vue';
import type { GatewayEvent, UseOpenClawGateway } from './useOpenClawGateway';

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export type ToolCardKind = 'grep' | 'read' | 'edit' | 'run' | 'plan' | 'generic';

export interface ToolDiffStats {
  addedLines?: number;
  deletedLines?: number;
  totalLines?: number;
}

export interface ToolCardData {
  phase: 'use' | 'result';
  kind: ToolCardKind;
  label: string;
  title: string;
  details?: string;
  files?: string[];
  filePath?: string;
  diffStats?: ToolDiffStats;
  command?: string;
  commandDescription?: string;
  pattern?: string;
  searchPath?: string;
  isError?: boolean;
  raw?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  runId?: string;
  isStreaming?: boolean;
  toolCard?: ToolCardData;
}

export interface UseOpenClawChat {
  messages: Ref<ChatMessage[]>;
  input: Ref<string>;
  sending: Ref<boolean>;
  loadingHistory: Ref<boolean>;
  error: Ref<string | null>;
  activeRunId: Ref<string | null>;
  canSend: Ref<boolean>;
  hydrateHistory: () => Promise<void>;
  send: () => Promise<void>;
  abort: () => Promise<void>;
  newChat: () => Promise<void>;
  applyToolGroupsToPrompt: (
    message: string,
    toolGroups: ToolGroupState,
    individualToolState?: { overrides: Record<string, boolean> } | null,
  ) => string;
}

const SESSION_KEY = 'main';

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getString(
  source: Record<string, unknown>,
  keys: string[],
  fallback?: string,
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function getBoolean(source: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

function getNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || path;
}

function mapToolKind(toolName: string): ToolCardKind {
  const normalized = toolName.toLowerCase();
  if (normalized === 'plan' || normalized === 'todowrite' || normalized === 'todo_write') {
    return 'plan';
  }
  if (
    normalized.includes('edit') ||
    normalized.includes('write') ||
    normalized.includes('patch') ||
    normalized.includes('apply')
  ) {
    return 'edit';
  }
  if (normalized.includes('read') || normalized.includes('cat')) {
    return 'read';
  }
  if (normalized.includes('grep') || normalized.includes('search') || normalized.includes('glob')) {
    return 'grep';
  }
  if (
    normalized.includes('bash') ||
    normalized.includes('shell') ||
    normalized.includes('run') ||
    normalized.includes('exec') ||
    normalized.includes('command')
  ) {
    return 'run';
  }
  return 'generic';
}

function mapToolLabel(kind: ToolCardKind, toolName: string): string {
  if (kind === 'plan') return 'Plan';
  if (kind === 'edit') return 'Edit';
  if (kind === 'read') return 'Read';
  if (kind === 'grep') return 'Grep';
  if (kind === 'run') return 'Run';
  return titleCase(toolName || 'Tool');
}

function extractToolTitle(
  kind: ToolCardKind,
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  commandDescription: string | undefined,
  pattern: string | undefined,
): string {
  if (kind === 'edit' || kind === 'read') {
    if (filePath) {
      return fileName(filePath);
    }
  }
  if (kind === 'run') {
    return commandDescription || command || titleCase(toolName || 'Command');
  }
  if (kind === 'grep') {
    return pattern || titleCase(toolName || 'Search');
  }
  return titleCase(toolName || 'Tool');
}

function parseArrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length ? items : undefined;
}

function stringifyUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseToolEvent(payload: unknown): {
  id: string;
  createdAt: string;
  runId?: string;
  content: string;
  isStreaming: boolean;
  toolCard: ToolCardData;
} | null {
  const source = toRecord(payload);
  if (!source) {
    return null;
  }

  const eventType = getString(source, ['type', 'event', 'kind', 'phase'], '')?.toLowerCase() || '';
  let phase: 'use' | 'result' | null = null;
  if (
    eventType.includes('tool_start') ||
    eventType.includes('tool_call') ||
    eventType.includes('tool_use')
  ) {
    phase = 'use';
  } else if (
    eventType.includes('tool_output') ||
    eventType.includes('tool_result') ||
    eventType.includes('tool_end')
  ) {
    phase = 'result';
  }

  const lifecycle = getString(source, ['lifecycle', 'status'], '')?.toLowerCase() || '';
  if (!phase && lifecycle.includes('tool_')) {
    phase =
      lifecycle.includes('start') || lifecycle.includes('call') || lifecycle.includes('use')
        ? 'use'
        : 'result';
  }

  const nestedTool = toRecord(source.tool);
  const nestedData = toRecord(source.data);
  const merged = {
    ...(nestedTool || {}),
    ...(nestedData || {}),
    ...source,
  };

  const toolName =
    getString(merged, ['toolName', 'tool_name', 'name', 'tool'], 'tool')?.toLowerCase() || 'tool';
  const toolKind = mapToolKind(toolName);

  const argsRecord =
    toRecord(merged.arguments) || toRecord(merged.args) || toRecord(merged.input) || {};
  const filePath =
    getString(merged, ['filePath', 'file_path', 'path', 'file']) ||
    getString(argsRecord, ['filePath', 'file_path', 'path', 'file']);
  const command =
    getString(merged, ['command', 'cmd']) || getString(argsRecord, ['command', 'cmd']);
  const commandDescription = getString(merged, ['commandDescription', 'description', 'summary']);
  const pattern =
    getString(merged, ['pattern', 'query', 'search']) ||
    getString(argsRecord, ['pattern', 'query', 'search']);
  const searchPath =
    getString(merged, ['searchPath', 'search_path']) ||
    getString(argsRecord, ['searchPath', 'search_path']);
  const files =
    parseArrayOfStrings(merged.files) ||
    parseArrayOfStrings(argsRecord.files) ||
    (filePath ? [filePath] : undefined);

  const diffSource = toRecord(merged.diffStats) || merged;
  const parsedDiffStats: ToolDiffStats = {
    addedLines: getNumber(diffSource, ['addedLines', 'additions', 'added']),
    deletedLines: getNumber(diffSource, ['deletedLines', 'deletions', 'removed']),
    totalLines: getNumber(diffSource, ['totalLines', 'lines']),
  };
  const diffStats =
    parsedDiffStats.addedLines !== undefined ||
    parsedDiffStats.deletedLines !== undefined ||
    parsedDiffStats.totalLines !== undefined
      ? parsedDiffStats
      : undefined;

  const errorText = stringifyUnknown(merged.error);
  const details =
    stringifyUnknown(merged.output) ||
    stringifyUnknown(merged.result) ||
    stringifyUnknown(merged.details) ||
    stringifyUnknown(merged.text) ||
    stringifyUnknown(merged.message) ||
    errorText;

  const isError =
    getBoolean(merged, ['isError', 'is_error'], false) ||
    getString(merged, ['status'], '')?.toLowerCase() === 'error' ||
    getBoolean(merged, ['ok'], true) === false ||
    !!errorText;

  if (!phase) {
    if (merged.tool || merged.toolName || merged.tool_name || eventType.includes('tool')) {
      phase = isError || details ? 'result' : 'use';
    } else {
      return null;
    }
  }

  const title = extractToolTitle(
    toolKind,
    toolName,
    filePath,
    command,
    commandDescription,
    pattern,
  );
  const label = mapToolLabel(toolKind, toolName);

  const toolCallId =
    getString(merged, ['toolCallId', 'tool_call_id', 'callId', 'id']) || crypto.randomUUID();
  const id = `${toolCallId}:${phase}`;

  const toolCard: ToolCardData = {
    phase,
    kind: toolKind,
    label,
    title,
    details,
    files,
    filePath,
    diffStats,
    command,
    commandDescription,
    pattern,
    searchPath,
    isError,
    raw: merged,
  };

  return {
    id,
    createdAt: getString(merged, ['createdAt', 'timestamp', 'time']) || new Date().toISOString(),
    runId: getString(merged, ['runId', 'requestId']),
    content: details || `${label}: ${title}`,
    isStreaming: phase === 'use',
    toolCard,
  };
}

function normalizeMessage(payload: any): ChatMessage | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const content =
    typeof payload.content === 'string'
      ? payload.content
      : typeof payload.message === 'string'
        ? payload.message
        : typeof payload.text === 'string'
          ? payload.text
          : '';

  if (!content && !payload.delta) {
    return null;
  }

  const roleRaw = String(
    payload.role || payload.sender || payload.type || 'assistant',
  ).toLowerCase();
  const role: ChatRole = roleRaw === 'user' ? 'user' : roleRaw === 'tool' ? 'tool' : 'assistant';

  return {
    id: String(payload.id || payload.messageId || payload.requestId || crypto.randomUUID()),
    role,
    content,
    createdAt: typeof payload.createdAt === 'string' ? payload.createdAt : new Date().toISOString(),
    runId: typeof payload.runId === 'string' ? payload.runId : undefined,
    isStreaming: payload.isStreaming === true,
  };
}

function upsertMessage(messages: ChatMessage[], next: ChatMessage): ChatMessage[] {
  const index = messages.findIndex((message) => message.id === next.id);
  if (index === -1) {
    return [...messages, next];
  }

  const cloned = [...messages];
  cloned[index] = {
    ...cloned[index],
    ...next,
  };
  return cloned;
}

async function requestWithFallback(
  gateway: UseOpenClawGateway,
  method: string,
  params: unknown,
): Promise<unknown> {
  try {
    return await gateway.request(method, params);
  } catch {
    if (method === 'chat.history') {
      return gateway.request(method, SESSION_KEY);
    }
    if (method === 'chat.abort') {
      return gateway.request(method, { sessionKey: SESSION_KEY });
    }
    throw new Error(`Gateway request failed for ${method}`);
  }
}

export function useOpenClawChat(gateway: UseOpenClawGateway): UseOpenClawChat {
  const messages = ref<ChatMessage[]>([]);
  const input = ref('');
  const sending = ref(false);
  const loadingHistory = ref(false);
  const error = ref<string | null>(null);
  const activeRunId = ref<string | null>(null);

  const canSend = computed(() => {
    return gateway.connected.value && input.value.trim().length > 0 && !sending.value;
  });

  function applyToolGroupsToPrompt(
    message: string,
    toolGroups: ToolGroupState,
    individualToolState?: { overrides: Record<string, boolean> } | null,
  ): string {
    const restrictionText = buildToolGroupRestrictionText(toolGroups, individualToolState ?? null);
    if (!restrictionText) {
      return message;
    }
    return `${restrictionText}\n\nUser request:\n${message}`;
  }

  async function hydrateHistory(): Promise<void> {
    loadingHistory.value = true;
    error.value = null;

    try {
      const response = await requestWithFallback(gateway, 'chat.history', {
        sessionKey: SESSION_KEY,
      });

      const payload: any = response || {};
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.messages)
          ? payload.messages
          : Array.isArray(payload.items)
            ? payload.items
            : [];

      const normalized = (list as unknown[])
        .map((item: unknown) => normalizeMessage(item))
        .filter((item: ChatMessage | null): item is ChatMessage => item !== null);

      messages.value = normalized;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loadingHistory.value = false;
    }
  }

  async function send(): Promise<void> {
    const messageText = input.value.trim();
    if (!messageText || sending.value) {
      return;
    }

    sending.value = true;
    error.value = null;

    const optimisticMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      createdAt: new Date().toISOString(),
    };

    messages.value = [...messages.value, optimisticMessage];
    input.value = '';

    try {
      const [toolGroups, individualToolState] = await Promise.all([
        getToolGroupState(),
        getIndividualToolState(),
      ]);
      const finalMessage = applyToolGroupsToPrompt(messageText, toolGroups, individualToolState);

      const response: any = await gateway.request('chat.send', {
        sessionKey: SESSION_KEY,
        message: finalMessage,
        idempotencyKey: crypto.randomUUID(),
      });

      if (response && typeof response.runId === 'string') {
        activeRunId.value = response.runId;
      }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
      input.value = messageText;
      messages.value = messages.value.filter(
        (item: ChatMessage) => item.id !== optimisticMessage.id,
      );
    } finally {
      sending.value = false;
    }
  }

  async function abort(): Promise<void> {
    if (!activeRunId.value) {
      return;
    }

    try {
      await requestWithFallback(gateway, 'chat.abort', {
        sessionKey: SESSION_KEY,
        runId: activeRunId.value,
      });
      activeRunId.value = null;
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function newChat(): Promise<void> {
    messages.value = [];
    activeRunId.value = null;
    await hydrateHistory();
  }

  function handleChatEvent(event: GatewayEvent): void {
    if (event.event === 'chat') {
      const payload: any = event.payload;

      if (Array.isArray(payload?.messages)) {
        payload.messages.forEach((raw: unknown) => {
          const normalized = normalizeMessage(raw);
          if (!normalized) return;
          messages.value = upsertMessage(messages.value, normalized);
        });
        return;
      }

      const normalized = normalizeMessage(payload);
      if (normalized) {
        messages.value = upsertMessage(messages.value, normalized);
      }

      if (typeof payload?.runId === 'string') {
        activeRunId.value = payload.runId;
      }
      if (payload?.status === 'completed' || payload?.status === 'ok') {
        activeRunId.value = null;
      }
      return;
    }

    if (event.event === 'openclaw') {
      const payload: any = event.payload;
      const toolEvent = parseToolEvent(payload);
      if (toolEvent) {
        messages.value = upsertMessage(messages.value, {
          id: toolEvent.id,
          role: 'tool',
          content: toolEvent.content,
          createdAt: toolEvent.createdAt,
          runId: toolEvent.runId,
          isStreaming: toolEvent.isStreaming,
          toolCard: toolEvent.toolCard,
        });
      } else {
        const text =
          typeof payload?.text === 'string'
            ? payload.text
            : typeof payload?.summary === 'string'
              ? payload.summary
              : JSON.stringify(payload || {});

        messages.value = [
          ...messages.value,
          {
            id: crypto.randomUUID(),
            role: 'tool',
            content: text,
            createdAt: new Date().toISOString(),
            runId: typeof payload?.runId === 'string' ? payload.runId : undefined,
          },
        ];
      }

      if (payload?.status === 'completed' || payload?.status === 'ok') {
        activeRunId.value = null;
      }
    }
  }

  const unsubscribe = gateway.onEvent(handleChatEvent);
  onUnmounted(() => {
    unsubscribe();
  });

  return {
    messages,
    input,
    sending,
    loadingHistory,
    error,
    activeRunId,
    canSend,
    hydrateHistory,
    send,
    abort,
    newChat,
    applyToolGroupsToPrompt,
  };
}
