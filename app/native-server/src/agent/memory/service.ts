import { createHash } from 'node:crypto';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { MemoryBackendType } from 'chrome-mcp-shared';

import { getDb } from '../db/client';
import type { MemoryDocumentRow, MemoryMessageRow } from '../db/schema';
import { getEmosSettings } from '../evermemos/settings-service';
import { getMemoryConversationsDir, getMemoryQmdIndexPath, getMemoryTrashDir } from '../storage';
import {
  renderConversationMarkdown,
  type ConversationMarkdownDocument,
  type ConversationMarkdownMessage,
} from './markchat';
import { getMemorySettings } from './settings-service';

const MEMORY_COLLECTION_NAME = 'conversations';
const QMD_MODULE_NAMES = ['@tobilu/qmd', 'qmd'] as const;

export interface MemoryWireMessage {
  message_id: string;
  create_time: string;
  sender: string;
  content: string;
  group_id?: string;
  group_name?: string;
  source_url?: string | null;
  sender_name?: string;
  role?: string | null;
  refer_list?: string[];
  source_platform?: string;
  conversation_id?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryQueryInput {
  query?: string;
  user_id?: string;
  group_id?: string;
  limit?: number;
  offset?: number;
  retrieve_method?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

export interface MemoryDeleteInput {
  event_id?: string;
  message_id?: string;
  document_id?: string;
  user_id?: string;
  group_id?: string;
}

export interface MemoryStatus {
  backend: MemoryBackendType;
  configured: boolean;
  localRootPath: string;
  qmdIndexPath: string;
  qmdAvailable: boolean;
  qmdEnabled: boolean;
  totalDocuments: number;
  totalMessages: number;
  updatedAt: string;
}

type QmdSearchResult = {
  file?: unknown;
  displayPath?: unknown;
  title?: unknown;
  score?: unknown;
};

type QmdStore = {
  search?: (input: Record<string, unknown>) => Promise<unknown>;
  close?: () => Promise<void> | void;
};

let qmdModulePromise: Promise<Record<string, unknown> | null> | null = null;
let qmdStoreCache: { rootPath: string; store: QmdStore } | null = null;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function trimOrNull(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function normalizeLimit(value: unknown, fallback = 50): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.min(200, Math.floor(value)));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.min(200, Math.floor(parsed)));
    }
  }
  return fallback;
}

function normalizeOffset(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

function toIso(value: unknown, fallback?: string): string {
  const normalized = normalizeString(value);
  if (!normalized) return fallback ?? new Date().toISOString();
  const timestamp = Date.parse(normalized);
  if (Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }
  return fallback ?? new Date().toISOString();
}

function slugSegment(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

function parseJsonObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore malformed metadata
  }
  return undefined;
}

function parseJsonArray(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    // ignore malformed refer list
  }
  return undefined;
}

function computeContentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildLikeValue(query: string): string {
  return `%${query.toLowerCase()}%`;
}

async function ensureLocalDirs(rootPath: string): Promise<void> {
  await Promise.all([
    mkdir(rootPath, { recursive: true }),
    mkdir(getMemoryConversationsDir(rootPath), { recursive: true }),
    mkdir(getMemoryTrashDir(rootPath), { recursive: true }),
  ]);
}

async function loadQmdModule(): Promise<Record<string, unknown> | null> {
  if (!qmdModulePromise) {
    qmdModulePromise = (async () => {
      for (const moduleName of QMD_MODULE_NAMES) {
        try {
          const loaded = (await import(moduleName)) as Record<string, unknown>;
          return loaded;
        } catch {
          // try next module id
        }
      }
      return null;
    })();
  }

  return qmdModulePromise;
}

async function closeQmdStore(): Promise<void> {
  if (!qmdStoreCache) return;
  try {
    await qmdStoreCache.store.close?.();
  } catch {
    // ignore close failures
  }
  qmdStoreCache = null;
}

