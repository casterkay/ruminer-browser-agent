import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AgentMessage } from 'chrome-mcp-shared';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { createMessage as persistAgentMessage } from './message-service';
import { getSession } from './session-service';
import type { AgentStreamManager } from './stream-manager';

export interface McpToolTelemetryContext {
  agentSessionId?: string;
  agentRequestId?: string;
  agentEngine?: string;
}

const telemetryStorage = new AsyncLocalStorage<McpToolTelemetryContext>();

let streamManager: AgentStreamManager | null = null;

export function setMcpToolTelemetryStreamManager(manager: AgentStreamManager): void {
  streamManager = manager;
}

export function runWithMcpToolTelemetryContext<T>(
  ctx: McpToolTelemetryContext,
  fn: () => Promise<T>,
): Promise<T> {
  return telemetryStorage.run(ctx, fn);
}

export function getMcpToolTelemetryContext(): McpToolTelemetryContext | undefined {
  return telemetryStorage.getStore();
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function summarizeArgs(args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return undefined;
  const record = args as Record<string, unknown>;

  const url = normalizeNonEmptyString(record.url);
  if (url) return url.length > 80 ? url.slice(0, 77) + '...' : url;

  const filePath =
    normalizeNonEmptyString(record.file_path) || normalizeNonEmptyString(record.path);
  if (filePath) return filePath;

  const command = normalizeNonEmptyString(record.command);
  if (command) return command.length > 80 ? command.slice(0, 77) + '...' : command;

  const pattern = normalizeNonEmptyString(record.pattern) || normalizeNonEmptyString(record.query);
  if (pattern) return pattern.length > 80 ? pattern.slice(0, 77) + '...' : pattern;

  return undefined;
}

function extractFirstText(result: CallToolResult | undefined): string | undefined {
  if (!result || !Array.isArray((result as any).content)) return undefined;
  const content = (result as any).content as Array<Record<string, unknown>>;
  const firstText = content.find((c) => c?.type === 'text' && typeof c?.text === 'string');
  const text = typeof firstText?.text === 'string' ? firstText.text.trim() : '';
  if (!text) return undefined;
  // Keep it short; tool results can be huge (HTML, JSON dumps, etc.)
  return text.length > 800 ? text.slice(0, 800) + '…' : text;
}

function publishAgentMessage(message: AgentMessage): void {
  if (!streamManager) return;
  streamManager.publish({ type: 'message', data: message });
}

async function persistToolResultIfPossible(message: AgentMessage): Promise<void> {
  // Only persist when sessionId maps to a DB session.
  const sessionId = message.sessionId;
  if (!sessionId) return;

  const session = await getSession(sessionId);
  if (!session?.projectId) return;

  await persistAgentMessage({
    projectId: session.projectId,
    role: message.role,
    messageType: message.messageType,
    content: message.content,
    sessionId: message.sessionId,
    cliSource: message.cliSource,
    requestId: message.requestId,
    metadata: message.metadata,
    id: message.id,
    createdAt: message.createdAt,
  });
}

export function emitMcpToolUse(name: string, args: unknown): void {
  const ctx = telemetryStorage.getStore();
  const agentSessionId = normalizeNonEmptyString(ctx?.agentSessionId);
  if (!agentSessionId) return;

  const now = new Date().toISOString();
  const requestId = normalizeNonEmptyString(ctx?.agentRequestId);
  const engine = normalizeNonEmptyString(ctx?.agentEngine);

  const argHint = summarizeArgs(args);
  const content = argHint ? `Using tool: ${name} (${argHint})` : `Using tool: ${name}`;

  publishAgentMessage({
    id: `mcp-tool-use:${randomUUID()}`,
    sessionId: agentSessionId,
    role: 'tool',
    content,
    messageType: 'tool_use',
    cliSource: engine,
    requestId,
    isStreaming: true,
    isFinal: false,
    createdAt: now,
    metadata: {
      toolName: name,
      tool_name: name,
      args,
      source: 'mcp',
    },
  });
}

export function emitMcpToolResult(name: string, args: unknown, result: CallToolResult): void {
  const ctx = telemetryStorage.getStore();
  const agentSessionId = normalizeNonEmptyString(ctx?.agentSessionId);
  if (!agentSessionId) return;

  const now = new Date().toISOString();
  const requestId = normalizeNonEmptyString(ctx?.agentRequestId);
  const engine = normalizeNonEmptyString(ctx?.agentEngine);

  const isError = (result as any)?.isError === true;
  const preview = extractFirstText(result);
  const content = preview
    ? `${isError ? 'Error' : 'Result'}: ${name}\n\n${preview}`
    : `${isError ? 'Error' : 'Completed'}: ${name}`;

  const message: AgentMessage = {
    id: `mcp-tool-result:${randomUUID()}`,
    sessionId: agentSessionId,
    role: 'tool',
    content,
    messageType: 'tool_result',
    cliSource: engine,
    requestId,
    isStreaming: false,
    isFinal: true,
    createdAt: now,
    metadata: {
      toolName: name,
      tool_name: name,
      args,
      is_error: isError || undefined,
      source: 'mcp',
    },
  };

  publishAgentMessage(message);

  // Persist only results (avoid polluting history with per-call progress rows).
  void persistToolResultIfPossible(message).catch((error) => {
    console.error('[McpToolTelemetry] Failed to persist tool_result message:', error);
  });
}
