/**
 * Session Service - Database-backed implementation using Drizzle ORM.
 *
 * Provides CRUD operations for agent sessions with:
 * - Type-safe database queries
 * - Engine-agnostic session configuration storage
 * - JSON config and management info caching
 */
import { randomUUID } from 'node:crypto';
import type { SQLInputValue } from 'node:sqlite';
import { getDb, type SessionRow } from './db';
import type { EngineName } from './engines/types';
import {
  createMessage as createStoredMessage,
  deleteMessagesBySessionId,
  getMessagesCountBySessionId,
} from './message-service';
import { upsertProject } from './project-service';
import { getDefaultProjectRoot } from './storage';

// ============================================================
// Types
// ============================================================

/**
 * System prompt configuration options.
 */
export type SystemPromptConfig =
  | { type: 'custom'; text: string }
  | { type: 'preset'; preset: 'claude_code'; append?: string };

/**
 * Tools configuration - can be a list of tool names or a preset.
 */
export type ToolsConfig = string[] | { type: 'preset'; preset: 'claude_code' };

/**
 * Session options configuration (stored as JSON).
 */
export interface SessionOptionsConfig {
  settingSources?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  tools?: ToolsConfig;
  betas?: string[];
  maxThinkingTokens?: number;
  maxTurns?: number;
  maxBudgetUsd?: number;
  mcpServers?: Record<string, unknown>;
  outputFormat?: Record<string, unknown>;
  enableFileCheckpointing?: boolean;
  sandbox?: Record<string, unknown>;
  env?: Record<string, string>;
  /**
   * Optional Codex-specific configuration overrides.
   * Only applicable when using CodexEngine.
   */
  codexConfig?: Partial<import('chrome-mcp-shared').CodexEngineConfig>;
}

/**
 * Cached management information from Claude SDK.
 */
export interface ManagementInfo {
  models?: Array<{ value: string; displayName: string; description: string }>;
  commands?: Array<{ name: string; description: string; argumentHint: string }>;
  account?: { email?: string; organization?: string; subscriptionType?: string };
  mcpServers?: Array<{ name: string; status: string }>;
  tools?: string[];
  agents?: string[];
  /** Plugins with name and path (SDK returns { name, path }[]) */
  plugins?: Array<{ name: string; path?: string }>;
  skills?: string[];
  slashCommands?: string[];
  model?: string;
  permissionMode?: string;
  cwd?: string;
  outputStyle?: string;
  betas?: string[];
  claudeCodeVersion?: string;
  apiKeySource?: string;
  lastUpdated?: string;
}

/**
 * Structured preview metadata for session list display.
 * When present, allows rendering special styles (e.g., chip for web editor apply).
 */
export interface AgentSessionPreviewMeta {
  /** Compact display text (e.g., user's message or "Apply changes") */
  displayText?: string;
  /** Client metadata for special rendering */
  clientMeta?: {
    kind?: 'web_editor_apply_batch' | 'web_editor_apply_single';
    pageUrl?: string;
    elementCount?: number;
    elementLabels?: string[];
  };
  /** Full content for tooltip preview (truncated to avoid payload bloat) */
  fullContent?: string;
}

/**
 * Agent session representation.
 */
export interface AgentSession {
  id: string;
  projectId: string;
  engineName: string;
  engineSessionId?: string;
  /** Source URL if imported from a platform (derived from stored message metadata). */
  sourceUrl?: string;
  name?: string;
  /** Preview text from first user message, for display in session list */
  preview?: string;
  /** Structured preview metadata for special rendering (e.g., web editor apply chip) */
  previewMeta?: AgentSessionPreviewMeta;
  model?: string;
  permissionMode: string;
  allowDangerouslySkipPermissions: boolean;
  systemPromptConfig?: SystemPromptConfig;
  optionsConfig?: SessionOptionsConfig;
  managementInfo?: ManagementInfo;
  createdAt: string;
  updatedAt: string;
}

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  id?: string;
  engineSessionId?: string;
  name?: string;
  model?: string;
  permissionMode?: string;
  allowDangerouslySkipPermissions?: boolean;
  systemPromptConfig?: SystemPromptConfig;
  optionsConfig?: SessionOptionsConfig;
}

/**
 * Options for updating an existing session.
 */
