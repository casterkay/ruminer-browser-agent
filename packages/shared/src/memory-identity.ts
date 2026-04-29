export function buildMemoryConversationId(platform: string, conversationId: string): string {
  const p = platform.trim().toLowerCase();
  const c = conversationId.trim();
  if (!p) throw new Error('platform is required');
  if (!c) throw new Error('conversationId is required');
  return `${p}:${c}`;
}

export function buildMemoryMessageId(
  platform: string,
  conversationId: string,
  index: number,
): string {
  const p = platform.trim().toLowerCase();
  const c = conversationId.trim();
  if (!p) throw new Error('platform is required');
  if (!c) throw new Error('conversationId is required');
  if (!Number.isFinite(index) || index < 0) throw new Error('index must be non-negative');
  return `${p}:${c}:${Math.floor(index)}`;
}

export function parseMemoryMessageIndex(messageId: string): number | null {
  const match = /^([^:]+):(.+):(\d+)$/.exec(messageId.trim());
  if (!match) return null;
  const parsed = Number(match[3]);
  return Number.isFinite(parsed) ? parsed : null;
}
