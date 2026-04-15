import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emosGetMemories: vi.fn(),
  emosSearchMemories: vi.fn(),
  emosDeleteMemory: vi.fn(),
  getMemoryStatus: vi.fn(),
}));

vi.mock(
  '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-client',
  () => ({
    emosGetMemories: mocks.emosGetMemories,
    emosSearchMemories: mocks.emosSearchMemories,
    emosDeleteMemory: mocks.emosDeleteMemory,
    getMemoryStatus: mocks.getMemoryStatus,
  }),
);

import { useEmosSearch } from '../entrypoints/sidepanel/composables/useEmosSearch';

describe('useEmosSearch cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    mocks.getMemoryStatus.mockResolvedValue({
      backend: 'local_markdown_qmd',
      configured: true,
      localRootPath: '/tmp/memory-store',
      qmdIndexPath: '/tmp/memory-store/index.sqlite',
      qmdAvailable: false,
      qmdEnabled: false,
      totalDocuments: 0,
      totalMessages: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    mocks.emosDeleteMemory.mockResolvedValue({});
    mocks.emosGetMemories.mockResolvedValue({
      result: {
        memories: [
          {
            message_id: 'm1',
            content: 'hello',
            group_id: 'chatgpt:g1',
            create_time: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });
    mocks.emosSearchMemories.mockResolvedValue({
      result: {
        memories: [
          {
            message_id: 'm1',
            content: 'hello',
            group_id: 'chatgpt:g1',
            create_time: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes identical searches within TTL', async () => {
    const memory = useEmosSearch();
    memory.clearCache();

    await memory.search({ query: 'hi', speakers: ['me'] });
    await memory.search({ query: 'hi', speakers: ['me'] });

    expect(mocks.emosSearchMemories).toHaveBeenCalledTimes(1);
    expect(memory.items.value).toHaveLength(1);
    expect(memory.items.value[0].message_id).toBe('m1');
  });

  it('reuses cached result across platform filters', async () => {
    const memory = useEmosSearch();
    memory.clearCache();

    await memory.search({ query: 'hi', speakers: ['me'], platform: undefined });
    await memory.search({ query: 'hi', speakers: ['me'], platform: ['chatgpt'] });
    await memory.search({ query: 'hi', speakers: ['me'], platform: ['openclaw'] });

    expect(mocks.emosSearchMemories).toHaveBeenCalledTimes(1);
    expect(memory.items.value).toHaveLength(0);
  });

  it('expires cache entries after TTL', async () => {
    const memory = useEmosSearch();
    memory.clearCache();

    await memory.search({ query: 'hi', speakers: ['me'] });
    vi.setSystemTime(Date.now() + 31_000);
    await memory.search({ query: 'hi', speakers: ['me'] });

    expect(mocks.emosSearchMemories).toHaveBeenCalledTimes(2);
  });

  it('clearCache forces refetch', async () => {
    const memory = useEmosSearch();
    memory.clearCache();

    await memory.search({ query: 'hi', speakers: ['me'] });
    memory.clearCache();
    await memory.search({ query: 'hi', speakers: ['me'] });

    expect(mocks.emosSearchMemories).toHaveBeenCalledTimes(2);
  });

  it('uses read memories when query is blank', async () => {
    const memory = useEmosSearch();
    memory.clearCache();

    await memory.search({ query: '', speakers: ['me'] });

    expect(mocks.emosGetMemories).toHaveBeenCalledTimes(1);
    expect(mocks.emosSearchMemories).not.toHaveBeenCalled();
    expect(memory.items.value).toHaveLength(1);
    expect(memory.items.value[0].message_id).toBe('m1');
  });
});
