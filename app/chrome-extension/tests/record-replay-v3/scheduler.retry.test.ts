import { describe, expect, it } from 'vitest';

import type { RunId } from '@/entrypoints/background/record-replay-v3/domain/ids';
import type { RunRecordV3 } from '@/entrypoints/background/record-replay-v3/domain/events';
import { RR_ERROR_CODES } from '@/entrypoints/background/record-replay-v3/domain/errors';
import type { LeaseManager } from '@/entrypoints/background/record-replay-v3/engine/queue/leasing';
import type { RunQueueConfig } from '@/entrypoints/background/record-replay-v3/engine/queue/queue';
import {
  createRunScheduler,
  type RunExecutor,
} from '@/entrypoints/background/record-replay-v3/engine/queue/scheduler';

function createSilentLogger(): Pick<Console, 'debug' | 'info' | 'warn' | 'error'> {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

const noopKeepalive = {
  acquire: () => () => {},
};

const noopLeaseManager: Pick<
  LeaseManager,
  'startHeartbeat' | 'stopHeartbeat' | 'reclaimExpiredLeases'
> = {
  startHeartbeat: () => {},
  stopHeartbeat: () => {},
  reclaimExpiredLeases: async () => [],
};

function makeFailedRunRecord(runId: string, patch?: Partial<RunRecordV3>): RunRecordV3 {
  const ts = Date.now();
  return {
    schemaVersion: 3,
    id: runId as RunId,
    flowId: 'flow-1' as any,
    status: 'failed',
    createdAt: ts,
    updatedAt: ts,
    attempt: 0,
    maxAttempts: 3,
    error: { code: RR_ERROR_CODES.TIMEOUT, message: 'timeout' },
    nextSeq: 0,
    ...patch,
  };
}

describe('V3 RunScheduler retry policy', () => {
  const config: RunQueueConfig = {
    maxParallelRuns: 1,
    leaseTtlMs: 15_000,
    heartbeatIntervalMs: 5_000,
  };

  it('requeues failed retryable runs while attempts remain', async () => {
    const now = Date.now();
    const runId = 'run-retry-1';

    const runRecord = makeFailedRunRecord(runId);
    const runs = {
      get: async () => runRecord,
      patch: async (_runId: string, patch: Partial<RunRecordV3>) => {
        Object.assign(runRecord, patch);
      },
    };

    let claimed = false;
    let requeued = false;
    let markedDone = false;

    const queue = {
      claimNext: async () => {
        if (claimed) return null;
        claimed = true;
        return {
          id: runId,
          flowId: 'flow-1',
          status: 'running',
          createdAt: now,
          updatedAt: now,
          priority: 0,
          attempt: 1,
          maxAttempts: 3,
        } as any;
      },
      requeue: async () => {
        requeued = true;
      },
      markDone: async () => {
        markedDone = true;
      },
    };

    const execute: RunExecutor = async () => {};

    const scheduler = createRunScheduler({
      queue,
      runs,
      leaseManager: noopLeaseManager,
      keepalive: noopKeepalive,
      config,
      ownerId: 'owner-1',
      execute,
      tuning: { pollIntervalMs: 0, reclaimIntervalMs: 0 },
      logger: createSilentLogger(),
    });

    scheduler.start();
    await scheduler.kick();

    // Wait for finalize() (best-effort; scheduler.kick does not await execution completion)
    for (let i = 0; i < 50 && !requeued && !markedDone; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    scheduler.stop();

    expect(requeued).toBe(true);
    expect(markedDone).toBe(false);
    expect(runRecord.status).toBe('queued');
    expect(runRecord.error).toBeUndefined();
  });

  it('does not retry when maxAttempts is reached', async () => {
    const now = Date.now();
    const runId = 'run-retry-2';

    const runRecord = makeFailedRunRecord(runId);
    const runs = {
      get: async () => runRecord,
      patch: async (_runId: string, patch: Partial<RunRecordV3>) => {
        Object.assign(runRecord, patch);
      },
    };

    let claimed = false;
    let requeued = false;
    let markedDone = false;

    const queue = {
      claimNext: async () => {
        if (claimed) return null;
        claimed = true;
        return {
          id: runId,
          flowId: 'flow-1',
          status: 'running',
          createdAt: now,
          updatedAt: now,
          priority: 0,
          attempt: 3,
          maxAttempts: 3,
        } as any;
      },
      requeue: async () => {
        requeued = true;
      },
      markDone: async () => {
        markedDone = true;
      },
    };

    const execute: RunExecutor = async () => {};

    const scheduler = createRunScheduler({
      queue,
      runs,
      leaseManager: noopLeaseManager,
      keepalive: noopKeepalive,
      config,
      ownerId: 'owner-1',
      execute,
      tuning: { pollIntervalMs: 0, reclaimIntervalMs: 0 },
      logger: createSilentLogger(),
    });

    scheduler.start();
    await scheduler.kick();

    for (let i = 0; i < 50 && !requeued && !markedDone; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    scheduler.stop();

    expect(requeued).toBe(false);
    expect(markedDone).toBe(true);
  });

  it('does not retry non-retryable errors', async () => {
    const now = Date.now();
    const runId = 'run-retry-3';

    const runRecord = makeFailedRunRecord(runId, {
      error: { code: RR_ERROR_CODES.VALIDATION_ERROR, message: 'bad' },
    });
    const runs = {
      get: async () => runRecord,
      patch: async (_runId: string, patch: Partial<RunRecordV3>) => {
        Object.assign(runRecord, patch);
      },
    };

    let claimed = false;
    let requeued = false;
    let markedDone = false;

    const queue = {
      claimNext: async () => {
        if (claimed) return null;
        claimed = true;
        return {
          id: runId,
          flowId: 'flow-1',
          status: 'running',
          createdAt: now,
          updatedAt: now,
          priority: 0,
          attempt: 1,
          maxAttempts: 3,
        } as any;
      },
      requeue: async () => {
        requeued = true;
      },
      markDone: async () => {
        markedDone = true;
      },
    };

    const execute: RunExecutor = async () => {};

    const scheduler = createRunScheduler({
      queue,
      runs,
      leaseManager: noopLeaseManager,
      keepalive: noopKeepalive,
      config,
      ownerId: 'owner-1',
      execute,
      tuning: { pollIntervalMs: 0, reclaimIntervalMs: 0 },
      logger: createSilentLogger(),
    });

    scheduler.start();
    await scheduler.kick();

    for (let i = 0; i < 50 && !requeued && !markedDone; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    scheduler.stop();

    expect(requeued).toBe(false);
    expect(markedDone).toBe(true);
  });
});