async function getQmdStore(rootPath: string): Promise<QmdStore | null> {
  if (qmdStoreCache?.rootPath === rootPath) {
    return qmdStoreCache.store;
  }

  await closeQmdStore();
  const moduleValue = await loadQmdModule();
  const createStore =
    (moduleValue?.createStore as
      | ((input: Record<string, unknown>) => Promise<QmdStore>)
      | undefined) ??
    ((moduleValue?.default as Record<string, unknown> | undefined)?.createStore as
      | ((input: Record<string, unknown>) => Promise<QmdStore>)
      | undefined);

  if (!createStore) {
    return null;
  }

  await ensureLocalDirs(rootPath);

  try {
    const store = await createStore({
      dbPath: getMemoryQmdIndexPath(rootPath),
      config: {
        collections: {
          [MEMORY_COLLECTION_NAME]: {
            path: getMemoryConversationsDir(rootPath),
            pattern: '**/*.md',
          },
        },
      },
    });
    qmdStoreCache = { rootPath, store };
    return store;
  } catch {
    return null;
  }
}

function resolveEmosApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/v0') || trimmed.endsWith('/api/v1')) {
    return trimmed;
  }
  if (trimmed.includes('api.evermind.ai')) {
    return `${trimmed}/api/v0`;
  }
  return `${trimmed}/api/v1`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function callEverMemApi(
  method: string,
  resource: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<unknown> {
  const settings = await getEmosSettings();
  const baseUrl = resolveEmosApiBase(settings.baseUrl);
  const apiKey = normalizeString(settings.apiKey);
  if (!baseUrl || !apiKey) {
    throw new Error('EverMemOS backend is not configured');
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && `${item}`.trim()) {
          query.append(key, String(item));
        }
      }
      continue;
    }
    query.append(key, String(value));
  }

  const url = `${baseUrl}${resource}${query.size > 0 ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(
      `EverMemOS request failed (${response.status}) ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
    );
  }
  return payload;
}

function selectMemoryDocumentColumns(tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `
    ${prefix}id,
    ${prefix}backend AS backend,
    ${prefix}document_type AS documentType,
    ${prefix}group_id AS groupId,
    ${prefix}group_name AS groupName,
    ${prefix}source_platform AS sourcePlatform,
    ${prefix}conversation_id AS conversationId,
    ${prefix}title AS title,
    ${prefix}source_url AS sourceUrl,
    ${prefix}file_path AS filePath,
    ${prefix}relative_path AS relativePath,
    ${prefix}content_hash AS contentHash,
    ${prefix}metadata AS metadata,
    ${prefix}message_count AS messageCount,
    ${prefix}created_at AS createdAt,
    ${prefix}updated_at AS updatedAt,
    ${prefix}deleted_at AS deletedAt
  `;
}

function selectMemoryMessageColumns(tableAlias?: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `
    ${prefix}id,
    ${prefix}document_id AS documentId,
    ${prefix}group_id AS groupId,
    ${prefix}sender AS sender,
    ${prefix}sender_name AS senderName,
    ${prefix}role AS role,
    ${prefix}content AS content,
    ${prefix}create_time AS createTime,
    ${prefix}source_url AS sourceUrl,
    ${prefix}source_platform AS sourcePlatform,
    ${prefix}conversation_id AS conversationId,
    ${prefix}refer_list AS referList,
    ${prefix}metadata AS metadata,
    ${prefix}message_index AS messageIndex,
    ${prefix}deleted_at AS deletedAt,
    ${prefix}created_at AS createdAt,
    ${prefix}updated_at AS updatedAt
  `;
}

