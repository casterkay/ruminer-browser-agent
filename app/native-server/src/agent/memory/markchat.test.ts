import {
  buildConversationParticipants,
  formatMarkChatTimestamp,
  normalizeMarkChatBody,
  renderConversationMarkdown,
} from './markchat';

describe('MarkChat renderer', () => {
  test('renders MarkChat-compatible frontmatter and transcript', () => {
    const markdown = renderConversationMarkdown({
      metadata: {
        sessionId: 'chatgpt:conv-123',
        timestamp: '2024-12-17T10:00:00Z',
        title: 'Philosophy chat',
        description: 'Conversation normalized into local markdown memory.',
        sourcePlatform: 'chatgpt',
        conversationId: 'conv-123',
        groupId: 'chatgpt:conv-123',
        groupName: 'ChatGPT conversation',
        sourceUrl: 'https://chat.openai.com/c/conv-123',
      },
      messages: [
        {
          messageId: 'm1',
          createdAt: '2024-12-17T10:01:00Z',
          sender: 'me',
          senderName: 'Philosopher',
          role: 'user',
          content: 'How does time shape memory?',
        },
        {
          messageId: 'm2',
          createdAt: '2024-12-17T10:02:00Z',
          sender: 'bot',
          senderName: 'AssistantAI',
          role: 'assistant',
          content: 'It changes emphasis.\n---\nIt also changes interpretation.',
        },
      ],
    });

    expect(markdown).toContain('session_id: "chatgpt:conv-123"');
    expect(markdown).toContain('schema_version: "1.0"');
    expect(markdown).toContain('source_platform: "chatgpt"');
    expect(markdown).toContain(
      'participants:\n  - id: "me"\n    name: "Philosopher"\n    role: "human"',
    );
    expect(markdown).toContain(
      'Philosopher [2024-12-17,10:01:00]\n---\n\nHow does time shape memory?',
    );
    expect(markdown).toContain(
      'AssistantAI [2024-12-17,10:02:00]\n---\n\nIt changes emphasis.\n\n---\n\nIt also changes interpretation.',
    );
    expect(markdown.endsWith('\n')).toBe(true);
  });

  test('derives stable participants and formats timestamps', () => {
    expect(formatMarkChatTimestamp('2024-12-17T10:15:00Z')).toBe('2024-12-17,10:15:00');
    expect(normalizeMarkChatBody('Heading\n---\nBody')).toBe('Heading\n\n---\n\nBody');
    expect(
      buildConversationParticipants([
        {
          messageId: 'm1',
          createdAt: '2024-12-17T10:01:00Z',
          sender: 'me',
          senderName: 'Philosopher',
          role: 'user',
          content: 'Hello',
        },
        {
          messageId: 'm2',
          createdAt: '2024-12-17T10:02:00Z',
          sender: 'bot',
          senderName: 'AssistantAI',
          role: 'assistant',
          content: 'Hi',
        },
      ]),
    ).toEqual([
      { id: 'me', name: 'Philosopher', role: 'human' },
      { id: 'bot', name: 'AssistantAI', role: 'bot' },
    ]);
  });
});
