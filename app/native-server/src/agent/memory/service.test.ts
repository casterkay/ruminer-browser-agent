import { describe, expect, jest, test } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('memory service conversation replacement', () => {
  test('uses canonical document/title file names and removes stale rows on shrinkage', async () => {
    const dataDir = path.join('/tmp', 'ruminer-test', `memory-service-${Date.now()}`);
    process.env.CHROME_MCP_AGENT_DATA_DIR = dataDir;
    jest.resetModules();

    const { getDb } = await import('../db/client');
    const { updateMemorySettings } = await import('./settings-service');
    const { replaceMemoryConversation } = await import('./service');

    const db = getDb();
    db.run('DELETE FROM memory_messages');
    db.run('DELETE FROM memory_documents');
    db.run('DELETE FROM memory_settings');

    await updateMemorySettings({
      backend: 'local_markdown_qmd',
      localRootPath: path.join(dataDir, 'memory'),
    });

    await replaceMemoryConversation({
      messages: [
        {
          message_id: 'chatgpt:c1:0',
          create_time: '2024-01-01T00:00:00Z',
          sender: 'me',
          sender_name: 'Me',
          role: 'user',
          content: 'hello',
          group_id: 'chatgpt:c1',
          group_name: 'My Great Chat',
          source_platform: 'chatgpt',
          conversation_id: 'c1',
          metadata: { message_index: 0 },
        },
        {
          message_id: 'chatgpt:c1:1',
          create_time: '2024-01-01T00:01:00Z',
          sender: 'tool',
          sender_name: 'Tool',
          role: 'tool',
          content: 'tool secret',
          group_id: 'chatgpt:c1',
          group_name: 'My Great Chat',
          source_platform: 'chatgpt',
          conversation_id: 'c1',
          metadata: { message_index: 1 },
        },
      ],
    });

    await replaceMemoryConversation({
      messages: [
        {
          message_id: 'chatgpt:c1:0',
          create_time: '2024-01-01T00:00:00Z',
          sender: 'me',
          sender_name: 'Me',
          role: 'user',
          content: 'shorter',
          group_id: 'chatgpt:c1',
          group_name: 'My Great Chat',
          source_platform: 'chatgpt',
          conversation_id: 'c1',
          metadata: { message_index: 0 },
        },
      ],
    });

    const docs = db.all<{ id: string; relativePath: string; filePath: string }>(
      'SELECT id, relative_path AS relativePath, file_path AS filePath FROM memory_documents',
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].id).toBe('chatgpt:c1');
    expect(docs[0].relativePath).toBe('conversations/my-great-chat--chatgpt-c1.md');

    const rows = db.all<{ id: string; content: string }>(
      'SELECT id, content FROM memory_messages ORDER BY message_index',
    );
    expect(rows).toEqual([{ id: 'chatgpt:c1:0', content: 'shorter' }]);

    const markdown = await readFile(docs[0].filePath, 'utf8');
    expect(markdown).toContain('shorter');
    expect(markdown).not.toContain('tool secret');
  });

  test('empty replacement clears an existing local conversation', async () => {
    const dataDir = path.join('/tmp', 'ruminer-test', `memory-service-empty-${Date.now()}`);
    process.env.CHROME_MCP_AGENT_DATA_DIR = dataDir;
    jest.resetModules();

    const { getDb } = await import('../db/client');
    const { updateMemorySettings } = await import('./settings-service');
    const { replaceMemoryConversation } = await import('./service');

    const db = getDb();
    db.run('DELETE FROM memory_messages');
    db.run('DELETE FROM memory_documents');
    db.run('DELETE FROM memory_settings');

    await updateMemorySettings({
      backend: 'local_markdown_qmd',
      localRootPath: path.join(dataDir, 'memory'),
    });

    await replaceMemoryConversation({
      messages: [
        {
          message_id: 'chatgpt:c-empty:0',
          create_time: '2024-01-01T00:00:00Z',
          sender: 'me',
          role: 'user',
          content: 'to be removed',
          group_id: 'chatgpt:c-empty',
          group_name: 'Deleted Chat',
          source_platform: 'chatgpt',
          conversation_id: 'c-empty',
          metadata: { message_index: 0 },
        },
      ],
    });

    await replaceMemoryConversation({
      platform: 'chatgpt',
      conversationId: 'c-empty',
      messages: [],
    });

    const activeDocs = db.all<{ id: string }>(
      'SELECT id FROM memory_documents WHERE deleted_at IS NULL',
    );
    expect(activeDocs).toEqual([]);

    const activeMessages = db.all<{ id: string }>(
      'SELECT id FROM memory_messages WHERE deleted_at IS NULL',
    );
    expect(activeMessages).toEqual([]);
  });
});
