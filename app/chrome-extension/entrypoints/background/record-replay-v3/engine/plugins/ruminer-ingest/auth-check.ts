import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import { emosSearchMemories, getMemoryStatus } from './emos-client';
import { toErrorResult } from './utils';

const authCheckConfigSchema = z.object({
  verifyRemote: z.boolean().default(false),
  notifyTitle: z.string().default('Ruminer workflow blocked'),
});

type AuthCheckConfig = z.infer<typeof authCheckConfigSchema>;

async function notifyAuthFailure(title: string, message: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'ruminer.workflow.auth-failure',
      title,
      message,
    });
  } catch {
    // no-op: sidepanel may not be connected
  }
}

export const authCheckNodeDefinition: NodeDefinition<'ruminer.auth_check', AuthCheckConfig> = {
  kind: 'ruminer.auth_check',
  schema: authCheckConfigSchema,
  async execute(ctx, node) {
    const status = await getMemoryStatus();

    if (!status.configured) {
      const message = 'Memory backend is not configured';
      await notifyAuthFailure(node.config.notifyTitle, message);
      ctx.log('error', message);
      return toErrorResult(RR_ERROR_CODES.PERMISSION_DENIED, message, {
        backend: status.backend,
      } as JsonObject);
    }

    if (node.config.verifyRemote) {
      try {
        await emosSearchMemories({ query: 'ping', limit: 1 });
      } catch (error) {
        const message = `Memory backend auth check failed: ${
          error instanceof Error ? error.message : String(error)
        }`;
        await notifyAuthFailure(node.config.notifyTitle, message);
        ctx.log('error', message);
        return toErrorResult(RR_ERROR_CODES.PERMISSION_DENIED, message);
      }
    }

    return {
      status: 'succeeded',
      outputs: {
        ok: true,
      },
    };
  },
};