function getDocumentLocation(
  message: MemoryWireMessage,
  rootPath: string,
): {
  documentId: string;
  groupId: string;
  groupName: string | null;
  sourcePlatform: string;
  conversationId: string;
  title: string;
  sourceUrl: string | null;
  relativePath: string;
  absolutePath: string;
} {
  const groupId = normalizeString(message.group_id) || `memory:${message.message_id}`;
  const sourcePlatform =
    normalizeString(message.source_platform) ||
    (groupId.includes(':') ? groupId.split(':')[0] : 'memory');
  const conversationId =
    normalizeString(message.conversation_id) ||
    (groupId.includes(':') ? groupId.split(':').slice(1).join(':') : groupId) ||
    message.message_id;
  const platformSlug = slugSegment(sourcePlatform, 'memory');
  const conversationSlug = slugSegment(conversationId, 'conversation');
  const relativePath = path.join(MEMORY_COLLECTION_NAME, platformSlug, `${conversationSlug}.md`);

  return {
    documentId: `conversation:${platformSlug}:${conversationSlug}`,
    groupId,
    groupName: trimOrNull(message.group_name),
    sourcePlatform,
    conversationId,
    title: trimOrNull(message.group_name) ?? conversationId,
    sourceUrl: trimOrNull(message.source_url),
    relativePath,
    absolutePath: path.join(rootPath, relativePath),
  };
}

function extractMessageIndex(message: MemoryWireMessage): number | null {
  const rawIndex = (message.metadata as Record<string, unknown> | undefined)?.message_index;
  if (typeof rawIndex === 'number' && Number.isFinite(rawIndex)) {
    return Math.floor(rawIndex);
  }
  const match = /:(\d+)$/.exec(normalizeString(message.message_id));
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function toConversationMarkdownDocument(
  documentRow: MemoryDocumentRow,
  messageRows: MemoryMessageRow[],
): ConversationMarkdownDocument {
  const messages: ConversationMarkdownMessage[] = messageRows.map((row) => ({
    messageId: row.id,
    createdAt: row.createTime,
    sender: row.sender || 'unknown',
    senderName: row.senderName,
    role: row.role,
    content: row.content,
  }));

  return {
    metadata: {
      sessionId: documentRow.id,
      timestamp: documentRow.updatedAt,
      title: documentRow.title ?? undefined,
      description: 'Ruminer memory transcript',
      sourcePlatform: documentRow.sourcePlatform ?? undefined,
      conversationId: documentRow.conversationId ?? undefined,
      groupId: documentRow.groupId ?? undefined,
      groupName: documentRow.groupName ?? undefined,
      sourceUrl: documentRow.sourceUrl ?? undefined,
    },
    messages,
  };
}

function toMemoryItem(
  messageRow: MemoryMessageRow,
  documentRow: MemoryDocumentRow,
  score?: number,
): Record<string, unknown> {
  const metadata = parseJsonObject(messageRow.metadata) ?? {};

  return {
    message_id: messageRow.id,
    event_id: messageRow.id,
    document_id: documentRow.id,
    content: messageRow.content,
    sender: messageRow.sender ?? undefined,
    sender_name: messageRow.senderName ?? undefined,
    role: messageRow.role ?? undefined,
    create_time: messageRow.createTime,
    group_id: messageRow.groupId ?? documentRow.groupId ?? undefined,
    group_name: documentRow.groupName ?? undefined,
    source_url: messageRow.sourceUrl ?? documentRow.sourceUrl ?? undefined,
    metadata: {
      ...metadata,
      backend: documentRow.backend,
      document_type: documentRow.documentType,
      source_platform: messageRow.sourcePlatform ?? documentRow.sourcePlatform ?? undefined,
      conversation_id: messageRow.conversationId ?? documentRow.conversationId ?? undefined,
      relative_path: documentRow.relativePath,
      file_path: documentRow.filePath,
      ...(typeof score === 'number' ? { score } : {}),
    },
    ...(typeof score === 'number' ? { score } : {}),
  };
}

function matchesTimeRange(
  createTime: string,
  startTime: string | null,
  endTime: string | null,
): boolean {
  const created = Date.parse(createTime);
  if (!Number.isFinite(created)) return true;
  const start = startTime ? Date.parse(startTime) : Number.NaN;
  const end = endTime ? Date.parse(endTime) : Number.NaN;
  if (Number.isFinite(start) && created < start) return false;
  if (Number.isFinite(end) && created > end) return false;
  return true;
}

async function maybeBackupFileToTrash(
  filePath: string,
  documentId: string,
  rootPath: string,
): Promise<void> {
  try {
    const trashDir = getMemoryTrashDir(rootPath);
    await mkdir(trashDir, { recursive: true });
    const ext = path.extname(filePath) || '.md';
    const base = slugSegment(documentId, 'memory-document');
    await copyFile(filePath, path.join(trashDir, `${base}-${Date.now()}${ext}`));
  } catch {
    // best effort only
  }
}

async function writeDocumentFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

async function removeDocumentFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // ignore missing files
  }
}

