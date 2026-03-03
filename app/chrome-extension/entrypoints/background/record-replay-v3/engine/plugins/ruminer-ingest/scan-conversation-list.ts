import { z } from 'zod';

import { createStoragePort } from '@/entrypoints/background/record-replay-v3';
import { enqueueRun } from '@/entrypoints/background/record-replay-v3/engine/queue/enqueue-run';
import { StorageBackedEventsBus } from '@/entrypoints/background/record-replay-v3/engine/transport/events-bus';
import { hasAnyLedgerEntryForGroup } from '@/entrypoints/background/ruminer/ingestion-ledger';
import { sha256Hex } from '@/entrypoints/background/ruminer/hash';
import { stableJson } from '@/entrypoints/shared/utils/stable-json';

import type { NodeDefinition } from '../types';
import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject, JsonValue } from '../../../domain/json';
import { ensureObject, runWorkflowScriptInTab, toErrorResult, toScriptFailedResult } from './utils';

const scanConversationListConfigSchema = z.object({
  platform: z.string().min(1),
  listScript: z.string().min(1),
  targetFlowIdVar: z.string().default('ruminer.scan.targetFlowId'),
  stateKey: z.string().default('$scan.chatgpt.state'),
  heuristicMatchStreak: z.number().int().min(1).default(3),
  maxItemsPerRun: z.number().int().min(1).max(200).default(50),
  maxEnqueuePerRun: z.number().int().min(1).max(200).default(50),
  fullScanEveryRuns: z.number().int().min(1).default(20),
  fullScanEveryDays: z.number().int().min(1).default(7),
  maxOrderListSize: z.number().int().min(50).max(5000).default(500),
  filtersVar: z.string().default('ruminer.scan.filters'),
});

type ScanConversationListConfig = z.infer<typeof scanConversationListConfigSchema>;

type ScanStateV1 = {
  schemaVersion: 1;
  conversationOrder: string[]; // newest -> older
  filterHash: string | null;
  scannerRuns: number;
  lastFullScanAt: number | null;
  fullScanCursor: string | null;
};

type ConversationListItem = {
  id: string;
  url: string;
  title?: string | null;
};

function uniquePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function parseScanState(value: unknown): ScanStateV1 {
  const obj = ensureObject(value);
  if (!obj || obj.schemaVersion !== 1) {
    return {
      schemaVersion: 1,
      conversationOrder: [],
      filterHash: null,
      scannerRuns: 0,
      lastFullScanAt: null,
      fullScanCursor: null,
    };
  }

  const conversationOrder = Array.isArray(obj.conversationOrder)
    ? obj.conversationOrder.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    schemaVersion: 1,
    conversationOrder,
    filterHash:
      typeof obj.filterHash === 'string' || obj.filterHash === null ? obj.filterHash : null,
    scannerRuns:
      typeof obj.scannerRuns === 'number' && Number.isFinite(obj.scannerRuns) ? obj.scannerRuns : 0,
    lastFullScanAt:
      typeof obj.lastFullScanAt === 'number' && Number.isFinite(obj.lastFullScanAt)
        ? obj.lastFullScanAt
        : null,
    fullScanCursor:
      typeof obj.fullScanCursor === 'string' && obj.fullScanCursor.trim()
        ? obj.fullScanCursor
        : obj.fullScanCursor === null
          ? null
          : null,
  };
}

function normalizeConversationListItems(value: unknown): ConversationListItem[] | null {
  const rawArray = Array.isArray(value)
    ? value
    : Array.isArray(ensureObject(value)?.items)
      ? (ensureObject(value)?.items as unknown[])
      : null;
  if (!rawArray) return null;

  const out: ConversationListItem[] = [];
  for (const item of rawArray) {
    const obj = ensureObject(item);
    if (!obj) continue;

    const id =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : typeof obj.conversationId === 'string' && obj.conversationId.trim()
          ? obj.conversationId.trim()
          : null;
    const url =
      typeof obj.url === 'string' && obj.url.trim()
        ? obj.url.trim()
        : typeof obj.href === 'string' && obj.href.trim()
          ? obj.href.trim()
          : null;

    if (!id || !url) continue;

    out.push({
      id,
      url,
      title: typeof obj.title === 'string' ? obj.title : null,
    });
  }

  return out;
}

function coerceListPayload(
  value: unknown,
): { items: ConversationListItem[]; nextCursor: string | null; done: boolean } | null {
  const obj = ensureObject(value);
  const items = normalizeConversationListItems(value);
  if (!items) return null;

  const nextCursor =
    typeof obj?.nextCursor === 'string' || obj?.nextCursor === null
      ? (obj.nextCursor as string | null)
      : null;
  const done = typeof obj?.done === 'boolean' ? (obj.done as boolean) : items.length === 0;

  return { items, nextCursor, done };
}

export const scanConversationListNodeDefinition: NodeDefinition<
  'ruminer.scan_conversation_list',
  ScanConversationListConfig
