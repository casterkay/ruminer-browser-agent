import { NOTIFICATIONS } from '@/common/constants';

import { getEmosSettings } from '@/entrypoints/shared/utils/emos-settings';

import { emosUpsertMemory, type EmosSingleMessage } from '../emos-client';
import { computeCanonicalHashes } from '../hash';
import { getLedgerEntry, hasAnyLedgerEntryForGroup, upsertLedgerEntry } from '../ingestion-ledger';
import { toFailedLedgerEntry } from '../ledger-policy';

type LedgerHasAnyForGroupsRequest = {
  type: 'ruminer.ledger.hasAnyForGroups';
  groupIds: string[];
};

type WorkflowNotifyRequest = {
  type: 'ruminer.workflow.notify';
  title: string;
  message: string;
};

type ChatgptIngestConversationRequest = {
  type: 'ruminer.chatgpt.ingestConversation';
  platform: 'chatgpt';
  conversationId: string;
  conversationTitle?: string | null;
  conversationUrl?: string | null;
  conversationUpdateTime?: number | null;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    createTime?: string | null;
  }>;
};

type SupportedWorkflowRpcRequest =
  | LedgerHasAnyForGroupsRequest
  | WorkflowNotifyRequest
  | ChatgptIngestConversationRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function trimOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isoOrNow(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function computeSender(role: 'user' | 'assistant'): { sender: 'me' | 'bot'; sender_name: string } {
  return role === 'user'
    ? { sender: 'me', sender_name: 'Me' }
    : { sender: 'bot', sender_name: 'ChatGPT' };
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

async function ingestChatgptConversation(req: ChatgptIngestConversationRequest): Promise<
  | {
      ok: true;
      result: {
        ingested: number;
        updated: number;
        skipped: number;
        failed: number;
        total: number;
        errors: string[];
      };
    }
  | { ok: false; error: string }
> {
  const conversationId = trimOrNull(req.conversationId);
  if (!conversationId) return { ok: false, error: 'Missing conversationId' };

  const settings = await getEmosSettings();
  if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
    return { ok: false, error: 'EMOS settings incomplete (missing baseUrl/apiKey)' };
  }

  const messages = Array.isArray(req.messages) ? req.messages : [];
  if (messages.length === 0) {
    return {
      ok: true,
      result: { ingested: 0, updated: 0, skipped: 0, failed: 0, total: 0, errors: [] },
    };
  }

  const groupId = `chatgpt:${conversationId}`;
  const groupName = trimOrNull(req.conversationTitle);
  const sourceUrl = trimOrNull(req.conversationUrl);

  let ingested = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

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
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
    const m = messages[messageIndex];
    const role = m?.role === 'user' || m?.role === 'assistant' ? m.role : null;
    if (!role) {
      skipped += 1;
      continue;
    }

    const content = typeof m?.content === 'string' ? m.content.trim() : '';
    if (!content) {
      skipped += 1;
      continue;
    }

    const { sender, sender_name } = computeSender(role);
    const { item_key, content_hash } = await computeCanonicalHashes({
      platform: 'chatgpt',
      conversationId,
      messageIndex,
      content,
    });

    const candidate = {
      item_key,
      content_hash,
      source_url: sourceUrl,
      group_id: groupId,
      sender,
      evermemos_message_id: item_key,
    };

    const existing = await getLedgerEntry(item_key);
    const shouldIngest = !existing || existing.content_hash !== content_hash;
    const action: 'ingest' | 'update' | 'skip' = !existing
      ? 'ingest'
      : existing.content_hash !== content_hash
        ? 'update'
        : 'skip';

    if (!shouldIngest) {
      await upsertLedgerEntry({
        item_key,
        content_hash,
        source_url: sourceUrl,
        group_id: groupId,
        sender,
        evermemos_message_id: item_key,
        first_seen_at: existing?.first_seen_at ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        last_ingested_at: existing?.last_ingested_at ?? null,
        status: 'skipped',
        last_error: null,
      });
      skipped += 1;
      continue;
    }

    const emosMessage: EmosSingleMessage = {
      message_id: item_key,
      create_time: isoOrNow(m?.createTime),
      sender,
      sender_name,
      content,
      group_id: groupId,
      ...(groupName ? { group_name: groupName } : {}),
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      role,
      refer_list: undefined,
    };

    try {
      await ingestWithRetry(emosMessage);
      await upsertLedgerEntry({
        item_key,
        content_hash,
        source_url: sourceUrl,
        group_id: groupId,
        sender,
        evermemos_message_id: item_key,
        first_seen_at: existing?.first_seen_at ?? new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        last_ingested_at: new Date().toISOString(),
        status: 'ingested',
        last_error: null,
      });

      if (action === 'ingest') ingested += 1;
      if (action === 'update') updated += 1;
    } catch (error) {
      failed += 1;
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`index ${messageIndex}: ${msg}`);
      const failedEntry = toFailedLedgerEntry(existing, candidate, msg);
      await upsertLedgerEntry(failedEntry);
      return { ok: false, error: `EMOS ingest failed: ${msg}` };
    }
  }

  return {
    ok: true,
    result: {
      ingested,
      updated,
      skipped,
      failed,
      total: ingested + updated + skipped + failed,
      errors,
    },
  };
}

async function handleWorkflowRpc(message: SupportedWorkflowRpcRequest): Promise<unknown> {
  if (message.type === 'ruminer.workflow.notify') {
    const title = trimOrNull(message.title) ?? 'Ruminer';
    const msg = trimOrNull(message.message) ?? '';
    if (msg) {
      await notify(title, msg);
    }
    return { ok: true };
  }

  if (message.type === 'ruminer.ledger.hasAnyForGroups') {
    const groupIds = message.groupIds.filter((id) => typeof id === 'string' && id.trim());
    const result: Record<string, boolean> = {};
    const concurrency = 10;
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, groupIds.length) }, () =>
      (async () => {
        while (idx < groupIds.length) {
          const groupId = groupIds[idx];
          idx += 1;
          result[groupId] = await hasAnyLedgerEntryForGroup(groupId);
        }
      })(),
    );
    await Promise.all(workers);
    return { ok: true, result };
  }

  if (message.type === 'ruminer.chatgpt.ingestConversation') {
    return ingestChatgptConversation(message);
  }

  return { ok: false, error: 'Unsupported message type' };
}

export function initChatgptWorkflowRpc(): void {
  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    try {
      if (!isRecord(raw) || typeof raw.type !== 'string') return;
      const type = raw.type;

      // Narrow to supported message shapes
      if (type === 'ruminer.workflow.notify') {
        const msg = raw as WorkflowNotifyRequest;
        handleWorkflowRpc(msg)
          .then(sendResponse)
          .catch((e) =>
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
        return true;
      }

      if (type === 'ruminer.ledger.hasAnyForGroups') {
        const groupIds = (raw as { groupIds?: unknown }).groupIds;
        if (!isStringList(groupIds)) {
          sendResponse({ ok: false, error: 'groupIds must be string[]' });
          return;
        }
        handleWorkflowRpc({ type, groupIds })
          .then(sendResponse)
          .catch((e) =>
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
        return true;
      }

      if (type === 'ruminer.chatgpt.ingestConversation') {
        const msg = raw as ChatgptIngestConversationRequest;
        handleWorkflowRpc(msg)
          .then(sendResponse)
          .catch((e) =>
            sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
          );
        return true;
      }
    } catch {
      // ignore
    }
  });
}
