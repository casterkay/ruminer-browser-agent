import { z } from 'zod';

import { RR_ERROR_CODES } from '../../../domain/errors';
import type { JsonObject, JsonValue } from '../../../domain/json';
import type { NodeDefinition } from '../types';
import { computeCanonicalHashes } from './hash';
import type { ExtractedMessage, NormalizedIngestionMessage } from './types';
import { ensureObject, toErrorResult, toStringList } from './utils';

const normalizeAndHashConfigSchema = z.object({
  inputVar: z.string().default('ruminer.messages'),
  outputVar: z.string().default('ruminer.normalized_messages'),
  defaultPlatform: z.string().nullable().default(null),
  defaultConversationId: z.string().nullable().default(null),
  failOnInvalid: z.boolean().default(true),
});

type NormalizeAndHashConfig = z.infer<typeof normalizeAndHashConfigSchema>;

function isValidIsoString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function normalizeSender(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePlatformLabel(platform: string): string {
  const key = platform.trim().toLowerCase();
  if (!key) return 'Bot';
  const labels: Record<string, string> = {
    openclaw: 'OpenClaw',
    chatgpt: 'ChatGPT',
    claude: 'Claude',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    codex: 'Codex',
  };
  return labels[key] || platform.trim();
}

function canonicalizeSender(input: {
  sender: string | null;
  role: string | null;
}): 'me' | 'bot' | null {
  const role = input.role?.trim().toLowerCase() || '';
  if (role === 'user') return 'me';
  if (role === 'assistant') return 'bot';

  const sender = input.sender?.trim().toLowerCase() || '';
  if (sender === 'me' || sender === 'bot') return sender;
  if (['user', 'human', 'self'].includes(sender)) return 'me';
  if (['assistant', 'ai', 'model', 'system'].includes(sender)) return 'bot';

  return null;
}

function normalizeContent(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseGroupParts(groupId: unknown): { platform?: string; conversationId?: string } {
  if (typeof groupId !== 'string' || !groupId.includes(':')) {
    return {};
  }
  const [platform, ...rest] = groupId.split(':');
  if (!platform || rest.length === 0) {
    return {};
  }
  return {
    platform,
    conversationId: rest.join(':'),
  };
}

export const normalizeAndHashNodeDefinition: NodeDefinition<
  'ruminer.normalize_and_hash',
  NormalizeAndHashConfig
> = {
  kind: 'ruminer.normalize_and_hash',
  schema: normalizeAndHashConfigSchema,
  async execute(ctx, node) {
    const input = ctx.vars[node.config.inputVar];
    if (!Array.isArray(input)) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.normalize_and_hash expects "${node.config.inputVar}" to be an array`,
      );
    }

    const nowIso = new Date().toISOString();
    const normalized: NormalizedIngestionMessage[] = [];
    const invalidMessages: string[] = [];

    for (let i = 0; i < input.length; i++) {
      const rawMessage = ensureObject(input[i]) as ExtractedMessage | null;
      if (!rawMessage) {
        invalidMessages.push(`index ${i}: message is not an object`);
        continue;
      }

      const groupParts = parseGroupParts(rawMessage.group_id);
      const platform =
        (typeof rawMessage.platform === 'string' && rawMessage.platform.trim()) ||
        groupParts.platform ||
        node.config.defaultPlatform;
      const conversationId =
        (typeof rawMessage.conversation_id === 'string' && rawMessage.conversation_id.trim()) ||
        groupParts.conversationId ||
        node.config.defaultConversationId;
      const role = normalizeRole(rawMessage.role);
      const sender = canonicalizeSender({ sender: normalizeSender(rawMessage.sender), role });
      const content = normalizeContent(rawMessage.content);

      if (!platform) {
        invalidMessages.push(`index ${i}: missing platform`);
        continue;
      }
      if (!conversationId) {
        invalidMessages.push(`index ${i}: missing conversation_id`);
        continue;
      }
      if (!sender) {
        invalidMessages.push(
          `index ${i}: missing/unsupported sender (expected role user/assistant or sender me/bot)`,
        );
        continue;
      }
      if (!content) {
        invalidMessages.push(`index ${i}: missing content`);
        continue;
      }

      const messageIndex =
        typeof rawMessage.message_index === 'number' && Number.isFinite(rawMessage.message_index)
          ? Math.max(0, Math.floor(rawMessage.message_index))
          : i;

      const { item_key, content_hash } = await computeCanonicalHashes({
        platform,
        conversationId,
        messageIndex,
        content,
      });

      const createTime = isValidIsoString(rawMessage.create_time) ? rawMessage.create_time : nowIso;
      const groupId = `${platform}:${conversationId}`;

      const senderNameRaw =
        typeof rawMessage.sender_name === 'string' && rawMessage.sender_name.trim()
          ? rawMessage.sender_name.trim()
          : undefined;
      const senderName =
        senderNameRaw || (sender === 'me' ? 'Me' : normalizePlatformLabel(platform));

      const normalizedRole = role || (sender === 'me' ? 'user' : 'assistant');

      normalized.push({
        message_id: item_key,
        create_time: createTime,
        sender,
        content,
        group_id: groupId,
        group_name:
          typeof rawMessage.group_name === 'string' && rawMessage.group_name.trim()
            ? rawMessage.group_name
            : undefined,
        sender_name: senderName,
        role: normalizedRole,
        refer_list: toStringList(rawMessage.refer_list),
        item_key,
        content_hash,
        platform,
        conversation_id: conversationId,
        message_index: messageIndex,
        source_url: typeof rawMessage.source_url === 'string' ? rawMessage.source_url : null,
      });
    }

    if (invalidMessages.length > 0 && node.config.failOnInvalid) {
      return toErrorResult(
        RR_ERROR_CODES.VALIDATION_ERROR,
        `ruminer.normalize_and_hash rejected ${invalidMessages.length} message(s)`,
        {
          errors: invalidMessages,
        } as JsonObject,
      );
    }

    if (invalidMessages.length > 0) {
      ctx.log('warn', 'ruminer.normalize_and_hash dropped invalid messages', {
        dropped: invalidMessages.length,
        errors: invalidMessages,
      });
    }

    return {
      status: 'succeeded',
      outputs: {
        normalized: normalized.length,
        dropped: invalidMessages.length,
      },
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
