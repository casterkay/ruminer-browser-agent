import { z } from 'zod';

import { NOTIFICATIONS } from '@/common/constants';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import { runWorkflowScriptInTab, toErrorResult, toScriptFailedResult } from './utils';

const pageAuthCheckConfigSchema = z.object({
  platformLabel: z.string().min(1),
  script: z.string().min(1),
  notifyTitle: z.string().default('Ruminer workflow blocked'),
});

type PageAuthCheckConfig = z.infer<typeof pageAuthCheckConfigSchema>;

async function createAuthNotification(title: string, message: string): Promise<void> {
  try {
    await chrome.notifications.create({
      type: NOTIFICATIONS.TYPE,
      iconUrl: chrome.runtime.getURL('icon/128.png'),
      title,
      message,
      priority: NOTIFICATIONS.PRIORITY,
    });
  } catch {
    // ignore - permissions or host environment may not allow notifications
  }
}

export const pageAuthCheckNodeDefinition: NodeDefinition<
  'ruminer.page_auth_check',
  PageAuthCheckConfig
> = {
  kind: 'ruminer.page_auth_check',
  schema: pageAuthCheckConfigSchema,
  async execute(ctx, node) {
    const scriptResult = await runWorkflowScriptInTab(ctx.tabId, {
      script: node.config.script,
      input: null,
      vars: ctx.vars,
    });

    if (!scriptResult.ok) {
      return toScriptFailedResult('ruminer.page_auth_check failed', {
        error: scriptResult.error,
      });
    }

    if (typeof scriptResult.value !== 'boolean') {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        'ruminer.page_auth_check expects script to return boolean',
      );
    }

    if (scriptResult.value) {
      return {
        status: 'succeeded',
        outputs: {
          ok: true,
        },
      };
    }

    const tab = await chrome.tabs.get(ctx.tabId).catch(() => null);
    const url = tab?.url ?? null;

    const message = `Not logged in to ${node.config.platformLabel}. Sign in and re-run the workflow.`;
    ctx.log('error', message, { url });
    await createAuthNotification(node.config.notifyTitle, message);

    return toErrorResult(RR_ERROR_CODES.PERMISSION_DENIED, message, { url } as JsonObject);
  },
};
