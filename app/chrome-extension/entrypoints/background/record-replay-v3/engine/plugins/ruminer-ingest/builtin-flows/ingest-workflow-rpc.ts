import { type ChatPlatform } from '@/common/chat-platforms';
import { NOTIFICATIONS, STORAGE_KEYS } from '@/common/constants';

import { createStoragePort } from '@/entrypoints/background/record-replay-v3';
import { getV3Runtime } from '@/entrypoints/background/record-replay-v3/bootstrap';
import { enqueueRun } from '@/entrypoints/background/record-replay-v3/engine/queue/enqueue-run';
import {
  StorageBackedEventsBus,
  type EventsBus,
} from '@/entrypoints/background/record-replay-v3/engine/transport/events-bus';
import { getEmosSettings } from '@/entrypoints/shared/utils/emos-settings';
import { stableJson } from '@/entrypoints/shared/utils/stable-json';

import {
  getConversationEntry,
  getConversationStates,
  upsertConversationEntry,
  type ConversationLedgerEntry,
} from '../conversation-ledger';
import { emosUpsertMemory, type EmosSingleMessage } from '../emos-client';
import { sha256Hex } from '../hash';
import { ensureBuiltinFlows } from './index';

type WorkflowNotifyRequest = {
  type: 'ruminer.workflow.notify';
  title: string;
  message: string;
};

type WorkflowProgressRequest = {
  type: 'ruminer.workflow.progress';
  runId: string;
  flowId?: string;
  payload: unknown;
};

type LedgerGetConversationStatesRequest = {
  type: 'ruminer.ledger.getConversationStates';
  groupIds: string[];
};

type EnqueueRunsRequest = {
  type: 'ruminer.rr_v3.enqueueRuns';
  items: Array<{ flowId: string; args: Record<string, unknown>; priority?: number }>;
};

export type RuminerEnqueueRunItem = EnqueueRunsRequest['items'][number];

type IngestConversationRequest = {
  type: 'ruminer.ingest.ingestConversation';
  platform: ChatPlatform;
  conversationId: string;
  runId?: string | null;
  conversationTitle?: string | null;
  conversationUrl?: string | null;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createTime?: string | null;
    messageId?: string | null;
  }>;
};

type SupportedWorkflowRpcRequest =
  | WorkflowNotifyRequest
  | WorkflowProgressRequest
  | LedgerGetConversationStatesRequest
  | EnqueueRunsRequest
  | IngestConversationRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function trimOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isoOrNow(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

type StoredServerStatus = { isRunning?: boolean; port?: unknown } | null;

async function getNativeServerPort(): Promise<number | null> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.SERVER_STATUS]);
    const status = (stored?.[STORAGE_KEYS.SERVER_STATUS] ?? null) as StoredServerStatus;
    const isRunning = status?.isRunning === true;
    const rawPort = status?.port;
    const port =
      typeof rawPort === 'number'
        ? rawPort
        : typeof rawPort === 'string'
          ? Number(rawPort)
          : Number.NaN;
    if (!isRunning || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
    return Math.floor(port);
  } catch {
    return null;
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content !== 'string') return '';
  return content.replace(/\r\n/g, '\n').trim();
}

function platformLabel(platform: string): string {
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
      return platform.trim() || 'Bot';
  }
}

function computeSender(role: 'user' | 'assistant'): { sender: 'me' | 'bot'; sender_name: string } {
  return role === 'user'
    ? { sender: 'me', sender_name: 'Me' }
    : { sender: 'bot', sender_name: 'Bot' };
}

function longestCommonPrefixLen(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  for (; i < n; i++) {
    if (a[i] !== b[i]) break;
  }
  return i;
}

async function notify(title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create({
      type: NOTIFICATIONS.TYPE,
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title,
      message,
      priority: NOTIFICATIONS.PRIORITY,
    });
  } catch {
    // ignore (notifications permission may be absent or blocked)
  }
}

let fallbackStoragePort: ReturnType<typeof createStoragePort> | null = null;
let fallbackEventsBus: StorageBackedEventsBus | null = null;
let ensureBuiltinsOnce: Promise<void> | null = null;
const warnedMissingRunId = new Set<string>();
const warnedInferredRunId = new Set<string>();
const warnedAppendRunLogFailure = new Set<string>();

