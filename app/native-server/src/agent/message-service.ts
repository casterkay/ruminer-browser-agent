/**
 * Message Service - Database-backed implementation using Drizzle ORM.
 *
 * Provides CRUD operations for agent chat messages with:
 * - Type-safe database queries
 * - Efficient indexed queries
 * - Consistent with AgentStoredMessage interface from shared types
 */
import { randomUUID } from 'node:crypto';
import type { AgentRole, AgentStoredMessage } from 'chrome-mcp-shared';
import { getDb, type MessageRow } from './db';
import type { SQLInputValue } from 'node:sqlite';

// ============================================================
// Types
// ============================================================

export type { AgentStoredMessage };

export interface CreateAgentStoredMessageInput {
  projectId: string;
  role: AgentRole;
  messageType: AgentStoredMessage['messageType'];
  content: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  conversationId?: string | null;
  cliSource?: string;
  requestId?: string;
  id?: string;
  createdAt?: string;
}

// ============================================================
// Type Conversion
// ============================================================

/**
 * Convert database row to AgentStoredMessage interface.
 */
function rowToMessage(row: MessageRow): AgentStoredMessage {
  return {
    id: row.id,
    projectId: row.projectId,
    sessionId: row.sessionId,
    conversationId: row.conversationId,
    role: row.role as AgentRole,
    content: row.content,
    messageType: row.messageType as AgentStoredMessage['messageType'],
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    cliSource: row.cliSource,
    requestId: row.requestId ?? undefined,
    createdAt: row.createdAt,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Get messages by project ID with pagination.
 * Returns messages sorted by creation time (oldest first).
 */
export async function getMessagesByProjectId(
  projectId: string,
  limit = 50,
  offset = 0,
): Promise<AgentStoredMessage[]> {
  const db = getDb();

  const params: SQLInputValue[] = [projectId];
  let sql = `SELECT
      id,
      project_id AS projectId,
      session_id AS sessionId,
      conversation_id AS conversationId,
      role,
      content,
      message_type AS messageType,
      metadata,
      cli_source AS cliSource,
      request_id AS requestId,
      created_at AS createdAt
    FROM messages
    WHERE project_id = ?
    ORDER BY created_at ASC`;

  // Apply pagination if specified
  if (limit > 0) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  if (offset > 0) {
    sql += ' OFFSET ?';
    params.push(offset);
  }

  const rows = db.all<MessageRow>(sql, params);
  return rows.map(rowToMessage);
}

/**
 * Get the total count of messages for a project.
 */
export async function getMessagesCountByProjectId(projectId: string): Promise<number> {
  const db = getDb();
  const row = db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE project_id = ?',
    [projectId],
  );
  return row?.count ?? 0;
}

/**
 * Create a new message.
 */
export async function createMessage(
  input: CreateAgentStoredMessageInput,
): Promise<AgentStoredMessage> {
  const db = getDb();
  const now = new Date().toISOString();

  const messageData: MessageRow = {
    id: input.id?.trim() || randomUUID(),
    projectId: input.projectId,
    sessionId: input.sessionId || '',
    conversationId: input.conversationId ?? null,
    role: input.role,
    content: input.content,
    messageType: input.messageType,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    cliSource: input.cliSource ?? null,
    requestId: input.requestId ?? null,
    createdAt: input.createdAt || now,
  };

  db.run(
    `INSERT INTO messages (
      id,
      project_id,
      session_id,
      conversation_id,
      role,
      content,
      message_type,
      metadata,
      cli_source,
      request_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      role = excluded.role,
      message_type = excluded.message_type,
      content = excluded.content,
      metadata = excluded.metadata,
      session_id = excluded.session_id,
      conversation_id = excluded.conversation_id,
      cli_source = excluded.cli_source,
      request_id = excluded.request_id`,
    [
      messageData.id,
      messageData.projectId,
      messageData.sessionId,
      messageData.conversationId,
      messageData.role,
      messageData.content,
      messageData.messageType,
      messageData.metadata,
      messageData.cliSource,
      messageData.requestId,
      messageData.createdAt,
    ],
  );

  return rowToMessage(messageData);
}

/**
 * Delete messages by project ID.
 * Optionally filter by conversation ID.
 * Returns the number of deleted messages.
 */
export async function deleteMessagesByProjectId(
  projectId: string,
  conversationId?: string,
): Promise<number> {
  const db = getDb();

  // Get count before deletion
  const beforeCount = await getMessagesCountByProjectId(projectId);

  if (conversationId) {
    db.run('DELETE FROM messages WHERE project_id = ? AND conversation_id = ?', [
      projectId,
      conversationId,
    ]);
  } else {
    db.run('DELETE FROM messages WHERE project_id = ?', [projectId]);
  }

  // Get count after deletion to calculate deleted count
  const afterCount = await getMessagesCountByProjectId(projectId);
  return beforeCount - afterCount;
}

/**
 * Get messages by session ID with optional pagination.
 * Returns messages sorted by creation time (oldest first).
 *
 * @param sessionId - The session ID to filter by
 * @param limit - Maximum number of messages to return (0 = no limit)
 * @param offset - Number of messages to skip
 */
export async function getMessagesBySessionId(
  sessionId: string,
  limit = 0,
  offset = 0,
): Promise<AgentStoredMessage[]> {
  const db = getDb();

  const params: SQLInputValue[] = [sessionId];
  let sql = `SELECT
      id,
      project_id AS projectId,
      session_id AS sessionId,
      conversation_id AS conversationId,
      role,
      content,
      message_type AS messageType,
      metadata,
      cli_source AS cliSource,
      request_id AS requestId,
      created_at AS createdAt
    FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC`;

  if (limit > 0) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  if (offset > 0) {
    sql += ' OFFSET ?';
    params.push(offset);
  }

  const rows = db.all<MessageRow>(sql, params);
  return rows.map(rowToMessage);
}

/**
 * Get count of messages by session ID.
 */
export async function getMessagesCountBySessionId(sessionId: string): Promise<number> {
  const db = getDb();
  const row = db.get<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE session_id = ?',
    [sessionId],
  );
  return row?.count ?? 0;
}

/**
 * Delete all messages for a session.
 * Returns the number of deleted messages.
 */
export async function deleteMessagesBySessionId(sessionId: string): Promise<number> {
  const db = getDb();

  const beforeCount = await getMessagesCountBySessionId(sessionId);
  db.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
  const afterCount = await getMessagesCountBySessionId(sessionId);

  return beforeCount - afterCount;
}

/**
 * Get messages by request ID.
 */
export async function getMessagesByRequestId(requestId: string): Promise<AgentStoredMessage[]> {
  const db = getDb();
  const rows = db.all<MessageRow>(
    `SELECT
      id,
      project_id AS projectId,
      session_id AS sessionId,
      conversation_id AS conversationId,
      role,
      content,
      message_type AS messageType,
      metadata,
      cli_source AS cliSource,
      request_id AS requestId,
      created_at AS createdAt
    FROM messages
    WHERE request_id = ?
    ORDER BY created_at ASC`,
    [requestId],
  );
  return rows.map(rowToMessage);
}
