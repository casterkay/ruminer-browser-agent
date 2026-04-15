export const MARKCHAT_SCHEMA_VERSION = '1.0';

export type ConversationParticipantRole = 'human' | 'bot' | 'system' | 'tool' | 'unknown';

export interface ConversationParticipant {
  id: string;
  name: string;
  role: ConversationParticipantRole;
  model?: string;
}

export interface ConversationMarkdownMessage {
  messageId: string;
  createdAt: string;
  sender: string;
  senderName?: string | null;
  role?: string | null;
  content: string;
}

export interface ConversationMarkdownMetadata {
  sessionId: string;
  timestamp: string;
  title?: string;
  description?: string;
  sourcePlatform?: string;
  conversationId?: string;
  groupId?: string;
  groupName?: string;
  sourceUrl?: string;
  participants?: ConversationParticipant[];
}

export interface ConversationMarkdownDocument {
  metadata: ConversationMarkdownMetadata;
  messages: ConversationMarkdownMessage[];
}

type YamlScalar = string | number | boolean | null;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function formatYamlScalar(value: YamlScalar): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return quoteYamlString(value);
}

function formatYamlScalarUnknown(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return formatYamlScalar(value);
  }
  return quoteYamlString(String(value));
}

function isYamlObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pushYamlEntry(lines: string[], key: string, value: unknown, indent = 0): void {
  if (value === undefined) {
    return;
  }

  const prefix = `${' '.repeat(indent)}${key}:`;

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${prefix} []`);
      return;
    }

    lines.push(prefix);
    for (const item of value) {
      if (isYamlObject(item)) {
        const entries = Object.entries(item).filter(([, childValue]) => childValue !== undefined);
        if (entries.length === 0) {
          lines.push(`${' '.repeat(indent + 2)}- {}`);
          continue;
        }

        const [firstKey, firstValue] = entries[0];
        if (Array.isArray(firstValue) || isYamlObject(firstValue)) {
          lines.push(`${' '.repeat(indent + 2)}- ${firstKey}:`);
          if (Array.isArray(firstValue)) {
            for (const nested of firstValue) {
              if (isYamlObject(nested)) {
                pushYamlEntry(lines, '', nested, indent + 6);
              } else {
                lines.push(`${' '.repeat(indent + 6)}- ${formatYamlScalar(nested as YamlScalar)}`);
              }
            }
          } else {
            for (const [nestedKey, nestedValue] of Object.entries(firstValue)) {
              pushYamlEntry(lines, nestedKey, nestedValue, indent + 4);
            }
          }
        } else {
          lines.push(
            `${' '.repeat(indent + 2)}- ${firstKey}: ${formatYamlScalarUnknown(firstValue)}`,
          );
        }

        for (const [childKey, childValue] of entries.slice(1)) {
          pushYamlEntry(lines, childKey, childValue, indent + 4);
        }
        continue;
      }

      lines.push(`${' '.repeat(indent + 2)}- ${formatYamlScalar(item as YamlScalar)}`);
    }
    return;
  }

  if (isYamlObject(value)) {
    lines.push(prefix);
    for (const [childKey, childValue] of Object.entries(value)) {
      pushYamlEntry(lines, childKey, childValue, indent + 2);
    }
    return;
  }

  lines.push(`${prefix} ${formatYamlScalarUnknown(value)}`);
}

function renderYamlFrontmatter(entries: Array<[string, unknown]>): string {
  const lines: string[] = [];
  for (const [key, value] of entries) {
    pushYamlEntry(lines, key, value);
  }
  return lines.join('\n');
}

function normalizeParticipantRole(role: string | null | undefined): ConversationParticipantRole {
  switch (role) {
    case 'assistant':
    case 'bot':
    case 'model':
      return 'bot';
    case 'system':
      return 'system';
    case 'tool':
      return 'tool';
    case 'user':
    case 'human':
      return 'human';
    default:
      return 'unknown';
  }
}

function toParticipantId(rawValue: string): string {
  const normalized = rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  return normalized.replace(/^_+|_+$/g, '') || 'participant';
}

function toParticipantName(message: ConversationMarkdownMessage): string {
  const senderName = normalizeOptionalString(message.senderName);
  if (senderName) {
    return senderName;
  }
  if (message.sender === 'me') {
    return 'Me';
  }
  if (message.sender === 'bot') {
    return 'Assistant';
  }
  return message.sender.trim() || 'Unknown';
}

export function buildConversationParticipants(
  messages: ConversationMarkdownMessage[],
): ConversationParticipant[] {
  const participants = new Map<string, ConversationParticipant>();

  for (const message of messages) {
    const idSource = normalizeOptionalString(message.sender) ?? toParticipantName(message);
    const participantId = toParticipantId(idSource);
    if (participants.has(participantId)) {
      continue;
    }

    participants.set(participantId, {
      id: participantId,
      name: toParticipantName(message),
      role: normalizeParticipantRole(message.role),
    });
  }

  return Array.from(participants.values());
}

export function formatMarkChatTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day},${hours}:${minutes}:${seconds}`;
}

export function normalizeMarkChatBody(content: string): string {
  const normalized = content.replace(/\r\n?/g, '\n').trim();
  if (!normalized) {
    return '_[empty message]_';
  }

  const inputLines = normalized.split('\n');
  const outputLines: string[] = [];

  for (let index = 0; index < inputLines.length; index += 1) {
    const line = inputLines[index];
    if (line.trim() !== '---') {
      outputLines.push(line);
      continue;
    }

    if (outputLines.length > 0 && outputLines[outputLines.length - 1].trim() !== '') {
      outputLines.push('');
    }
    outputLines.push('---');

    const nextLine = inputLines[index + 1];
    if (typeof nextLine === 'string' && nextLine.trim() !== '') {
      outputLines.push('');
    }
  }

  return outputLines.join('\n');
}

export function renderConversationMessageMarkdown(message: ConversationMarkdownMessage): string {
  const senderLabel = toParticipantName(message);
  const timestamp = formatMarkChatTimestamp(message.createdAt);
  const body = normalizeMarkChatBody(message.content);
  return `${senderLabel} [${timestamp}]\n---\n\n${body}`;
}

export function renderConversationMarkdown(document: ConversationMarkdownDocument): string {
  const participants =
    document.metadata.participants && document.metadata.participants.length > 0
      ? document.metadata.participants
      : buildConversationParticipants(document.messages);

  const frontmatter = renderYamlFrontmatter([
    ['session_id', document.metadata.sessionId],
    ['timestamp', document.metadata.timestamp],
    ['schema_version', MARKCHAT_SCHEMA_VERSION],
    ['title', normalizeOptionalString(document.metadata.title)],
    ['description', normalizeOptionalString(document.metadata.description)],
    ['source_platform', normalizeOptionalString(document.metadata.sourcePlatform)],
    ['conversation_id', normalizeOptionalString(document.metadata.conversationId)],
    ['group_id', normalizeOptionalString(document.metadata.groupId)],
    ['group_name', normalizeOptionalString(document.metadata.groupName)],
    ['source_url', normalizeOptionalString(document.metadata.sourceUrl)],
    [
      'participants',
      participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.role,
        model: normalizeOptionalString(participant.model),
      })),
    ],
  ]);

  const body = document.messages.map(renderConversationMessageMarkdown).join('\n\n---\n---\n\n');
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}
