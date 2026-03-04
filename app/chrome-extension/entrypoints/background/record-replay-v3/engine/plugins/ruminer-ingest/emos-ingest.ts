import { z } from 'zod';

import { emosUpsertMemory } from '@/entrypoints/background/ruminer/emos-client';
import {
  getLedgerEntry,
  upsertLedgerEntry,
} from '@/entrypoints/background/ruminer/ingestion-ledger';
import { toFailedLedgerEntry } from '@/entrypoints/background/ruminer/ledger-policy';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import type { LedgerBatchItem } from './types';
import { ensureObject, sleep, toErrorResult } from './utils';

const emosIngestConfigSchema = z.object({
  inputVar: z.string().default('ruminer.ledger_batch'),
  outputVar: z.string().default('ruminer.ingest_result'),
  maxRetries: z.number().int().min(0).default(3),
  initialBackoffMs: z.number().int().min(10).default(500),
  backoffMultiplier: z.number().positive().default(2),
  continueOnError: z.boolean().default(false),
});

type EmosIngestConfig = z.infer<typeof emosIngestConfigSchema>;

function isLedgerBatchItem(value: unknown): value is LedgerBatchItem {
  const item = ensureObject(value);
  return Boolean(
    item &&
    typeof item.action === 'string' &&
    typeof item.reason === 'string' &&
    typeof item.shouldIngest === 'boolean' &&
    ensureObject(item.message) &&
    typeof ensureObject(item.message)?.message_id === 'string',
  );
}

async function ingestWithRetry(item: LedgerBatchItem, config: EmosIngestConfig): Promise<void> {
  let delayMs = config.initialBackoffMs;
  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      await emosUpsertMemory(item.message);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= config.maxRetries) {
        break;
      }
      await sleep(delayMs);
      delayMs = Math.ceil(delayMs * config.backoffMultiplier);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const emosIngestNodeDefinition: NodeDefinition<'ruminer.emos_ingest', EmosIngestConfig> = {
  kind: 'ruminer.emos_ingest',
  schema: emosIngestConfigSchema,
  async execute(ctx, node) {
    const input = ctx.vars[node.config.inputVar];
    if (!Array.isArray(input)) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.emos_ingest expects "${node.config.inputVar}" to be an array`,
      );
    }

    let ingested = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      if (!isLedgerBatchItem(item)) {
        return toErrorResult(
          RR_ERROR_CODES.VALIDATION_ERROR,
          `ruminer.emos_ingest received an invalid ledger item at index ${i}`,
        );
      }
      if (!item.shouldIngest) {
        skipped += 1;
        continue;
      }

      try {
        await ingestWithRetry(item, node.config);
        const existing = await getLedgerEntry(item.message.item_key);
        await upsertLedgerEntry({
          item_key: item.message.item_key,
          content_hash: item.message.content_hash,
          source_url: item.message.source_url ?? null,
          group_id: item.message.group_id,
          sender: item.message.sender,
          evermemos_message_id: item.message.message_id,
          first_seen_at: existing?.first_seen_at ?? new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          last_ingested_at: new Date().toISOString(),
          status: 'ingested',
          last_error: null,
        });
        ingested += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`index ${i}: ${message}`);
        const existing = await getLedgerEntry(item.message.item_key);
        const failedEntry = toFailedLedgerEntry(
          existing,
          {
            item_key: item.message.item_key,
            content_hash: item.message.content_hash,
            source_url: item.message.source_url ?? null,
            group_id: item.message.group_id,
            sender: item.message.sender,
            evermemos_message_id: item.message.message_id,
          },
          message,
        );
        await upsertLedgerEntry(failedEntry);

        if (!node.config.continueOnError) {
          return toErrorResult(
            RR_ERROR_CODES.NETWORK_REQUEST_FAILED,
            'ruminer.emos_ingest failed',
            {
              error: message,
              failedIndex: i,
            } as JsonObject,
            true,
          );
        }
      }
    }

    const summary: JsonObject = {
      ingested,
      skipped,
      failed,
      total: ingested + skipped + failed,
      errors,
    };

    return {
      status: 'succeeded',
      outputs: summary,
      varsPatch: [
        {
          op: 'set',
          name: node.config.outputVar,
          value: summary,
        },
      ],
    };
  },
};
