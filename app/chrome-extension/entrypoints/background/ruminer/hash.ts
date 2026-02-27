export interface CanonicalHashInput {
  platform: string;
  conversationId: string;
  messageIndex: number;
  content: string;
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

export function buildItemKey(
  platform: string,
  conversationId: string,
  messageIndex: number,
): string {
  return `${platform}:${conversationId}:${messageIndex}`;
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(digest);
}

export async function computeCanonicalHashes(input: CanonicalHashInput): Promise<{
  item_key: string;
  content_hash: string;
}> {
  const item_key = buildItemKey(input.platform, input.conversationId, input.messageIndex);
  const content_hash = await sha256Hex(normalizeContent(input.content));

  return {
    item_key,
    content_hash,
  };
}