export interface UpdateSessionInput {
  engineSessionId?: string | null;
  name?: string | null;
  model?: string | null;
  permissionMode?: string | null;
  allowDangerouslySkipPermissions?: boolean | null;
  systemPromptConfig?: SystemPromptConfig | null;
  optionsConfig?: SessionOptionsConfig | null;
  managementInfo?: ManagementInfo | null;
}

// ============================================================
// JSON Parsing Utilities
// ============================================================

function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function stringifyJson<T>(value: T | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

// ============================================================
// Type Conversion
// ============================================================

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    projectId: row.projectId,
    engineName: row.engineName,
    engineSessionId: row.engineSessionId ?? undefined,
    name: row.name ?? undefined,
    model: row.model ?? undefined,
    permissionMode: row.permissionMode,
    allowDangerouslySkipPermissions: row.allowDangerouslySkipPermissions === '1',
    systemPromptConfig: parseJson<SystemPromptConfig>(row.systemPromptConfig),
    optionsConfig: parseJson<SessionOptionsConfig>(row.optionsConfig),
    managementInfo: parseJson<ManagementInfo>(row.managementInfo),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Create a new session for a project.
 */
export async function createSession(
  projectId: string,
  engineName: EngineName,
  options: CreateSessionOptions = {},
): Promise<AgentSession> {
  const db = getDb();
  const now = new Date().toISOString();

  // Resolve permission mode - AgentChat defaults to bypassPermissions for headless operation
  const resolvedPermissionMode = options.permissionMode?.trim() || 'bypassPermissions';

  // SDK requires allowDangerouslySkipPermissions=true when using bypassPermissions mode
  // If explicitly provided, use that value; otherwise infer from permission mode
  const resolvedAllowDangerouslySkipPermissions =
    typeof options.allowDangerouslySkipPermissions === 'boolean'
      ? options.allowDangerouslySkipPermissions
      : resolvedPermissionMode === 'bypassPermissions';

  const sessionData = {
    id: options.id?.trim() || randomUUID(),
    projectId,
    engineName,
    engineSessionId: options.engineSessionId?.trim() || null,
    name: options.name?.trim() || null,
    model: options.model?.trim() || null,
    permissionMode: resolvedPermissionMode,
    allowDangerouslySkipPermissions: resolvedAllowDangerouslySkipPermissions ? '1' : null,
    systemPromptConfig: stringifyJson(options.systemPromptConfig),
    optionsConfig: stringifyJson(options.optionsConfig),
    managementInfo: null,
    createdAt: now,
    updatedAt: now,
  };

  db.run(
    `INSERT INTO sessions (
      id,
      project_id,
      engine_name,
      engine_session_id,
      name,
      model,
      permission_mode,
      allow_dangerously_skip_permissions,
      system_prompt_config,
      options_config,
      management_info,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionData.id,
      sessionData.projectId,
      sessionData.engineName,
      sessionData.engineSessionId,
      sessionData.name,
      sessionData.model,
      sessionData.permissionMode,
      sessionData.allowDangerouslySkipPermissions,
      sessionData.systemPromptConfig,
      sessionData.optionsConfig,
      sessionData.managementInfo,
      sessionData.createdAt,
      sessionData.updatedAt,
    ],
  );
  return rowToSession(sessionData as SessionRow);
}

/**
 * Get a session by ID.
 */
export async function getSession(sessionId: string): Promise<AgentSession | undefined> {
  const db = getDb();
  const row = db.get<SessionRow>(
    `SELECT
      id,
      project_id AS projectId,
      engine_name AS engineName,
      engine_session_id AS engineSessionId,
      name,
      model,
      permission_mode AS permissionMode,
      allow_dangerously_skip_permissions AS allowDangerouslySkipPermissions,
      system_prompt_config AS systemPromptConfig,
      options_config AS optionsConfig,
      management_info AS managementInfo,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sessions
    WHERE id = ?
    LIMIT 1`,
    [sessionId],
  );
  if (!row) return undefined;
  const session = rowToSession(row);
  return addSourceUrlToSession(session);
}

/** Maximum length for preview text */
const MAX_PREVIEW_LENGTH = 50;

/**
 * Truncate text to max length with ellipsis.
 */
function truncatePreview(text: string, maxLength: number = MAX_PREVIEW_LENGTH): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1) + '…';
}

/**
 * Add preview to sessions by fetching first user message for each.
 * Shared helper to avoid code duplication.
 */
async function addPreviewsToSessions(rows: SessionRow[]): Promise<AgentSession[]> {
  const db = getDb();

  return Promise.all(
    rows.map(async (row) => {
      const session = rowToSession(row);

      // Query first user message for this session (include metadata for special rendering)
      const firstUserMessage = db.get<{ content: string; metadata: string | null }>(
        `SELECT content, metadata
        FROM messages
        WHERE session_id = ? AND role = 'user'
        ORDER BY created_at ASC
        LIMIT 1`,
        [row.id],
      );

      if (firstUserMessage?.content) {
        const content = firstUserMessage.content;
        const metadataJson = firstUserMessage.metadata;

        // Default preview from raw content; may be overridden by displayText below
        session.preview = truncatePreview(content);

        // Parse metadata to extract clientMeta/displayText for special rendering
        if (metadataJson) {
          try {
            const parsed = JSON.parse(metadataJson) as Record<string, unknown>;

            // Imported sessions: derive sourceUrl from stored message metadata (no schema change).
            if (!session.sourceUrl) {
              const source = typeof parsed.source === 'string' ? parsed.source : '';
              const conversationUrl =
                typeof parsed.conversationUrl === 'string' ? parsed.conversationUrl.trim() : '';
              if (source === 'ruminer_ingest' && conversationUrl) {
                session.sourceUrl = conversationUrl;
              }
            }

            // Type-safe extraction with validation
            const rawClientMeta = parsed.clientMeta;
            const rawDisplayText = parsed.displayText;

            // Validate displayText is a string
            const displayText = typeof rawDisplayText === 'string' ? rawDisplayText : undefined;

            // Prefer displayText (user's raw input) over content (may contain injected prompts)
            if (displayText) {
              session.preview = truncatePreview(displayText);
            }

            // Validate clientMeta structure
            const clientMeta =
              rawClientMeta &&
              typeof rawClientMeta === 'object' &&
              'kind' in rawClientMeta &&
              (rawClientMeta.kind === 'web_editor_apply_batch' ||
                rawClientMeta.kind === 'web_editor_apply_single')
                ? (rawClientMeta as AgentSessionPreviewMeta['clientMeta'])
                : undefined;

            // Only set previewMeta if we have valid special metadata
            if (clientMeta || displayText) {
              session.previewMeta = {
                displayText: displayText || truncatePreview(content),
                clientMeta,
                // Truncate fullContent to avoid payload bloat (200 chars max)
                fullContent: truncatePreview(content, 200),
              };
            }
          } catch {
            // Ignore JSON parse errors, just use plain preview
          }
        }
      }

      return session;
    }),
  );
}

async function addSourceUrlToSession(session: AgentSession): Promise<AgentSession> {
  if (session.sourceUrl) return session;

  const db = getDb();
  const row = db.get<{ metadata: string | null }>(
    `SELECT metadata
    FROM messages
    WHERE session_id = ? AND metadata IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1`,
    [session.id],
  );

  const metadataJson = row?.metadata ?? null;
  if (!metadataJson) return session;

  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const source = typeof parsed.source === 'string' ? parsed.source : '';
    const conversationUrl =
      typeof parsed.conversationUrl === 'string' ? parsed.conversationUrl.trim() : '';
    if (source === 'ruminer_ingest' && conversationUrl) {
      session.sourceUrl = conversationUrl;
    }
  } catch {
    // ignore
  }

  return session;
}

/**
 * Get all sessions for a project, sorted by most recently updated.
 * Includes preview from first user message for each session.
 */
export async function getSessionsByProject(projectId: string): Promise<AgentSession[]> {
  const db = getDb();
  const rows = db.all<SessionRow>(
    `SELECT
      id,
      project_id AS projectId,
      engine_name AS engineName,
      engine_session_id AS engineSessionId,
      name,
      model,
      permission_mode AS permissionMode,
      allow_dangerously_skip_permissions AS allowDangerouslySkipPermissions,
      system_prompt_config AS systemPromptConfig,
      options_config AS optionsConfig,
      management_info AS managementInfo,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sessions
    WHERE project_id = ?
    ORDER BY updated_at DESC`,
    [projectId],
  );

  return addPreviewsToSessions(rows);
}

/**
 * Get all sessions across all projects, sorted by most recently updated.
 * Includes preview from first user message for each session.
 */
export async function getAllSessions(): Promise<AgentSession[]> {
  const db = getDb();
  const rows = db.all<SessionRow>(
    `SELECT
      id,
      project_id AS projectId,
      engine_name AS engineName,
      engine_session_id AS engineSessionId,
      name,
      model,
      permission_mode AS permissionMode,
      allow_dangerously_skip_permissions AS allowDangerouslySkipPermissions,
      system_prompt_config AS systemPromptConfig,
      options_config AS optionsConfig,
      management_info AS managementInfo,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sessions
    ORDER BY updated_at DESC`,
  );

  return addPreviewsToSessions(rows);
}

/**
 * Get sessions for a project filtered by engine name.
 */
export async function getSessionsByProjectAndEngine(
  projectId: string,
  engineName: EngineName,
): Promise<AgentSession[]> {
  const db = getDb();
  const rows = db.all<SessionRow>(
    `SELECT
      id,
      project_id AS projectId,
      engine_name AS engineName,
      engine_session_id AS engineSessionId,
      name,
      model,
      permission_mode AS permissionMode,
      allow_dangerously_skip_permissions AS allowDangerouslySkipPermissions,
      system_prompt_config AS systemPromptConfig,
      options_config AS optionsConfig,
      management_info AS managementInfo,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sessions
    WHERE project_id = ? AND engine_name = ?
    ORDER BY updated_at DESC`,
    [projectId, engineName],
  );
  return rows.map(rowToSession);
}

/**
 * Update an existing session.
 */
export async function updateSession(sessionId: string, updates: UpdateSessionInput): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  const sets: string[] = ['updated_at = ?'];
  const params: SQLInputValue[] = [now];

  if (updates.engineSessionId !== undefined) {
    sets.push('engine_session_id = ?');
    params.push(updates.engineSessionId?.trim() || null);
  }

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name?.trim() || null);
  }

  if (updates.model !== undefined) {
    sets.push('model = ?');
    params.push(updates.model?.trim() || null);
  }

  if (updates.permissionMode !== undefined) {
    sets.push('permission_mode = ?');
    params.push(updates.permissionMode?.trim() || 'bypassPermissions');
  }

  if (updates.allowDangerouslySkipPermissions !== undefined) {
    sets.push('allow_dangerously_skip_permissions = ?');
    params.push(updates.allowDangerouslySkipPermissions ? '1' : null);
  }

  if (updates.systemPromptConfig !== undefined) {
    sets.push('system_prompt_config = ?');
    params.push(stringifyJson(updates.systemPromptConfig));
  }

  if (updates.optionsConfig !== undefined) {
    sets.push('options_config = ?');
    params.push(stringifyJson(updates.optionsConfig));
  }

  if (updates.managementInfo !== undefined) {
    sets.push('management_info = ?');
    params.push(stringifyJson(updates.managementInfo));
  }

  db.run(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`, [...params, sessionId]);
}

/**
 * Delete a session by ID.
 * Deletes messages in the session first to avoid orphan rows.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = getDb();
  try {
    await deleteMessagesBySessionId(sessionId);
  } catch {
    // Best-effort: still attempt to delete the session row.
  }
  db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

/**
 * Update the engine session ID (e.g., Claude SDK session_id).
 */
export async function updateEngineSessionId(
  sessionId: string,
  engineSessionId: string | null,
): Promise<void> {
  await updateSession(sessionId, { engineSessionId });
}

/**
 * Touch session activity - updates the updatedAt timestamp.
 * Used when a message is sent to move the session to the top of the list.
 */
export async function touchSessionActivity(sessionId: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);
}

