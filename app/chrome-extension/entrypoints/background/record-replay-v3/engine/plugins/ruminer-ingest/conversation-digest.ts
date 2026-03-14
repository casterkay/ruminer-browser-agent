import { stableJson } from '@/entrypoints/shared/utils/stable-json';

import { sha256Hex } from './hash';

export type ConversationMessageRole = 'user' | 'assistant';

export type ConversationMessage = {
  role: ConversationMessageRole;
  content: string;
};

export function normalizeConversationContent(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim();
}

export function normalizeConversationMessages(input: unknown): ConversationMessage[] {
  const messages = Array.isArray(input) ? input : [];
  return messages
    .map((m: any) => {
      const role: ConversationMessageRole = m?.role === 'assistant' ? 'assistant' : 'user';
      const content = normalizeConversationContent(m?.content);
      if (!content) return null;
      return { role, content };
    })
    .filter(Boolean) as ConversationMessage[];
}

export async function computeConversationDigestFromMessages(
  messages: ConversationMessage[],
): Promise<{ digest: string; messageCount: number }> {
  const payload = messages.map((m) => ({ role: m.role, content: m.content }));
  const digest = await sha256Hex(stableJson(payload));
  return { digest, messageCount: messages.length };
}
