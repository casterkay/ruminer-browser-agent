export interface ScanHeuristicOptions {
  isFullScan: boolean;
  conversationOrder: readonly string[];
  heuristicMatchStreak: number;
  maxItemsPerRun: number;
}

function clampInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

export function selectVisitedConversationItems<T extends { id: string }>(
  items: readonly T[],
  opts: ScanHeuristicOptions,
): T[] {
  const maxItemsPerRun = Math.max(1, clampInt(opts.maxItemsPerRun, 50));
  const heuristicMatchStreak = Math.max(1, clampInt(opts.heuristicMatchStreak, 3));

  const limited = items.slice(0, maxItemsPerRun);
  if (opts.isFullScan) {
    return [...limited];
  }

  const visited: T[] = [];
  let matchStreak = 0;

  for (let i = 0; i < limited.length; i++) {
    const item = limited[i];
    visited.push(item);

    const expectedId = opts.conversationOrder[i];
    if (expectedId && expectedId === item.id) {
      matchStreak += 1;
    } else {
      matchStreak = 0;
    }

    if (matchStreak >= heuristicMatchStreak) {
      break;
    }
  }

  return visited;
}
