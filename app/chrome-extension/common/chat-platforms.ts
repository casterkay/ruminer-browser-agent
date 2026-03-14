/**
 * Platforms - AI Chat 平台相关工具函数
 *
 * 支持的平台：
 * - ChatGPT
 * - Gemini
 * - Claude
 * - DeepSeek
 *
 * 支持的 URL 格式：
 * - https://chatgpt.com/c/1234567890
 * - https://chat.openai.com/c/1234567890
 * - https://claude.ai/chat/1234567890
 * - https://gemini.google.com/app/1234567890
 * - https://chat.deepseek.com/c/1234567890
 */

export type ChatPlatform = 'chatgpt' | 'claude' | 'gemini' | 'deepseek';

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
