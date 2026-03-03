import { z } from 'zod';

import type { JsonObject } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import { sleep } from './utils';

const randomDelayConfigSchema = z.object({
  minMs: z.number().int().min(0).default(200),
  maxMs: z.number().int().min(0).default(500),
});

type RandomDelayConfig = z.infer<typeof randomDelayConfigSchema>;

function clampRange(minMs: number, maxMs: number): { minMs: number; maxMs: number } {
  const min = Math.max(0, Math.floor(minMs));
  const max = Math.max(0, Math.floor(maxMs));
  return min <= max ? { minMs: min, maxMs: max } : { minMs: max, maxMs: min };
}

export const randomDelayNodeDefinition: NodeDefinition<'ruminer.random_delay', RandomDelayConfig> =
  {
    kind: 'ruminer.random_delay',
    schema: randomDelayConfigSchema,
    async execute(_ctx, node) {
      const { minMs, maxMs } = clampRange(node.config.minMs, node.config.maxMs);
      const delayMs =
        minMs === maxMs ? minMs : Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      await sleep(delayMs);

      return {
        status: 'succeeded',
        outputs: {
          delayMs,
        } as JsonObject,
      };
    },
  };