type SenderTabLite = { id?: number } | null | undefined;

async function inferRunIdFromSenderTab(tab: SenderTabLite): Promise<string> {
  const tabId = tab?.id;
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return '';

  try {
    const rt = getV3Runtime();
    const storage =
      rt?.storage ?? fallbackStoragePort ?? (fallbackStoragePort = createStoragePort());
    const runs = await storage.runs.list();

    const candidates = runs
      .filter((r) => r.tabId === tabId)
      .filter((r) => r.status === 'queued' || r.status === 'running' || r.status === 'paused');

    if (candidates.length === 0) return '';

    candidates.sort((a, b) => {
      const aT = (a.updatedAt ?? 0) || (a.startedAt ?? 0) || (a.createdAt ?? 0);
      const bT = (b.updatedAt ?? 0) || (b.startedAt ?? 0) || (b.createdAt ?? 0);
      return bT - aT;
    });

    const best = candidates[0];
    return typeof best?.id === 'string' ? best.id.trim() : '';
  } catch {
    return '';
  }
}

async function ensureBuiltins(
  storage: Pick<ReturnType<typeof createStoragePort>, 'flows'>,
): Promise<void> {
  if (!ensureBuiltinsOnce) {
    ensureBuiltinsOnce = ensureBuiltinFlows(storage);
  }
  try {
    await ensureBuiltinsOnce;
  } catch (error) {
    // Allow retry after a transient storage failure.
    ensureBuiltinsOnce = null;
    throw error;
  }
}

function getEventsAppendOnly(): Pick<EventsBus, 'append'> {
  const rt = getV3Runtime();
  if (rt?.events) return rt.events;

  if (!fallbackStoragePort) fallbackStoragePort = createStoragePort();
  if (!fallbackEventsBus)
    fallbackEventsBus = new StorageBackedEventsBus(fallbackStoragePort.events);
  return fallbackEventsBus;
}

async function appendRunLog(
  runId: string,
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: unknown,
): Promise<void> {
  const rid = runId.trim();
  if (!rid) return;

  try {
    const events = getEventsAppendOnly();
    await events.append({
      runId: rid,
      type: 'log',
      level,
      message,
      ...(data !== undefined ? { data: data as any } : {}),
    });
  } catch (e) {
    // Don’t spam logs; warn once per run.
    if (!warnedAppendRunLogFailure.has(rid)) {
      warnedAppendRunLogFailure.add(rid);
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[ingest-workflow-rpc] appendRunLog failed:', {
        runId: rid,
        message,
        error: msg,
      });
    }
  }
}

async function handleGetConversationStates(
  req: LedgerGetConversationStatesRequest,
): Promise<unknown> {
  const groupIds = isStringList(req.groupIds) ? req.groupIds : [];

  const states = await getConversationStates({
    groupIds,
  });

  return { ok: true, result: states };
}