async function getLocalDocumentById(documentId: string): Promise<MemoryDocumentRow | null> {
  const db = getDb();
  const row =
    db.get<MemoryDocumentRow>(
      `SELECT ${selectMemoryDocumentColumns()} FROM memory_documents WHERE id = ?`,
      [documentId],
    ) ?? null;
  return row;
}

async function getLocalMessagesByDocumentId(documentId: string): Promise<MemoryMessageRow[]> {
  const db = getDb();
  return db.all<MemoryMessageRow>(
    `SELECT ${selectMemoryMessageColumns()}
     FROM memory_messages
     WHERE document_id = ? AND deleted_at IS NULL
     ORDER BY COALESCE(message_index, 2147483647) ASC, datetime(create_time) ASC, id ASC`,
    [documentId],
  );
}

async function getLocalDocumentsByIds(
  documentIds: string[],
): Promise<Map<string, MemoryDocumentRow>> {
  if (documentIds.length === 0) {
    return new Map();
  }

  const db = getDb();
  const placeholders = documentIds.map(() => '?').join(', ');
  const rows = db.all<MemoryDocumentRow>(
    `SELECT ${selectMemoryDocumentColumns()} FROM memory_documents WHERE id IN (${placeholders})`,
    documentIds,
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function persistLocalDocument(
  documentId: string,
): Promise<{ filePath: string; contentHash: string; messageCount: number }> {
  const documentRow = await getLocalDocumentById(documentId);
  if (!documentRow) {
    throw new Error(`Memory document not found: ${documentId}`);
  }

  const messages = await getLocalMessagesByDocumentId(documentId);
  if (messages.length === 0) {
    await removeDocumentFile(documentRow.filePath);
    return { filePath: documentRow.filePath, contentHash: '', messageCount: 0 };
  }

  const markdown = renderConversationMarkdown(
    toConversationMarkdownDocument(documentRow, messages),
  );
  const contentHash = computeContentHash(markdown);
  await writeDocumentFile(documentRow.filePath, markdown);
  return {
    filePath: documentRow.filePath,
    contentHash,
    messageCount: messages.length,
  };
}

async function upsertLocalMemory(message: MemoryWireMessage): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  const rootPath = settings.localRootPath;
  await ensureLocalDirs(rootPath);

  const db = getDb();
  const now = new Date().toISOString();
  const documentLocation = getDocumentLocation(message, rootPath);

  db.run(
    `INSERT INTO memory_documents (
       id, backend, document_type, group_id, group_name, source_platform, conversation_id,
       title, source_url, file_path, relative_path, content_hash, metadata, message_count,
       created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       backend = excluded.backend,
       document_type = excluded.document_type,
       group_id = excluded.group_id,
       group_name = excluded.group_name,
       source_platform = excluded.source_platform,
       conversation_id = excluded.conversation_id,
       title = excluded.title,
       source_url = excluded.source_url,
       file_path = excluded.file_path,
       relative_path = excluded.relative_path,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [
      documentLocation.documentId,
      'local_markdown_qmd',
      'conversation',
      documentLocation.groupId,
      documentLocation.groupName,
      documentLocation.sourcePlatform,
      documentLocation.conversationId,
      documentLocation.title,
      documentLocation.sourceUrl,
      documentLocation.absolutePath,
      documentLocation.relativePath,
      '',
      JSON.stringify(message.metadata ?? {}),
      0,
      now,
      now,
    ],
  );

  db.run(
    `INSERT INTO memory_messages (
       id, document_id, group_id, sender, sender_name, role, content, create_time,
       source_url, source_platform, conversation_id, refer_list, metadata, message_index,
       deleted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       document_id = excluded.document_id,
       group_id = excluded.group_id,
       sender = excluded.sender,
       sender_name = excluded.sender_name,
       role = excluded.role,
       content = excluded.content,
       create_time = excluded.create_time,
       source_url = excluded.source_url,
       source_platform = excluded.source_platform,
       conversation_id = excluded.conversation_id,
       refer_list = excluded.refer_list,
       metadata = excluded.metadata,
       message_index = excluded.message_index,
       deleted_at = NULL,
       updated_at = excluded.updated_at`,
    [
      message.message_id,
      documentLocation.documentId,
      documentLocation.groupId,
      normalizeString(message.sender) || null,
      trimOrNull(message.sender_name),
      trimOrNull(message.role),
      message.content,
      toIso(message.create_time, now),
      documentLocation.sourceUrl,
      documentLocation.sourcePlatform,
      documentLocation.conversationId,
      JSON.stringify(message.refer_list ?? []),
      JSON.stringify(message.metadata ?? {}),
      extractMessageIndex(message),
      now,
      now,
    ],
  );

  const persisted = await persistLocalDocument(documentLocation.documentId);
  db.run(
    `UPDATE memory_documents
       SET content_hash = ?, message_count = ?, updated_at = ?, deleted_at = NULL
     WHERE id = ?`,
    [persisted.contentHash, persisted.messageCount, now, documentLocation.documentId],
  );

  await closeQmdStore();

  return {
    ok: true,
    backend: 'local_markdown_qmd',
    message_id: message.message_id,
    document_id: documentLocation.documentId,
    file_path: persisted.filePath,
  };
}

async function searchWithQmd(
  rootPath: string,
  query: string,
  limit: number,
): Promise<Array<{ relativePath: string; score: number }>> {
  const store = await getQmdStore(rootPath);
  if (!store?.search) return [];

  try {
    const raw = await store.search({
      query,
      collection: MEMORY_COLLECTION_NAME,
      limit,
    });
    const results = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as Record<string, unknown> | null)?.results)
        ? (((raw as Record<string, unknown>).results as unknown[]) ?? [])
        : [];

    return results
      .map((entry) => entry as QmdSearchResult)
      .map((entry) => {
        const file = normalizeString(entry.file) || normalizeString(entry.displayPath);
        const score =
          typeof entry.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0;
        return {
          relativePath: file.replace(/\\/g, '/').replace(/^\.\//, ''),
          score,
        };
      })
      .filter((entry) => entry.relativePath.length > 0);
  } catch {
    return [];
  }
}

async function runLocalRead(queryInput: MemoryQueryInput): Promise<Record<string, unknown>> {
  const limit = normalizeLimit(queryInput.limit, 50);
  const offset = normalizeOffset(queryInput.offset);
  const userId = trimOrNull(queryInput.user_id);
  const groupId = trimOrNull(queryInput.group_id);
  const startTime = trimOrNull(queryInput.start_time);
  const endTime = trimOrNull(queryInput.end_time);

  const db = getDb();
  const params: Array<string | number> = [];
  let whereSql = 'WHERE m.deleted_at IS NULL AND d.deleted_at IS NULL';

  if (userId) {
    whereSql += ' AND m.sender = ?';
    params.push(userId);
  }
  if (groupId) {
    whereSql += ' AND d.group_id = ?';
    params.push(groupId);
  }
  if (startTime) {
    whereSql += ' AND datetime(m.create_time) >= datetime(?)';
    params.push(startTime);
  }
  if (endTime) {
    whereSql += ' AND datetime(m.create_time) <= datetime(?)';
    params.push(endTime);
  }

  const rows = db.all<MemoryMessageRow>(
    `SELECT ${selectMemoryMessageColumns('m')}
     FROM memory_messages m
     JOIN memory_documents d ON d.id = m.document_id
     ${whereSql}
     ORDER BY datetime(m.create_time) DESC, m.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const docsById = await getLocalDocumentsByIds(
    Array.from(new Set(rows.map((row) => row.documentId))),
  );
  const memories = rows
    .map((row) => {
      const doc = docsById.get(row.documentId);
      return doc ? toMemoryItem(row, doc) : null;
    })
    .filter((value): value is Record<string, unknown> => Boolean(value));
  return {
    memories,
    total: memories.length,
    backend: 'local_markdown_qmd',
  };
}

async function runLocalSearch(queryInput: MemoryQueryInput): Promise<Record<string, unknown>> {
  const query = normalizeString(queryInput.query);
  if (!query) {
    return runLocalRead(queryInput);
  }

  const settings = await getMemorySettings();
  const rootPath = settings.localRootPath;
  const limit = normalizeLimit(queryInput.limit, 10);
  const userId = trimOrNull(queryInput.user_id);
  const groupId = trimOrNull(queryInput.group_id);
  const startTime = trimOrNull(queryInput.start_time);
  const endTime = trimOrNull(queryInput.end_time);
  const db = getDb();

  const qmdMatches = await searchWithQmd(rootPath, query, Math.max(limit, 10));
  if (qmdMatches.length > 0) {
    const relativePaths = qmdMatches.map((match) => match.relativePath);
    const placeholders = relativePaths.map(() => '?').join(', ');
    const documentRows = db.all<MemoryDocumentRow>(
      `SELECT ${selectMemoryDocumentColumns()}
       FROM memory_documents
       WHERE deleted_at IS NULL AND relative_path IN (${placeholders})`,
      relativePaths,
    );

    const documentsByPath = new Map(
      documentRows.map((row) => [row.relativePath.replace(/\\/g, '/'), row]),
    );
    const matchedDocumentIds = qmdMatches
      .map((match) => documentsByPath.get(match.relativePath)?.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (matchedDocumentIds.length > 0) {
      const messagePlaceholders = matchedDocumentIds.map(() => '?').join(', ');
      const messageRows = db.all<MemoryMessageRow>(
        `SELECT ${selectMemoryMessageColumns()}
         FROM memory_messages
         WHERE deleted_at IS NULL AND document_id IN (${messagePlaceholders})`,
        matchedDocumentIds,
      );

      const scoreByDocumentId = new Map<string, number>();
      for (const match of qmdMatches) {
        const doc = documentsByPath.get(match.relativePath);
        if (doc) {
          scoreByDocumentId.set(doc.id, match.score);
        }
      }

      const docsById = new Map(documentRows.map((row) => [row.id, row]));
      const filtered = messageRows
        .filter((row) => {
          const doc = docsById.get(row.documentId);
          if (!doc) return false;
          if (userId && row.sender !== userId) return false;
          if (groupId && doc.groupId !== groupId) return false;
          return matchesTimeRange(row.createTime, startTime, endTime);
        })
        .sort((left, right) => {
          const leftScore = scoreByDocumentId.get(left.documentId) ?? 0;
          const rightScore = scoreByDocumentId.get(right.documentId) ?? 0;
          if (rightScore !== leftScore) return rightScore - leftScore;
          return Date.parse(right.createTime) - Date.parse(left.createTime);
        })
        .slice(0, limit);

      if (filtered.length > 0) {
        return {
          memories: filtered.map((row) =>
            toMemoryItem(row, docsById.get(row.documentId)!, scoreByDocumentId.get(row.documentId)),
          ),
          total: filtered.length,
          backend: 'local_markdown_qmd',
        };
      }
    }
  }

  const likeValue = buildLikeValue(query);
  const params: Array<string | number> = [];
  let whereSql = 'WHERE m.deleted_at IS NULL AND d.deleted_at IS NULL';
  if (userId) {
    whereSql += ' AND m.sender = ?';
    params.push(userId);
  }
  if (groupId) {
    whereSql += ' AND d.group_id = ?';
    params.push(groupId);
  }
  if (startTime) {
    whereSql += ' AND datetime(m.create_time) >= datetime(?)';
    params.push(startTime);
  }
  if (endTime) {
    whereSql += ' AND datetime(m.create_time) <= datetime(?)';
    params.push(endTime);
  }
  whereSql +=
    " AND (LOWER(m.content) LIKE ? OR LOWER(COALESCE(d.title, '')) LIKE ? OR LOWER(COALESCE(d.group_name, '')) LIKE ?)";
  params.push(likeValue, likeValue, likeValue);

  const rows = db.all<MemoryMessageRow>(
    `SELECT ${selectMemoryMessageColumns('m')}
     FROM memory_messages m
     JOIN memory_documents d ON d.id = m.document_id
     ${whereSql}
     ORDER BY datetime(m.create_time) DESC, m.id DESC
     LIMIT ?`,
    [...params, limit],
  );

  const docsById = await getLocalDocumentsByIds(
    Array.from(new Set(rows.map((row) => row.documentId))),
  );
  return {
    memories: rows
      .map((row) => {
        const doc = docsById.get(row.documentId);
        return doc ? toMemoryItem(row, doc) : null;
      })
      .filter((value): value is Record<string, unknown> => Boolean(value)),
    total: rows.length,
    backend: 'local_markdown_qmd',
  };
}

async function deleteLocalMemory(filters: MemoryDeleteInput): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  const rootPath = settings.localRootPath;
  const db = getDb();
  const now = new Date().toISOString();
  const messageId = trimOrNull(filters.message_id) ?? trimOrNull(filters.event_id);
  const documentId = trimOrNull(filters.document_id);
  const groupId = trimOrNull(filters.group_id);

  if (messageId) {
    const messageRow = db.get<MemoryMessageRow>(
      `SELECT ${selectMemoryMessageColumns()} FROM memory_messages WHERE id = ? AND deleted_at IS NULL`,
      [messageId],
    );
    if (!messageRow) {
      return { ok: true, backend: 'local_markdown_qmd', deleted: 0 };
    }

    const docRow = await getLocalDocumentById(messageRow.documentId);
    if (!docRow) {
      return { ok: true, backend: 'local_markdown_qmd', deleted: 0 };
    }

    await maybeBackupFileToTrash(docRow.filePath, docRow.id, rootPath);
    db.run('UPDATE memory_messages SET deleted_at = ?, updated_at = ? WHERE id = ?', [
      now,
      now,
      messageId,
    ]);

    const remaining = await getLocalMessagesByDocumentId(docRow.id);
    if (remaining.length === 0) {
      db.run(
        'UPDATE memory_documents SET deleted_at = ?, updated_at = ?, message_count = 0, content_hash = ? WHERE id = ?',
        [now, now, '', docRow.id],
      );
      await removeDocumentFile(docRow.filePath);
    } else {
      const persisted = await persistLocalDocument(docRow.id);
      db.run(
        'UPDATE memory_documents SET updated_at = ?, message_count = ?, content_hash = ? WHERE id = ?',
        [now, persisted.messageCount, persisted.contentHash, docRow.id],
      );
    }

    await closeQmdStore();
    return { ok: true, backend: 'local_markdown_qmd', deleted: 1, document_ids: [docRow.id] };
  }

  if (documentId || groupId) {
    const params: string[] = [];
    let whereSql = 'WHERE deleted_at IS NULL';
    if (documentId) {
      whereSql += ' AND id = ?';
      params.push(documentId);
    }
    if (groupId) {
      whereSql += ' AND group_id = ?';
      params.push(groupId);
    }

    const docs = db.all<MemoryDocumentRow>(
      `SELECT ${selectMemoryDocumentColumns()} FROM memory_documents ${whereSql}`,
      params,
    );

    for (const doc of docs) {
      await maybeBackupFileToTrash(doc.filePath, doc.id, rootPath);
      db.run(
        'UPDATE memory_messages SET deleted_at = ?, updated_at = ? WHERE document_id = ? AND deleted_at IS NULL',
        [now, now, doc.id],
      );
      db.run(
        'UPDATE memory_documents SET deleted_at = ?, updated_at = ?, message_count = 0, content_hash = ? WHERE id = ?',
        [now, now, '', doc.id],
      );
      await removeDocumentFile(doc.filePath);
    }

    await closeQmdStore();
    return {
      ok: true,
      backend: 'local_markdown_qmd',
      deleted: docs.length,
      document_ids: docs.map((doc) => doc.id),
    };
  }

  return { ok: true, backend: 'local_markdown_qmd', deleted: 0 };
}

async function getLocalMemoryStatus(): Promise<MemoryStatus> {
  const settings = await getMemorySettings();
  const db = getDb();
  const docCount = db.get<{ count?: number }>(
    'SELECT COUNT(*) AS count FROM memory_documents WHERE deleted_at IS NULL',
  )?.count;
  const messageCount = db.get<{ count?: number }>(
    'SELECT COUNT(*) AS count FROM memory_messages WHERE deleted_at IS NULL',
  )?.count;
  const qmdAvailable = Boolean(await loadQmdModule());

  return {
    backend: 'local_markdown_qmd',
    configured: true,
    localRootPath: settings.localRootPath,
    qmdIndexPath: getMemoryQmdIndexPath(settings.localRootPath),
    qmdAvailable,
    qmdEnabled: qmdAvailable,
    totalDocuments: typeof docCount === 'number' ? docCount : 0,
    totalMessages: typeof messageCount === 'number' ? messageCount : 0,
    updatedAt: settings.updatedAt,
  };
}

async function reindexLocalMemory(): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  await closeQmdStore();
  const store = await getQmdStore(settings.localRootPath);
  const status = await getLocalMemoryStatus();
  return {
    ok: true,
    backend: 'local_markdown_qmd',
    qmdIndexed: Boolean(store),
    qmdAvailable: status.qmdAvailable,
    documentCount: status.totalDocuments,
  };
}

export async function getMemoryStatus(): Promise<MemoryStatus> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    const emos = await getEmosSettings();
    return {
      backend: 'evermemos',
      configured: Boolean(normalizeString(emos.baseUrl) && normalizeString(emos.apiKey)),
      localRootPath: settings.localRootPath,
      qmdIndexPath: getMemoryQmdIndexPath(settings.localRootPath),
      qmdAvailable: false,
      qmdEnabled: false,
      totalDocuments: 0,
      totalMessages: 0,
      updatedAt: settings.updatedAt,
    };
  }

  return getLocalMemoryStatus();
}

