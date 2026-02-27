import { z } from 'zod';

import { createStoragePort } from '@/entrypoints/background/record-replay-v3';
import { enqueueRun } from '@/entrypoints/background/record-replay-v3/engine/queue/enqueue-run';
import { StorageBackedEventsBus } from '@/entrypoints/background/record-replay-v3/engine/transport/events-bus';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject, JsonValue } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import { toErrorResult } from './utils';

const batchingConfigSchema = z.object({
  inputVar: z.string().default('ruminer.list.items'),
  outputVar: z.string().default('ruminer.batch.items'),
  outputHasContinuationVar: z.string().default('ruminer.batch.hasContinuation'),
  batchSize: z.number().int().min(20).max(50).default(20),
  enqueueContinuation: z.boolean().default(true),
});

type BatchingConfig = z.infer<typeof batchingConfigSchema>;

export const batchingNodeDefinition: NodeDefinition<'ruminer.batching', BatchingConfig> = {
  kind: 'ruminer.batching',
  schema: batchingConfigSchema,
  async execute(ctx, node) {
    const input = ctx.vars[node.config.inputVar];
    if (!Array.isArray(input)) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.batching expects "${node.config.inputVar}" to be an array`,
      );
    }

    const currentBatch = input.slice(0, node.config.batchSize);
    const remaining = input.slice(node.config.batchSize);
    const hasContinuation = remaining.length > 0;

    let continuationRunId: string | null = null;
    if (hasContinuation && node.config.enqueueContinuation) {
      const storage = createStoragePort();
      const events = new StorageBackedEventsBus(storage.events);
      const continuationArgs: JsonObject = {
        ...ctx.vars,
        [node.config.inputVar]: remaining as unknown as JsonValue,
        ruminerContinuation: true,
      };
      const result = await enqueueRun(
        {
          storage,
          events,
        },
        {
          flowId: ctx.flow.id,
          args: continuationArgs,
        },
      );
      continuationRunId = result.runId;
      ctx.log('info', 'ruminer.batching enqueued continuation run', {
        continuationRunId,
        remaining: remaining.length,
      });
    }

    return {
      status: 'succeeded',
      outputs: {
        batchSize: currentBatch.length,
        remaining: remaining.length,
        continuationRunId,
      },
      varsPatch: [
        {
          op: 'set',
          name: node.config.outputVar,
          value: currentBatch as JsonValue[],
        },
        {
          op: 'set',
          name: node.config.outputHasContinuationVar,
          value: hasContinuation,
        },
      ],
    };
  },
};
