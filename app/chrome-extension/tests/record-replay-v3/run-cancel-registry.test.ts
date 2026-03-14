import { describe, expect, it } from 'vitest';

import {
  clearCancelRequest,
  isCancelRequested,
  requestCancel,
} from '@/entrypoints/background/record-replay-v3/engine/kernel/run-cancel-registry';

describe('run-cancel-registry', () => {
  it('requestCancel/isCancelRequested/clearCancelRequest', () => {
    const runId = 'run_test_cancel_registry';
    expect(isCancelRequested(runId as any)).toBe(false);

    requestCancel(runId as any);
    expect(isCancelRequested(runId as any)).toBe(true);

    clearCancelRequest(runId as any);
    expect(isCancelRequested(runId as any)).toBe(false);
  });

  it('ignores empty runId', () => {
    requestCancel('' as any);
    clearCancelRequest('' as any);
    expect(isCancelRequested('' as any)).toBe(false);
  });
});
