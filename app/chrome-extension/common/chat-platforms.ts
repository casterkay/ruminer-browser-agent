/**
 * Platforms - AI Chat 平台相关工具函数
 *
 * 支持的平台：
 * - ChatGPT
 * - Gemini
 * - Claude
 * - DeepSeek
 * - Grok
 *
 * 支持的 URL 格式：
 * - https://chatgpt.com/c/1234567890
 * - https://chat.openai.com/c/1234567890
 * - https://claude.ai/chat/1234567890
 * - https://gemini.google.com/app/1234567890
 * - https://chat.deepseek.com/c/1234567890
 * - https://grok.com/c/1234567890
 * - https://x.com/i/grok (best-effort)
 */

export type ChatPlatform = 'chatgpt' | 'claude' | 'gemini' | 'deepseek' | 'grok';

/**
 * Infer platform from URL
 */
export function inferPlatformFromUrl(urlString: string): ChatPlatform | null {
  try {
    const u = new URL(urlString);
    const host = String(u.hostname || '').toLowerCase();
    if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
    if (host === 'claude.ai') return 'claude';
    if (host === 'gemini.google.com') return 'gemini';
    if (host === 'chat.deepseek.com') return 'deepseek';
    if (host === 'grok.com' || host === 'www.grok.com') return 'grok';
    if (
      (host === 'x.com' || host === 'www.x.com') &&
      String(u.pathname || '').startsWith('/i/grok')
    )
      return 'grok';
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse conversation ID from URL
 */
export function parseConversationId(urlString: string): string | null {
  try {
    const u = new URL(urlString);
    const pathname = String(u.pathname || '');
    return pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}
