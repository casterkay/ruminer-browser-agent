import { z } from 'zod';

import { emosSearchMemories } from '@/entrypoints/background/ruminer/emos-client';
import { getEmosSettings } from '@/entrypoints/shared/utils/openclaw-settings';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject } from '../../../domain/json';
import type { NodeDefinition } from '../types';
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
    const settings = await getEmosSettings();
    const missing: string[] = [];
    if (!settings.baseUrl.trim()) {
      missing.push('baseUrl');
    }
    if (!settings.apiKey.trim()) {
      missing.push('apiKey');
    }

    if (missing.length > 0) {
      const message = `EMOS settings incomplete: missing ${missing.join(', ')}`;
      await notifyAuthFailure(node.config.notifyTitle, message);
      ctx.log('error', message);
      return toErrorResult(RR_ERROR_CODES.PERMISSION_DENIED, message, {
        missing,
      } as JsonObject);
    }

    if (node.config.verifyRemote) {
      try {
        await emosSearchMemories({ query: 'ping', limit: 1 });
      } catch (error) {
        const message = `EMOS auth check failed: ${
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
