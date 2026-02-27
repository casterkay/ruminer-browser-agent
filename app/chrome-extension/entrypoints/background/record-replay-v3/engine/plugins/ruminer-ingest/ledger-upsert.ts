import { z } from 'zod';

import {
  getLedgerEntry,
  upsertLedgerEntry,
} from '@/entrypoints/background/ruminer/ingestion-ledger';
import { applyLedgerPolicy } from '@/entrypoints/background/ruminer/ledger-policy';

import type { NodeDefinition } from '../types';
import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject, JsonValue } from '../../../domain/json';
import type { LedgerBatchItem, NormalizedIngestionMessage } from './types';
import { ensureObject, toErrorResult } from './utils';

const ledgerUpsertConfigSchema = z.object({
  inputVar: z.string().default('ruminer.normalized_messages'),
  outputVar: z.string().default('ruminer.ledger_batch'),
});

type LedgerUpsertConfig = z.infer<typeof ledgerUpsertConfigSchema>;

function isNormalizedMessage(value: unknown): value is NormalizedIngestionMessage {
  const message = ensureObject(value);
  return Boolean(
    message &&
    typeof message.item_key === 'string' &&
    typeof message.content_hash === 'string' &&
    typeof message.group_id === 'string' &&
    typeof message.sender === 'string' &&
    typeof message.message_id === 'string',
  );
}

export const ledgerUpsertNodeDefinition: NodeDefinition<
  'ruminer.ledger_upsert',
  LedgerUpsertConfig
> = {
  kind: 'ruminer.ledger_upsert',
  schema: ledgerUpsertConfigSchema,
  async execute(_ctx, node) {
    const input = _ctx.vars[node.config.inputVar];
    if (!Array.isArray(input)) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.ledger_upsert expects "${node.config.inputVar}" to be an array`,
      );
    }

    const ledgerBatch: LedgerBatchItem[] = [];
    let ingest = 0;
    let update = 0;
    let skip = 0;

    for (let i = 0; i < input.length; i++) {
      const rawMessage = input[i];
      if (!isNormalizedMessage(rawMessage)) {
        return toErrorResult(RR_ERROR_CODES.VALIDATION_ERROR, `Invalid normalized message at ${i}`);
      }

      const existing = await getLedgerEntry(rawMessage.item_key);
      const decision = applyLedgerPolicy(existing, {
        item_key: rawMessage.item_key,
        content_hash: rawMessage.content_hash,
        canonical_url: rawMessage.canonical_url ?? null,
        group_id: rawMessage.group_id,
        sender: rawMessage.sender,
        evermemos_message_id: rawMessage.message_id,
      });

      await upsertLedgerEntry(decision.nextEntry);

      if (decision.action === 'ingest') ingest += 1;
      if (decision.action === 'update') update += 1;
      if (decision.action === 'skip') skip += 1;

      ledgerBatch.push({
        action: decision.action,
        reason: decision.reason,
        shouldIngest: decision.action !== 'skip',
        shouldAdvanceCursor: decision.shouldAdvanceCursor,
        message: rawMessage,
      });
    }

    return {
      status: 'succeeded',
      outputs: {
        ingest,
        update,
        skip,
      } as JsonObject,
      varsPatch: [
        {
          op: 'set',
          name: node.config.outputVar,
          value: ledgerBatch as unknown as JsonValue,
        },
      ],
    };
  },
};