/**
 * Update the cached management information.
 */
export async function updateManagementInfo(
  sessionId: string,
  info: ManagementInfo | null,
): Promise<void> {
  // Add timestamp to management info
  const infoWithTimestamp = info ? { ...info, lastUpdated: new Date().toISOString() } : null;
  await updateSession(sessionId, { managementInfo: infoWithTimestamp });
}

/**
 * Get or create a default session for a project and engine.
 * Useful for backwards compatibility - creates a session if none exists.
 */
export async function getOrCreateDefaultSession(
  projectId: string,
  engineName: EngineName,
  options: CreateSessionOptions = {},
): Promise<AgentSession> {
  const existingSessions = await getSessionsByProjectAndEngine(projectId, engineName);

  if (existingSessions.length > 0) {
    // Return the most recently updated session
    return existingSessions[0];
  }

  // Create a new default session
  return createSession(projectId, engineName, {
    ...options,
    name: options.name || `Default ${engineName} session`,
  });
}

// ============================================================
// Ingest Session Helpers (Ruminer)
// ============================================================

const IMPORTED_CONVERSATIONS_PROJECT_ID = 'ruminer.imported_conversations';
const IMPORTED_CONVERSATIONS_PROJECT_NAME = 'Imported Conversations';

export interface UpsertIngestedConversationSessionInput {
  platform: 'chatgpt' | 'gemini' | 'claude' | 'deepseek';
  conversationId: string;
  conversationTitle?: string | null;
  conversationUrl?: string | null;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createTime?: string | null;
  }>;
}

