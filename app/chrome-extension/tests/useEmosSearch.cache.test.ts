import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emosSearchMemories: vi.fn(),
  emosDeleteMemory: vi.fn(),
  getEmosSettings: vi.fn(),
}));

vi.mock(
  '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/emos-client',
  () => ({
    emosSearchMemories: mocks.emosSearchMemories,
    emosDeleteMemory: mocks.emosDeleteMemory,
  }),
);

vi.mock('@/entrypoints/shared/utils/emos-settings', () => ({
  getEmosSettings: mocks.getEmosSettings,
}));

import { useEmosSearch } from '../entrypoints/sidepanel/composables/useEmosSearch';

describe('useEmosSearch cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    mocks.getEmosSettings.mockResolvedValue({ baseUrl: 'http://127.0.0.1:8080', apiKey: 'k' });
    mocks.emosDeleteMemory.mockResolvedValue({});
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
});
