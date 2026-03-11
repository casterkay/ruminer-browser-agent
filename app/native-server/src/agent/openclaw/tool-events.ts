import { randomUUID } from 'node:crypto';

export type OpenClawToolPhase = 'use' | 'result';

export interface ParsedOpenClawToolEvent {
  /** Unique id for this phase (safe to use as AgentMessage.id) */
  id: string;
  createdAt: string;
  phase: OpenClawToolPhase;
  content: string;
  metadata: Record<string, unknown>;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickString(source: Record<string, unknown>, keys: string[], fallback?: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback ?? '';
}

function pickBoolean(source: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') {
      return value;
    }
  }
  return fallback;
}

function pickNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
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

function mapToolKind(
  toolName: string,
): 'plan' | 'edit' | 'read' | 'grep' | 'recall' | 'run' | 'generic' {
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
  if (normalized.startsWith('emos_') || /(?:^|__)emos_/.test(normalized)) {
    return 'recall';
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

function mapToolLabel(kind: ReturnType<typeof mapToolKind>, toolName: string): string {
  if (kind === 'plan') return 'Plan';
  if (kind === 'edit') return 'Edit';
  if (kind === 'read') return 'Read';
  if (kind === 'recall') return 'Memory';
  if (kind === 'grep') return 'Grep';
  if (kind === 'run') return 'Run';
  return titleCase(toolName || 'Tool');
}

function extractToolTitle(
  kind: ReturnType<typeof mapToolKind>,
  toolName: string,
  filePath: string | undefined,
  command: string | undefined,
  commandDescription: string | undefined,
  pattern: string | undefined,
): string {
  if (kind === 'edit' || kind === 'read') {
    if (filePath) return fileName(filePath);
  }
  if (kind === 'run') {
    return commandDescription || command || titleCase(toolName || 'Command');
  }
  if (kind === 'recall') {
    const shortName = (toolName || 'recall').replace(/^.*?emos_/, 'emos_');
    return pattern || titleCase(shortName.replace(/^emos_/, '').replace(/_/g, ' '));
  }
  if (kind === 'grep') {
    return pattern || titleCase(toolName || 'Search');
  }
  return titleCase(toolName || 'Tool');
}

function stringifyUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseArrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length ? items : undefined;
}

/**
 * Parses OpenClaw tool-stream payloads into a stable, UI-friendly tool event.
 * Returns null when the payload does not look like a tool lifecycle event.
 */
export function parseOpenClawToolEvent(payload: unknown): ParsedOpenClawToolEvent | null {
  const source = toRecord(payload);
  if (!source) return null;

  const eventType = pickString(source, ['type', 'event', 'kind', 'phase'], '').toLowerCase();

  let phase: OpenClawToolPhase | null = null;
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

  const lifecycle = pickString(source, ['lifecycle', 'status'], '').toLowerCase();
  if (!phase && lifecycle.includes('tool_')) {
    phase =
      lifecycle.includes('start') || lifecycle.includes('call') || lifecycle.includes('use')
        ? 'use'
        : 'result';
  }

  const nestedTool = toRecord(source.tool);
  const nestedData = toRecord(source.data);
  const merged: Record<string, unknown> = {
    ...(nestedTool || {}),
    ...(nestedData || {}),
    ...source,
  };

  const toolName =
    pickString(merged, ['toolName', 'tool_name', 'name', 'tool'], 'tool').toLowerCase() || 'tool';
  const toolKind = mapToolKind(toolName);

  const argsRecord =
    toRecord(merged.arguments) || toRecord(merged.args) || toRecord(merged.input) || {};

  const filePath =
    pickString(merged, ['filePath', 'file_path', 'path', 'file']) ||
    pickString(argsRecord, ['filePath', 'file_path', 'path', 'file']) ||
    undefined;

  const command =
    pickString(merged, ['command', 'cmd']) ||
    pickString(argsRecord, ['command', 'cmd']) ||
    undefined;

  const commandDescription =
    pickString(merged, ['commandDescription', 'description', 'summary']) || undefined;

  const pattern =
    pickString(merged, ['pattern', 'query', 'search']) ||
    pickString(argsRecord, ['pattern', 'query', 'search']) ||
    undefined;

  const searchPath =
    pickString(merged, ['searchPath', 'search_path']) ||
    pickString(argsRecord, ['searchPath', 'search_path']) ||
    undefined;

  const files =
    parseArrayOfStrings(merged.files) ||
    parseArrayOfStrings(argsRecord.files) ||
    (filePath ? [filePath] : undefined);

  const diffSource = (toRecord(merged.diffStats) || merged) as Record<string, unknown>;
  const addedLines = pickNumber(diffSource, ['addedLines', 'additions', 'added']);
  const deletedLines = pickNumber(diffSource, ['deletedLines', 'deletions', 'removed']);
  const totalLines = pickNumber(diffSource, ['totalLines', 'lines']);

  const errorText = stringifyUnknown(merged.error);
  const details =
    stringifyUnknown(merged.output) ||
    stringifyUnknown(merged.result) ||
    stringifyUnknown(merged.details) ||
    stringifyUnknown(merged.text) ||
    stringifyUnknown(merged.message) ||
    errorText;

  const isError =
    pickBoolean(merged, ['isError', 'is_error'], false) ||
    pickString(merged, ['status'], '').toLowerCase() === 'error' ||
    pickBoolean(merged, ['ok'], true) === false ||
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
    pickString(merged, ['toolCallId', 'tool_call_id', 'callId', 'id']) || randomUUID();
  const id = `${toolCallId}:${phase}`;

  const createdAt =
    pickString(merged, ['createdAt', 'timestamp', 'time']) || new Date().toISOString();

  const metadata: Record<string, unknown> = {
    toolName,
    toolKind,
    label,
    title,
    ...(filePath ? { filePath } : {}),
    ...(files ? { files } : {}),
    ...(command ? { command } : {}),
    ...(commandDescription ? { commandDescription } : {}),
    ...(pattern ? { pattern } : {}),
    ...(searchPath ? { searchPath } : {}),
    ...(addedLines !== undefined ? { addedLines } : {}),
    ...(deletedLines !== undefined ? { deletedLines } : {}),
    ...(totalLines !== undefined ? { totalLines } : {}),
    ...(isError ? { isError: true } : {}),
  };

  const content =
    phase === 'result'
      ? details || `${label}: ${title}`
      : // For tool_use, keep content short; UI renders from metadata.
        `${label}: ${title}`;

  return {
    id,
    createdAt,
    phase,
    content,
    metadata,
  };
}