export async function upsertMemory(message: MemoryWireMessage): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    const result = await callEverMemApi('POST', '/memories', { body: message });
    return {
      ok: true,
      backend: 'evermemos',
      result,
    };
  }

  return upsertLocalMemory(message);
}

export async function readMemories(queryInput: MemoryQueryInput): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    const result = await callEverMemApi('GET', '/memories', { query: queryInput });
    return {
      ...(result && typeof result === 'object' ? (result as Record<string, unknown>) : { result }),
      backend: 'evermemos',
    };
  }

  return runLocalRead(queryInput);
}

export async function searchMemories(
  queryInput: MemoryQueryInput,
): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    const result = await callEverMemApi('GET', '/memories/search', { query: queryInput });
    return {
      ...(result && typeof result === 'object' ? (result as Record<string, unknown>) : { result }),
      backend: 'evermemos',
    };
  }

  return runLocalSearch(queryInput);
}

export async function deleteMemory(filters: MemoryDeleteInput): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    const body: Record<string, unknown> = {};
    const eventId = trimOrNull(filters.event_id) ?? trimOrNull(filters.message_id);
    if (eventId) body.event_id = eventId;
    if (trimOrNull(filters.user_id)) body.user_id = trimOrNull(filters.user_id);
    if (trimOrNull(filters.group_id)) body.group_id = trimOrNull(filters.group_id);

    const result = await callEverMemApi('DELETE', '/memories', { body });
    return {
      ok: true,
      backend: 'evermemos',
      result,
    };
  }

  return deleteLocalMemory(filters);
}

export async function reindexMemories(): Promise<Record<string, unknown>> {
  const settings = await getMemorySettings();
  if (settings.backend === 'evermemos') {
    return {
      ok: true,
      backend: 'evermemos',
      qmdIndexed: false,
      qmdAvailable: false,
      documentCount: 0,
    };
  }

  return reindexLocalMemory();
}
