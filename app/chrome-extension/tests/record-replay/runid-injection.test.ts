import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractHandler } from '@/entrypoints/background/record-replay/actions/handlers/extract';
import { runWorkflowScriptInTab } from '@/entrypoints/background/record-replay-v3/engine/plugins/ruminer-ingest/utils';

function mockExecuteScript(): void {
  (chrome as any).scripting = {
    executeScript: vi.fn(async (opts: any) => {
      const result = await opts.func(...(opts.args ?? []));
      return [{ result }];
    }),
  };
}

describe('__rr_v3_runId injection', () => {
  beforeEach(() => {
    mockExecuteScript();
  });

  it('injects __rr_v3_runId for v2 extract(js) actions', async () => {
    const ctx: any = {
      vars: {},
      tabId: 1,
      runId: 'run_test_123',
      log: vi.fn(),
    };

    const action: any = {
      id: 'a1',
      type: 'extract',
      params: {
        mode: 'js',
        saveAs: 'out',
        code: 'return typeof __rr_v3_runId === "string" ? __rr_v3_runId : null;',
      },
    };

    const r = await extractHandler.run(ctx, action);
    expect(r.status).toBe('success');
    expect(ctx.vars.out).toBe('run_test_123');
  });

  it('injects __rr_v3_runId for ruminer runWorkflowScriptInTab()', async () => {
    const r = await runWorkflowScriptInTab(1, {
      runId: 'run_test_456',
      input: null,
      vars: {},
      script: 'return typeof __rr_v3_runId === "string" ? __rr_v3_runId : null;',
    });

    expect(r).toEqual({ ok: true, value: 'run_test_456' });
  });
});