async function handleEnqueueRuns(req: EnqueueRunsRequest): Promise<unknown> {
  const rt = getV3Runtime();
  const storage = rt?.storage ?? fallbackStoragePort ?? (fallbackStoragePort = createStoragePort());
  const events =
    rt?.events ??
    fallbackEventsBus ??
    (fallbackEventsBus = new StorageBackedEventsBus(storage.events));
  const scheduler = rt?.scheduler;

  try {
    await ensureBuiltins(storage);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Failed to ensure builtin flows: ${msg}` };
  }

  const items = Array.isArray(req.items) ? req.items : [];
  const cleaned = items
    .map((item) => ({
      flowId: toTrimmedString(item?.flowId),
      args: isRecord(item?.args) ? (item.args as Record<string, unknown>) : {},
      priority:
        typeof item?.priority === 'number' && Number.isFinite(item.priority)
          ? Math.floor(item.priority)
          : undefined,
    }))
    .filter((x) => Boolean(x.flowId));

  // Reject obvious self-enqueue / scanner-enqueue mistakes.
  if (
    cleaned.some(
      (x) => x.flowId.includes('.scanner.') || x.flowId.endsWith('.conversation_scan.v1'),
    )
  ) {
    return { ok: false, error: 'Refusing to enqueue scanner flows' };
  }

  const activeItems = (
    await Promise.all([
      storage.queue.list('queued'),
      storage.queue.list('running'),
      storage.queue.list('paused'),
    ])
  ).flat();

  function activeHas(flowId: string, conversationId: string): boolean {
    if (!conversationId) return false;
    return activeItems.some((q) => {
      if (q.flowId !== flowId) return false;
      const cid = isRecord(q.args) ? toTrimmedString((q.args as any).ruminerConversationId) : '';
      return cid === conversationId;
    });
  }

  let enqueued = 0;
  let skippedAsDuplicate = 0;
  const runIds: string[] = [];
  const errors: string[] = [];
  const batchSeen = new Set<string>();

  for (const item of cleaned) {
    const conversationId = toTrimmedString(item.args.ruminerConversationId);
    if (conversationId) {
      const batchKey = `${item.flowId}\n${conversationId}`;
      if (batchSeen.has(batchKey) || activeHas(item.flowId, conversationId)) {
        skippedAsDuplicate += 1;
        continue;
      }
      batchSeen.add(batchKey);
    }

    try {
      const result = await enqueueRun(
        { storage, events, ...(scheduler ? { scheduler } : {}) },
        {
          flowId: item.flowId as any,
          ...(item.priority !== undefined ? { priority: item.priority } : {}),
          maxAttempts: 1,
          args: item.args as any,
        },
      );
      enqueued += 1;
      runIds.push(result.runId);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return {
    ok: errors.length === 0,
    result: { enqueued, skippedAsDuplicate, runIds, errors },
    ...(errors.length ? { error: errors[0] } : {}),
  };
}

async function ingestWithRetry(message: EmosSingleMessage): Promise<void> {
  const maxRetries = 3;
  let delayMs = 500;
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await emosUpsertMemory(message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.ceil(delayMs * 2);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError || 'Unknown ingest error'));
}

async function computeMessageHash(input: {
  role: 'user' | 'assistant';
  content: string;
}): Promise<string> {
  const canonical = stableJson({ content: normalizeContent(input.content), role: input.role });
  return sha256Hex(canonical);
}

function toGroupId(platform: string, conversationId: string): string {
  return `${platform}:${conversationId}`;
}

function normalizePlatformMessageId(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  return raw ? raw : null;
}

function buildEmosMessageId(
  platform: string,
  conversationId: string,
  index: number,
  platformMessageId: string | null,
): string {
  const pid = normalizePlatformMessageId(platformMessageId);
  if (pid) {
    return `${platform}:${pid}`;
  }
  return `${platform}:${conversationId}:${index}`;
}

async function computeHashesDigest(hashes: string[]): Promise<string> {
  return sha256Hex(stableJson(hashes));
}

function ensurePlatform(value: unknown): IngestConversationRequest['platform'] | null {
  const v = toTrimmedString(value).toLowerCase();
  if (v === 'chatgpt' || v === 'gemini' || v === 'claude' || v === 'deepseek') return v;
  return null;
}

async function handleIngestConversation(
  req: IngestConversationRequest,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  const platform = ensurePlatform(req.platform);
  if (!platform) return { ok: false, error: 'Missing/invalid platform' };

  const conversationId = trimOrNull(req.conversationId);
  if (!conversationId) return { ok: false, error: 'Missing conversationId' };

  const requestedRunId = toTrimmedString(req.runId);
  let runId = requestedRunId;
  let inferredRunId = false;
  if (!runId) {
    runId = await inferRunIdFromSenderTab(sender?.tab);
    inferredRunId = Boolean(runId);

    if (!runId) {
      const key = `${platform}:${conversationId}`;
      if (!warnedMissingRunId.has(key)) {
        warnedMissingRunId.add(key);
        console.warn('[ingest-workflow-rpc] Missing runId for ingestConversation message:', {
          platform,
          conversationId,
          senderTabId: sender?.tab?.id,
          senderUrl: sender?.url,
        });
      }
    } else {
      if (!warnedInferredRunId.has(runId)) {
        warnedInferredRunId.add(runId);
        console.warn('[ingest-workflow-rpc] Inferred missing runId from sender tab:', {
          platform,
          conversationId,
          senderTabId: sender?.tab?.id,
          runId,
        });
      }
    }
  }

  try {
    console.debug('[ingest-workflow-rpc] ingestConversation', {
      runId: runId || null,
      inferredRunId,
      platform,
      conversationId,
      senderTabId: sender?.tab?.id,
      senderUrl: sender?.url,
      messageCount: Array.isArray(req.messages) ? req.messages.length : null,
    });
  } catch {
    // ignore
  }

  const settings = await getEmosSettings();
  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    return { ok: false, error: 'EMOS settings incomplete (missing baseUrl/apiKey)' };
  }

  const groupId = toGroupId(platform, conversationId);
  const groupName = trimOrNull(req.conversationTitle);
  const sourceUrl = trimOrNull(req.conversationUrl);

  const messages = Array.isArray(req.messages) ? req.messages : [];
  const normalizedMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createTime: string | null;
    messageId: string | null;
  }> = messages
    .map((m) => ({
      role: (m?.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
      content: normalizeContent(m?.content),
      createTime: trimOrNull(m?.createTime),
      messageId: trimOrNull(m?.messageId),
    }))
    .filter((m) => Boolean(m.content));

  if (normalizedMessages.length === 0) {
    if (runId) {
      await appendRunLog(runId, 'error', 'ruminer.ingest.result', {
        platform,
        conversationId,
        conversationTitle: groupName,
        conversationUrl: sourceUrl,
        sessionId: groupId,
        ...(inferredRunId ? { inferredRunId: true } : {}),
        emos: {
          upserted: 0,
          skipped: 0,
          failed: 0,
          total: 0,
          startIndex: 0,
          errors: ['No messages to ingest'],
        },
        sessionSaveOk: false,
        sessionSaveError: 'No messages to ingest',
      });
    }
    return { ok: false, error: 'No messages to ingest' };
  }

  const nowIso = new Date().toISOString();

  const existing = await getConversationEntry(groupId);
  const existingHashes = Array.isArray(existing?.message_hashes) ? existing!.message_hashes : [];

  const newHashes: string[] = [];
  for (const msg of normalizedMessages) {
    const role = msg.role;
    const content = msg.content;
    newHashes.push(await computeMessageHash({ role, content }));
  }

  const startIndex = longestCommonPrefixLen(existingHashes, newHashes);

  let upserted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = startIndex; i < normalizedMessages.length; i++) {
    const raw = normalizedMessages[i];
    const role = raw.role;
    const content = raw.content;

    const base = computeSender(role);
    const sender =
      role === 'assistant'
        ? { sender: 'bot' as const, sender_name: platformLabel(platform) }
        : base;

    const m: EmosSingleMessage = {
      message_id: buildEmosMessageId(platform, conversationId, i, raw.messageId),
      create_time: isoOrNow(raw.createTime),
      sender: sender.sender,
      sender_name: sender.sender_name,
      content,
      group_id: groupId,
      ...(groupName ? { group_name: groupName } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      role,
    };

    try {
      await ingestWithRetry(m);
      upserted += 1;
    } catch (e) {
      failed += 1;
      errors.push(e instanceof Error ? e.message : String(e));
      // Preserve monotonic, prefix-only progress semantics (avoids holes).
      break;
    }
  }

  if (failed > 0) {
    const progressedHashes = newHashes.slice(0, Math.min(newHashes.length, startIndex + upserted));
    const nextFailed: ConversationLedgerEntry = {
      group_id: groupId,
      platform,
      conversation_id: conversationId,
      conversation_url: sourceUrl,
      conversation_title: groupName,
      status: 'failed',
      message_hashes: progressedHashes,
      message_hashes_digest: await computeHashesDigest(progressedHashes),
      first_seen_at: existing?.first_seen_at ?? nowIso,
      last_seen_at: nowIso,
      last_ingested_at: existing?.last_ingested_at ?? null,
      last_error: errors[0] ?? 'Unknown error',
    };
    await upsertConversationEntry(nextFailed);

    const resultPayload = {
      upserted,
      skipped: startIndex,
      failed,
      total: normalizedMessages.length,
      startIndex,
      errors,
    };

    if (runId) {
      await appendRunLog(runId, 'error', 'ruminer.ingest.result', {
        platform,
        conversationId,
        conversationTitle: groupName,
        conversationUrl: sourceUrl,
        sessionId: groupId,
        ...(inferredRunId ? { inferredRunId: true } : {}),
        emos: resultPayload,
        sessionSaveOk: false,
        sessionSaveError: errors[0] ?? 'Ingest failed',
      });
    }

    return {
      ok: false,
      error: errors[0] ?? 'Ingest failed',
      result: {
        ...resultPayload,
      },
    };
  }

  const emosResult = {
    upserted,
    skipped: startIndex,
    failed: 0,
    total: normalizedMessages.length,
    startIndex,
    errors: [],
  };

  const nextOk: ConversationLedgerEntry = {
    group_id: groupId,
    platform,
    conversation_id: conversationId,
    conversation_url: sourceUrl,
    conversation_title: groupName,
    status: 'ingested',
    message_hashes: newHashes,
    message_hashes_digest: await computeHashesDigest(newHashes),
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
    last_ingested_at: nowIso,
    last_error: null,
  };

  // Persist ingested conversations as agent sessions in native-server (Imported Conversations project).
  // Only mark ledger as "ingested" after session save succeeds to preserve retry semantics.
  let sessionSaveOk = false;
  let sessionSaveError: string | null = null;
  let sessionSaveResult: { projectId: string; sessionId: string; messageCount: number } | null =
    null;

  try {
    const port = await getNativeServerPort();
    if (!port) {
      throw new Error('Native server not running; cannot save session');
    }

    const url = `http://127.0.0.1:${port}/agent/session/ingest`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        platform,
        conversationId,
        conversationTitle: groupName,
        conversationUrl: sourceUrl,
        messages: normalizedMessages,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(text || `HTTP ${resp.status}`);
    }

    const payload = (await resp.json().catch(() => null)) as any;
    if (!payload || payload.ok !== true) {
      const err = payload && payload.error ? String(payload.error) : 'Unknown session save error';
      throw new Error(err);
    }

    sessionSaveOk = true;
    sessionSaveResult = {
      projectId: String(payload.projectId || ''),
      sessionId: String(payload.sessionId || groupId),
      messageCount: Number(payload.messageCount || 0),
    };

    // Notify UI to refresh sessions immediately (avoid minutes-long stale list).
    try {
      const maybePromise = chrome.runtime.sendMessage({
        type: 'ruminer.agent.sessions.invalidate',
      });
      if (maybePromise && typeof (maybePromise as any).catch === 'function') {
        (maybePromise as any).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  } catch (e) {
    sessionSaveOk = false;
    sessionSaveError = e instanceof Error ? e.message : String(e);
  }

  if (!sessionSaveOk) {
    const nextFailed: ConversationLedgerEntry = {
      group_id: groupId,
      platform,
      conversation_id: conversationId,
      conversation_url: sourceUrl,
      conversation_title: groupName,
      status: 'failed',
      message_hashes: newHashes,
      message_hashes_digest: await computeHashesDigest(newHashes),
      first_seen_at: existing?.first_seen_at ?? nowIso,
      last_seen_at: nowIso,
      last_ingested_at: nowIso,
      last_error: sessionSaveError || 'Failed to save session',
    };
    await upsertConversationEntry(nextFailed);
  } else {
    await upsertConversationEntry(nextOk);
  }

  if (runId) {
    await appendRunLog(runId, sessionSaveOk ? 'info' : 'error', 'ruminer.ingest.result', {
      platform,
      conversationId,
      conversationTitle: groupName,
      conversationUrl: sourceUrl,
      sessionId: groupId,
      ...(inferredRunId ? { inferredRunId: true } : {}),
      ...(sessionSaveResult ? { session: sessionSaveResult } : {}),
      emos: emosResult,
      sessionSaveOk,
      ...(sessionSaveError ? { sessionSaveError } : {}),
    });
  }

  if (!sessionSaveOk) {
    return {
      ok: false,
      error: sessionSaveError || 'Failed to save session',
      result: {
        ...emosResult,
      },
    };
  }

  return {
    ok: true,
    result: { ...emosResult, ...(sessionSaveResult ? { session: sessionSaveResult } : {}) },
  };
}

export async function ruminerEnqueueRuns(items: RuminerEnqueueRunItem[]): Promise<
  | {
      ok: true;
      result: { enqueued: number; skippedAsDuplicate: number; errors: string[]; runIds: string[] };
    }
  | { ok: false; error: string }
> {
  const resp = await handleEnqueueRuns({
    type: 'ruminer.rr_v3.enqueueRuns',
    items: Array.isArray(items) ? items : [],
  });

  if (!isRecord(resp) || (resp as any).ok !== true) {
    return {
      ok: false,
      error:
        isRecord(resp) && typeof (resp as any).error === 'string'
          ? (resp as any).error
          : 'enqueueRuns failed',
    };
  }

  const result = isRecord((resp as any).result) ? ((resp as any).result as any) : {};
  return {
    ok: true,
    result: {
      enqueued: typeof result.enqueued === 'number' ? result.enqueued : 0,
      skippedAsDuplicate:
        typeof result.skippedAsDuplicate === 'number' ? result.skippedAsDuplicate : 0,
      errors: Array.isArray(result.errors) ? result.errors.map((e: any) => String(e)) : [],
      runIds: Array.isArray(result.runIds) ? result.runIds.map((r: any) => String(r)) : [],
    },
  };
}

export async function ruminerIngestConversation(
  input: Omit<IngestConversationRequest, 'type'>,
  sender?: chrome.runtime.MessageSender,
): Promise<unknown> {
  return handleIngestConversation(
    {
      type: 'ruminer.ingest.ingestConversation',
      platform: input.platform,
      conversationId: input.conversationId,
      ...(input.runId !== undefined ? { runId: input.runId } : {}),
      ...(input.conversationTitle !== undefined
        ? { conversationTitle: input.conversationTitle }
        : {}),
      ...(input.conversationUrl !== undefined ? { conversationUrl: input.conversationUrl } : {}),
      messages: input.messages,
    },
    sender,
  );
}

function isSupportedWorkflowRpcRequest(message: unknown): message is SupportedWorkflowRpcRequest {
  if (!isRecord(message) || typeof message.type !== 'string') return false;
  return (
    message.type === 'ruminer.workflow.notify' ||
    message.type === 'ruminer.workflow.progress' ||
    message.type === 'ruminer.ledger.getConversationStates' ||
    message.type === 'ruminer.rr_v3.enqueueRuns' ||
    message.type === 'ruminer.ingest.ingestConversation'
  );
}

export function initIngestWorkflowRpc(): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isSupportedWorkflowRpcRequest(message)) {
      return false;
    }

    const req = message as SupportedWorkflowRpcRequest;

    (async () => {
      switch (req.type) {
        case 'ruminer.workflow.notify': {
          await notify(toTrimmedString(req.title) || 'Workflow', toTrimmedString(req.message));
          return { ok: true };
        }

        case 'ruminer.workflow.progress': {
          const runId = toTrimmedString(req.runId);
          const payload = req.payload;
          if (runId) {
            await appendRunLog(runId, 'info', 'workflow.progress', {
              ...(req.flowId ? { flowId: toTrimmedString(req.flowId) } : {}),
              payload,
            });
          }
          return { ok: true };
        }

        case 'ruminer.ledger.getConversationStates':
          return handleGetConversationStates(req);

        case 'ruminer.rr_v3.enqueueRuns':
          return handleEnqueueRuns(req);

        case 'ruminer.ingest.ingestConversation':
          return handleIngestConversation(req, sender);

        default:
          return { ok: false, error: `Unknown message type: ${(req as any).type}` };
      }
    })()
      .then((resp) => sendResponse(resp))
      .catch((e) =>
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );

    return true;
  });
}
