import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { FlowV3 } from '@/entrypoints/background/record-replay-v3/domain/flow';
import {
  FLOW_SCHEMA_VERSION,
  closeRrV3Db,
  deleteRrV3Db,
  resetBreakpointRegistry,
} from '@/entrypoints/background/record-replay-v3';
import { isCancelRequested } from '@/entrypoints/background/record-replay-v3/engine/kernel/run-cancel-registry';

import { createV3E2EHarness, type RpcClient, type V3E2EHarness } from './v3-e2e-harness';

function createDelayedFlow(id: string, delayMs: number): FlowV3 {
  const iso = new Date(0).toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id,
    name: `Delayed Flow ${id}`,
    createdAt: iso,
    updatedAt: iso,
    entryNodeId: 'node-1',
    nodes: [{ id: 'node-1', kind: 'test', config: { action: 'succeed', delayMs } }],
    edges: [],
  };
}

describe('cancel registry integration', () => {
  let h: V3E2EHarness;
  let client: RpcClient;

  beforeEach(async () => {
    await deleteRrV3Db();
    closeRrV3Db();
    resetBreakpointRegistry();

    h = createV3E2EHarness();
    client = h.createClient();
  });

  afterEach(async () => {
    await h.dispose();
  });

  it('rr_v3.cancelRun marks cancel requested while run is executing, then clears after terminal', async () => {
    const flow = createDelayedFlow('flow-cancel-registry', 2_000);
    await h.storage.flows.save(flow);

    const { runId } = await client.call<{ runId: string }>('rr_v3.enqueueRun', { flowId: flow.id });

    // Ensure it has started executing (not queued).
    await h.waitForEvent(runId, (e) => e.type === 'node.started');

    await client.call('rr_v3.cancelRun', { runId, reason: 'test cancel registry' });

    expect(isCancelRequested(runId as any)).toBe(true);

    const run = await h.waitForTerminal(runId);
    expect(run.status).toBe('canceled');

    // The harness executor clears cancel markers after the run completes.
    expect(isCancelRequested(runId as any)).toBe(false);
  });
});