export interface UpsertIngestedConversationSessionResult {
  ok: true;
  projectId: string;
  sessionId: string;
  messageCount: number;
}

function platformDisplayName(platform: string): string {
  switch (platform) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'gemini':
      return 'Gemini';
    case 'claude':
      return 'Claude';
    case 'deepseek':
      return 'DeepSeek';
    default:
      return platform.trim() || 'Chat';
  }
}

function toIsoOrNow(value: string | null | undefined): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw) {
    const ts = Date.parse(raw);
    if (Number.isFinite(ts)) return new Date(ts).toISOString();
  }
  return new Date().toISOString();
}

export async function ensureImportedConversationsProject(): Promise<{ projectId: string }> {
  const rootPath = getDefaultProjectRoot(IMPORTED_CONVERSATIONS_PROJECT_NAME);
  const project = await upsertProject({
    id: IMPORTED_CONVERSATIONS_PROJECT_ID,
    name: IMPORTED_CONVERSATIONS_PROJECT_NAME,
    rootPath,
    allowCreate: true,
    enableChromeMcp: true,
  });
  return { projectId: project.id };
}

/**
 * Upsert an ingested conversation into the Agent DB as a Session + Messages.
 *
 * Session ID is deterministic and equals messages.conversation_id:
 * `${platform}:${conversationId}`
 *
 * Messages are upserted with deterministic IDs `${sessionId}:${index}` (index from the source array).
 */