> = {
  kind: 'ruminer.scan_conversation_list',
  schema: scanConversationListConfigSchema,
  async execute(ctx, node) {
    if (!node.config.stateKey.startsWith('$')) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        'ruminer.scan_conversation_list expects stateKey to start with "$"',
        { stateKey: node.config.stateKey } as JsonObject,
      );
    }

    const targetFlowIdRaw = ctx.vars[node.config.targetFlowIdVar];
    const targetFlowId =
      typeof targetFlowIdRaw === 'string' && targetFlowIdRaw.trim() ? targetFlowIdRaw.trim() : null;
    if (!targetFlowId) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `Missing target flow id in var "${node.config.targetFlowIdVar}"`,
      );
    }

    const now = Date.now();
    const state = parseScanState(await ctx.persistent.get(node.config.stateKey as `$${string}`));

    // Compute filter hash
    const filtersValue = ctx.vars[node.config.filtersVar];
    const filtersObj =
      filtersValue && typeof filtersValue === 'object' && !Array.isArray(filtersValue)
        ? (filtersValue as Record<string, unknown>)
        : null;
    const filterHash = filtersObj ? await sha256Hex(stableJson(filtersObj)) : null;

    if (state.filterHash !== filterHash) {
      state.conversationOrder = [];
      state.fullScanCursor = null;
      state.lastFullScanAt = null;
      state.filterHash = filterHash;
    }

    const fullScanDueByRuns =
      state.scannerRuns > 0 && state.scannerRuns % node.config.fullScanEveryRuns === 0;
    const fullScanDueByTime =
      state.lastFullScanAt === null ||
      now - state.lastFullScanAt > node.config.fullScanEveryDays * 24 * 60 * 60 * 1000;

    const isFullScan =
      state.fullScanCursor !== null ||
      state.conversationOrder.length === 0 ||
      fullScanDueByRuns ||
      fullScanDueByTime;

    const cursor: string | null = state.fullScanCursor ?? null;

    const scriptResult = await runWorkflowScriptInTab(ctx.tabId, {
      script: node.config.listScript,
      input: cursor,
      vars: ctx.vars,
    });

    if (!scriptResult.ok) {
      return toScriptFailedResult('ruminer.scan_conversation_list failed', {
        error: scriptResult.error,
      });
    }

    const payload = coerceListPayload(scriptResult.value);
    if (!payload) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        'ruminer.scan_conversation_list expects { items: [], nextCursor, done }',
      );
    }

    const storage = createStoragePort();
    const events = new StorageBackedEventsBus(storage.events);

    const known = new Set(state.conversationOrder);
    const visited: ConversationListItem[] = [];
    let matchStreak = 0;

    for (let i = 0; i < payload.items.length && visited.length < node.config.maxItemsPerRun; i++) {
      const item = payload.items[i];
      visited.push(item);

      if (!isFullScan) {
        const expectedId = state.conversationOrder[i];
        if (expectedId && expectedId === item.id) {
          matchStreak += 1;
        } else {
          matchStreak = 0;
        }
        if (matchStreak >= node.config.heuristicMatchStreak) {
          break;
        }
      }
    }

    const enqueuedConversationIds = new Set<string>();
    let enqueued = 0;

    for (let i = 0; i < visited.length; i++) {
      if (enqueued >= node.config.maxEnqueuePerRun) {
        break;
      }

      const item = visited[i];
      const oldAtIndex = state.conversationOrder[i];
      const isNew = !known.has(item.id);
      const isMoved = typeof oldAtIndex === 'string' && oldAtIndex !== item.id;

      let shouldEnqueue = isNew || isMoved;
      if (isFullScan && !shouldEnqueue) {
        const groupId = `${node.config.platform}:${item.id}`;
        const everIngested = await hasAnyLedgerEntryForGroup(groupId);
        if (!everIngested) {
          shouldEnqueue = true;
        }
      }

      if (!shouldEnqueue) continue;
      if (enqueuedConversationIds.has(item.id)) continue;
      enqueuedConversationIds.add(item.id);

      await enqueueRun(
        { storage, events },
        {
          flowId: targetFlowId as any,
          priority: 0,
          args: {
            platform: node.config.platform,
            conversationId: item.id,
            conversationUrl: item.url,
          } as unknown as JsonObject,
        },
      );

      enqueued += 1;
    }

    // Update conversationOrder only for the "top page" scan (cursor == null)
    if (cursor === null) {
      const topIds = visited.map((item) => item.id);
      const nextOrder = uniquePreserveOrder([
        ...topIds,
        ...state.conversationOrder.filter((id) => !topIds.includes(id)),
      ]).slice(0, node.config.maxOrderListSize);
      state.conversationOrder = nextOrder;
    }

    let continuationRunId: string | null = null;
    if (isFullScan && !payload.done) {
      if (!payload.nextCursor) {
        return toErrorResult(
          RR_ERROR_CODES.VALIDATION_ERROR,
          'Full scan expected nextCursor when done=false',
        );
      }
      state.fullScanCursor = payload.nextCursor;
      // Persist cursor BEFORE enqueueing continuation to avoid a race where the next run starts
      // and still sees the old cursor.
      await ctx.persistent.set(node.config.stateKey as `$${string}`, state as unknown as JsonValue);
      const continuation = await enqueueRun(
        { storage, events },
        {
          flowId: ctx.flow.id as any,
          priority: 10,
          args: {
            ruminerScanContinuation: true,
          } as JsonObject,
        },
      );
      continuationRunId = continuation.runId;
    }

    if (isFullScan && payload.done) {
      state.fullScanCursor = null;
      state.lastFullScanAt = now;
    }

    state.scannerRuns += 1;
    await ctx.persistent.set(node.config.stateKey as `$${string}`, state as unknown as JsonValue);

    ctx.log('info', 'ruminer.scan_conversation_list progress', {
      mode: isFullScan ? 'fullScan' : 'normal',
      cursor,
      scanned: visited.length,
      enqueued,
      continuationRunId,
    });

    return {
      status: 'succeeded',
      outputs: {
        mode: isFullScan ? 'fullScan' : 'normal',
        cursor,
        scanned: visited.length,
        enqueued,
        continuationRunId,
      } as JsonObject,
    };
  },
};
