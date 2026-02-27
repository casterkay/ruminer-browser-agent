import { z } from 'zod';

import type { NodeDefinition } from '../types';
import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonValue } from '../../../domain/json';
import { ensureObject, runWorkflowScriptInTab, toErrorResult, toScriptFailedResult } from './utils';
import type { ExtractListPayload } from './types';

const extractListConfigSchema = z.object({
  script: z.string().min(1),
  inputVar: z.string().nullable().default(null),
  outputItemsVar: z.string().default('ruminer.list.items'),
  outputCursorVar: z.string().default('ruminer.list.cursor'),
  outputDoneVar: z.string().default('ruminer.list.done'),
});

type ExtractListConfig = z.infer<typeof extractListConfigSchema>;

export const extractListNodeDefinition: NodeDefinition<'ruminer.extract_list', ExtractListConfig> =
  {
    kind: 'ruminer.extract_list',
    schema: extractListConfigSchema,
    async execute(ctx, node) {
      const input = node.config.inputVar ? ctx.vars[node.config.inputVar] : undefined;
      const scriptResult = await runWorkflowScriptInTab(ctx.tabId, {
        script: node.config.script,
        input,
        vars: ctx.vars,
      });

      if (!scriptResult.ok) {
        return toScriptFailedResult('ruminer.extract_list failed', {
          error: scriptResult.error,
        });
      }

      const value = scriptResult.value;
      const payloadObject = ensureObject(value);
      const payload = (
        Array.isArray(value)
          ? { items: value, nextCursor: null, done: value.length === 0 }
          : {
              items: Array.isArray(payloadObject?.items) ? payloadObject.items : undefined,
              nextCursor:
                typeof payloadObject?.nextCursor === 'string' || payloadObject?.nextCursor === null
                  ? payloadObject.nextCursor
                  : undefined,
              done: typeof payloadObject?.done === 'boolean' ? payloadObject.done : undefined,
            }
      ) as Partial<ExtractListPayload>;

      if (!Array.isArray(payload.items)) {
        return toErrorResult(
          RR_ERROR_CODES.VALIDATION_ERROR,
          'ruminer.extract_list expects script result with an "items" array',
        );
      }

      const done = payload.done ?? payload.items.length === 0;

      return {
        status: 'succeeded',
        outputs: {
          itemsCount: payload.items.length,
          done,
        },
        varsPatch: [
          {
            op: 'set',
            name: node.config.outputItemsVar,
            value: payload.items as JsonValue[],
          },
          {
            op: 'set',
            name: node.config.outputCursorVar,
            value: payload.nextCursor ?? null,
          },
          {
            op: 'set',
            name: node.config.outputDoneVar,
            value: done,
          },
        ],
      };
    },
  };
