import { describe, expect, it } from 'vitest';

import { selectVisitedConversationItems } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/scan-heuristic';

describe('ruminer.scan_conversation_list heuristic', () => {
  it('stops after N consecutive index-aligned matches', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
    const visited = selectVisitedConversationItems(items, {
      isFullScan: false,
      conversationOrder: ['a', 'b', 'c', 'd', 'e'],
      heuristicMatchStreak: 3,
      maxItemsPerRun: 50,
    });

    expect(visited.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('includes leading mismatches before stopping once streak is reached', () => {
    const items = ['x', 'a', 'b', 'c', 'd'].map((id) => ({ id }));
    const visited = selectVisitedConversationItems(items, {
      isFullScan: false,
      conversationOrder: ['y', 'a', 'b', 'c', 'd'],
      heuristicMatchStreak: 3,
      maxItemsPerRun: 50,
    });

    expect(visited.map((i) => i.id)).toEqual(['x', 'a', 'b', 'c']);
  });

  it('full scan ignores heuristic stop', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const visited = selectVisitedConversationItems(items, {
      isFullScan: true,
      conversationOrder: ['a', 'b', 'c', 'd'],
      heuristicMatchStreak: 3,
      maxItemsPerRun: 50,
    });

    expect(visited.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('respects maxItemsPerRun', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const visited = selectVisitedConversationItems(items, {
      isFullScan: true,
      conversationOrder: [],
      heuristicMatchStreak: 3,
      maxItemsPerRun: 2,
    });

    expect(visited.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
