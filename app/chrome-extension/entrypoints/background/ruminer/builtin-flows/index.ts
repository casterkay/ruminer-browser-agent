import type { StoragePort } from '@/entrypoints/background/record-replay-v3/engine/storage/storage-port';

import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import { createChatgptBuiltinFlows } from './chatgpt';

function listBuiltinFlows(nowIso: string): FlowV3[] {
  return [...createChatgptBuiltinFlows(nowIso)];
}

export async function ensureBuiltinFlows(storage: Pick<StoragePort, 'flows'>): Promise<void> {
  const nowIso = new Date().toISOString();
  const builtins = listBuiltinFlows(nowIso);

  for (const flow of builtins) {
    const existing = await storage.flows.get(flow.id);
    if (existing) {
      continue;
    }
    await storage.flows.save(flow);
  }
}
