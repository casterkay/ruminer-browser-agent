import type { StoragePort } from '@/entrypoints/background/record-replay-v3/engine/storage/storage-port';

import { normalizeToolList } from '@/common/flow-approvals';
import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import type { ISODateTimeString } from '@/entrypoints/background/record-replay-v3/domain/json';
import { sha256Hex } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/hash';
import { stableJson } from '@/entrypoints/shared/utils/stable-json';
import { createChatgptBuiltinFlows } from './chatgpt';
import { createClaudeBuiltinFlows } from './claude';
import { createDeepseekBuiltinFlows } from './deepseek';
import { createGeminiBuiltinFlows } from './gemini';
import { createGrokBuiltinFlows } from './grok';
import { createSingleIngestBuiltinFlow } from './single-ingest';

function listBuiltinFlows(nowIso: string): FlowV3[] {
  return [
    ...createChatgptBuiltinFlows(nowIso),
    ...createGeminiBuiltinFlows(nowIso),
    ...createClaudeBuiltinFlows(nowIso),
    ...createDeepseekBuiltinFlows(nowIso),
    ...createGrokBuiltinFlows(nowIso),
    createSingleIngestBuiltinFlow(nowIso),
  ];
}

async function computeFlowVersionHash(flow: FlowV3): Promise<string> {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = flow;

  const meta = rest.meta ? { ...rest.meta } : undefined;
  if (meta) {
    delete (meta as Partial<typeof meta>).versionHash;
  }

  const payload: Omit<FlowV3, 'createdAt' | 'updatedAt'> = {
    ...rest,
    ...(meta ? { meta } : {}),
  } as Omit<FlowV3, 'createdAt' | 'updatedAt'>;

  return sha256Hex(stableJson(payload));
}

async function computeExpectedBuiltinHash(flow: FlowV3): Promise<string> {
  const requiredTools = normalizeToolList(flow.meta?.requiredTools);

  const normalized: FlowV3 = {
    ...flow,
    meta: {
      ...(flow.meta ?? {}),
      ...(requiredTools.length > 0 ? { requiredTools } : {}),
    },
  };

  return computeFlowVersionHash(normalized);
}

export async function ensureBuiltinFlows(storage: Pick<StoragePort, 'flows'>): Promise<void> {
  const nowIso = new Date().toISOString() as ISODateTimeString;
  const builtins = listBuiltinFlows(nowIso);

  for (const flow of builtins) {
    const existing = await storage.flows.get(flow.id);
    if (!existing) {
      await storage.flows.save(flow);
      continue;
    }

    // Built-ins are code-shipped system flows. Keep them synced with the shipped definition.
    // We preserve the original createdAt for stability, and bump updatedAt to reflect refresh.
    const expectedHash = await computeExpectedBuiltinHash(flow);
    const existingHash = existing.meta?.versionHash ?? null;

    const shouldRefresh =
      existingHash !== expectedHash || (existing.nodes?.length ?? 0) < (flow.nodes?.length ?? 0);

    if (!shouldRefresh) {
      continue;
    }

    await storage.flows.save({
      ...flow,
      createdAt: existing.createdAt,
      updatedAt: nowIso,
    });
  }
}