export async function upsertIngestedConversationSession(
  input: UpsertIngestedConversationSessionInput,
): Promise<UpsertIngestedConversationSessionResult> {
  const platform = input.platform;
  const conversationId = input.conversationId.trim();
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  const { projectId } = await ensureImportedConversationsProject();
  const sessionId = `${platform}:${conversationId}`;

  const title = (input.conversationTitle ?? '').trim();
  const sessionName = title || `${platformDisplayName(platform)} ${conversationId}`;

  const existing = await getSession(sessionId);
  if (!existing) {
    await createSession(projectId, 'openclaw', {
      id: sessionId,
      name: sessionName,
    });
  } else if (title && (!existing.name || existing.name.trim() !== title)) {
    await updateSession(sessionId, { name: title });
  }

  const url = (input.conversationUrl ?? '').trim() || null;
  const msgs = Array.isArray(input.messages) ? input.messages : [];

  for (let i = 0; i < msgs.length; i++) {
    const raw = msgs[i];
    const role = raw?.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof raw?.content === 'string' ? raw.content.trim() : '';
    if (!content) continue;

    await createStoredMessage({
      id: `${sessionId}:${i}`,
      projectId,
      sessionId,
      conversationId: sessionId,
      role,
      messageType: 'chat',
      content,
      createdAt: toIsoOrNow(raw?.createTime ?? null),
      metadata: {
        source: 'ruminer_ingest',
        platform,
        conversationId,
        conversationTitle: title || null,
        conversationUrl: url,
        index: i,
      },
    });
  }

  // Touch updatedAt so imported sessions float to the top for this project.
  await touchSessionActivity(sessionId);

  const messageCount = await getMessagesCountBySessionId(sessionId);
  return { ok: true, projectId, sessionId, messageCount };
}
