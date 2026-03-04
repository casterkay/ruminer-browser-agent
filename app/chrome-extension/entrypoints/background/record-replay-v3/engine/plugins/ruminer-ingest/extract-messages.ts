import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject, JsonValue } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import type { ExtractedMessage } from './types';
import { ensureObject, runWorkflowScriptInTab, toErrorResult, toScriptFailedResult } from './utils';

const extractMessagesConfigSchema = z.object({
  script: z.string().min(1),
  inputVar: z.string().default('ruminer.list.items'),
  outputVar: z.string().default('ruminer.messages'),
  platform: z.string().nullable().default(null),
  conversationIdVar: z.string().nullable().default(null),
});

type ExtractMessagesConfig = z.infer<typeof extractMessagesConfigSchema>;

function normalizeExtractedMessages(
  payload: unknown,
  defaults: { platform: string | null; conversationId: string | null; fallbackUrl: string | null },
): ExtractedMessage[] | null {
  const rawArray = Array.isArray(payload)
    ? payload
    : Array.isArray(ensureObject(payload)?.messages)
      ? (ensureObject(payload)?.messages as unknown[])
      : null;

  if (!rawArray) {
    return null;
  }

  const nowIso = new Date().toISOString();

  return rawArray
    .map((item, index) => {
      const message = ensureObject(item);
      if (!message) {
        return null;
      }
      const sender =
        typeof message.sender === 'string' && message.sender.trim() ? message.sender.trim() : null;
      const content =
        typeof message.content === 'string' && message.content.trim() ? message.content : null;

      const normalized: ExtractedMessage = {
        platform:
          typeof message.platform === 'string' && message.platform.trim()
            ? message.platform
            : defaults.platform,
        conversation_id:
          typeof message.conversation_id === 'string' && message.conversation_id.trim()
            ? message.conversation_id
            : defaults.conversationId,
        message_index:
          typeof message.message_index === 'number' && Number.isFinite(message.message_index)
            ? Math.floor(message.message_index)
            : index,
        message_id:
          typeof message.message_id === 'string' && message.message_id.trim()
            ? message.message_id
            : null,
        sender,
        content,
        create_time:
          typeof message.create_time === 'string' && message.create_time.trim()
            ? message.create_time
            : nowIso,
        sender_name:
          typeof message.sender_name === 'string' && message.sender_name.trim()
            ? message.sender_name
            : null,
        role:
          typeof message.role === 'string' && message.role.trim()
            ? message.role
            : message.role === null
              ? null
              : null,
        refer_list: Array.isArray(message.refer_list)
          ? message.refer_list.filter((item): item is string => typeof item === 'string')
          : null,
        group_id:
          typeof message.group_id === 'string' && message.group_id.trim() ? message.group_id : null,
        group_name:
          typeof message.group_name === 'string' && message.group_name.trim()
            ? message.group_name
            : null,
        source_url:
          typeof message.source_url === 'string'
            ? message.source_url
            : (defaults.fallbackUrl ?? null),
      };

      return normalized;
    })
    .filter((item): item is ExtractedMessage => Boolean(item));
}

export const extractMessagesNodeDefinition: NodeDefinition<
  'ruminer.extract_messages',
  ExtractMessagesConfig
> = {
  kind: 'ruminer.extract_messages',
  schema: extractMessagesConfigSchema,
  async execute(ctx, node) {
    const input = ctx.vars[node.config.inputVar];
    if (!Array.isArray(input)) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.extract_messages expects "${node.config.inputVar}" to be an array`,
      );
    }

    const conversationIdVar = node.config.conversationIdVar
      ? ctx.vars[node.config.conversationIdVar]
      : undefined;
    const defaultConversationId: string | null =
      typeof conversationIdVar === 'string' && conversationIdVar.trim() ? conversationIdVar : null;

    const scriptResult = await runWorkflowScriptInTab(ctx.tabId, {
      script: node.config.script,
      input,
      vars: ctx.vars,
    });

    if (!scriptResult.ok) {
      return toScriptFailedResult('ruminer.extract_messages failed', {
        error: scriptResult.error,
      });
    }

    const tabInfo = await chrome.tabs.get(ctx.tabId).catch(() => null);
    const normalized = normalizeExtractedMessages(scriptResult.value, {
      platform: node.config.platform,
      conversationId: defaultConversationId,
      fallbackUrl: tabInfo?.url ?? null,
    });

    if (!normalized) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        'ruminer.extract_messages expects script result as an array or { messages: [] }',
      );
    }

    return {
      status: 'succeeded',
      outputs: {
        extracted: normalized.length,
      } as JsonObject,
      varsPatch: [
        {
          op: 'set',
          name: node.config.outputVar,
          value: normalized as unknown as JsonValue,
        },
      ],
    };
  },
};
