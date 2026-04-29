import { describe, expect, jest, test } from '@jest/globals';
import path from 'node:path';

describe('upsertIngestedConversationSession', () => {
  test('uses canonical imported message ids and removes stale rows on shrinkage', async () => {
    process.env.CHROME_MCP_AGENT_DATA_DIR = path.join(
      '/tmp',
      'ruminer-test',
      `session-service-${Date.now()}`,
    );
    process.env.MCP_ALLOWED_WORKSPACE_BASE = '/tmp';
    jest.resetModules();

    const { getDb } = await import('./db');
    const { getMessagesBySessionId } = await import('./message-service');
    const { upsertIngestedConversationSession } = await import('./session-service');

    const db = getDb();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM projects');

    await upsertIngestedConversationSession({
      platform: 'chatgpt',
      conversationId: 'c1',
      conversationTitle: 'Title One',
      conversationUrl: 'https://chatgpt.com/c/c1',
      messages: [
        { role: 'user', content: 'hello', createTime: '2024-01-01T00:00:00Z' },
        { role: 'assistant', content: 'hi', createTime: '2024-01-01T00:01:00Z' },
      ],
    });

    await upsertIngestedConversationSession({
      platform: 'chatgpt',
      conversationId: 'c1',
      conversationTitle: 'Title One',
      conversationUrl: 'https://chatgpt.com/c/c1',
      messages: [{ role: 'user', content: 'shorter', createTime: '2024-01-01T00:00:00Z' }],
    });

    const messages = await getMessagesBySessionId('chatgpt:c1');
    expect(messages.map((m) => m.id)).toEqual(['chatgpt:c1:0']);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('shorter');
  });

  test('empty replacement deletes an existing imported session', async () => {
    process.env.CHROME_MCP_AGENT_DATA_DIR = path.join(
      '/tmp',
      'ruminer-test',
      `session-service-empty-${Date.now()}`,
    );
    process.env.MCP_ALLOWED_WORKSPACE_BASE = '/tmp';
    jest.resetModules();

    const { getDb } = await import('./db');
    const { getMessagesBySessionId } = await import('./message-service');
    const { getSession, upsertIngestedConversationSession } = await import('./session-service');

    const db = getDb();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM sessions');
    db.run('DELETE FROM projects');

    await upsertIngestedConversationSession({
      platform: 'chatgpt',
      conversationId: 'c-empty',
      conversationTitle: 'Deleted Conversation',
      conversationUrl: 'https://chatgpt.com/c/c-empty',
      messages: [{ role: 'user', content: 'hello', createTime: '2024-01-01T00:00:00Z' }],
    });

    await upsertIngestedConversationSession({
      platform: 'chatgpt',
      conversationId: 'c-empty',
      conversationTitle: 'Deleted Conversation',
      conversationUrl: 'https://chatgpt.com/c/c-empty',
      messages: [],
    });

    await expect(getSession('chatgpt:c-empty')).resolves.toBeUndefined();
    await expect(getMessagesBySessionId('chatgpt:c-empty')).resolves.toEqual([]);
  });
});
