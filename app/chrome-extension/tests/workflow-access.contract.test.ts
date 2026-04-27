import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_WORKFLOW_ACCESS_STATE,
  applyHostedWorkflowAccessSnapshot,
  hasWorkflowAccess,
  normalizeWorkflowAccessState,
} from '@/common/workflow-access';
import {
  formatWorkflowAccessDeniedReason,
  getWorkflowAccessDenialReason,
  refreshWorkflowAccessState,
  resetWorkflowAccessStateCache,
} from '@/entrypoints/background/workflow-access';

describe('workflow access (contract)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetWorkflowAccessStateCache();
  });

  it('falls back to the default guest state for malformed payloads', () => {
    expect(normalizeWorkflowAccessState(null)).toEqual(DEFAULT_WORKFLOW_ACCESS_STATE);
    expect(normalizeWorkflowAccessState('invalid')).toEqual(DEFAULT_WORKFLOW_ACCESS_STATE);
  });

  it('normalizes transient workflow access fields defensively', () => {
    expect(
      normalizeWorkflowAccessState({
        status: 'free',
        billingState: 'past_due',
        workflowAccess: 'blocked',
        blockReason: 'billing_recovery_required',
        isActive: true,
        plan: 'pro',
        subscriptionId: 'sub_123',
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        cancelAtPeriodEnd: true,
        user: {
          id: 'user_123',
          email: 'hello@ruminer.app',
          name: 'Ruminer',
          image: 42,
        },
        syncing: true,
        error: '   ',
        pendingLink: {
          sessionId: 'session_123',
          verifier: 'verifier_123',
          verificationUrl: 'https://example.com/link',
          expiresAt: '2026-01-01T00:00:00.000Z',
          pollAfterMs: 120,
        },
        lastSyncedAt: 123456,
      }),
    ).toEqual({
      status: 'free',
      billingState: 'past_due',
      workflowAccess: 'blocked',
      blockReason: 'billing_recovery_required',
      isActive: true,
      plan: 'pro',
      subscriptionId: 'sub_123',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
      user: {
        id: 'user_123',
        email: 'hello@ruminer.app',
        name: 'Ruminer',
        image: null,
      },
      syncing: true,
      error: null,
      pendingLink: {
        sessionId: 'session_123',
        verifier: 'verifier_123',
        verificationUrl: 'https://example.com/link',
        expiresAt: '2026-01-01T00:00:00.000Z',
        pollAfterMs: 500,
      },
      lastSyncedAt: 123456,
    });
  });

  it('applies hosted snapshots as an active synced access state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));

    expect(
      applyHostedWorkflowAccessSnapshot({
        status: 'pro',
        billingState: 'active',
        workflowAccess: 'allowed',
        blockReason: null,
        isActive: true,
        plan: 'ruminer-pro',
        subscriptionId: 'sub_123',
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        linkedAt: '2026-01-02T03:00:00.000Z',
        user: {
          id: 'user_123',
          email: 'hello@ruminer.app',
          name: 'Ruminer',
          image: null,
        },
      }),
    ).toEqual({
      status: 'pro',
      billingState: 'active',
      workflowAccess: 'allowed',
      blockReason: null,
      isActive: true,
      plan: 'ruminer-pro',
      subscriptionId: 'sub_123',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      user: {
        id: 'user_123',
        email: 'hello@ruminer.app',
        name: 'Ruminer',
        image: null,
      },
      syncing: false,
      error: null,
      pendingLink: null,
      lastSyncedAt: Date.parse('2026-01-02T03:04:05.000Z'),
    });
  });

  it('maps access states to the correct denial reasons', () => {
    expect(
      getWorkflowAccessDenialReason({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        status: 'pro',
        workflowAccess: 'allowed',
        billingState: 'active',
        isActive: true,
      }),
    ).toBeNull();

    expect(
      getWorkflowAccessDenialReason({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        syncing: true,
      }),
    ).toBe('link_incomplete');

    expect(
      getWorkflowAccessDenialReason({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        status: 'free',
      }),
    ).toBe('pro_required');

    expect(
      getWorkflowAccessDenialReason({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        status: 'pro',
        isActive: false,
        billingState: 'past_due',
        workflowAccess: 'blocked',
        blockReason: 'billing_recovery_required',
      }),
    ).toBe('billing_recovery_required');

    expect(getWorkflowAccessDenialReason(DEFAULT_WORKFLOW_ACCESS_STATE)).toBe('sign_in_required');
  });

  it('uses one shared predicate for active Pro workflow access', () => {
    expect(
      hasWorkflowAccess({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        status: 'pro',
        workflowAccess: 'allowed',
        billingState: 'active',
        isActive: true,
      }),
    ).toBe(true);

    expect(
      hasWorkflowAccess({
        ...DEFAULT_WORKFLOW_ACCESS_STATE,
        status: 'pro',
        workflowAccess: 'blocked',
        billingState: 'active',
        isActive: true,
      }),
    ).toBe(false);
  });

  it('fails closed when a linked workflow access state has no persisted link token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));

    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: unknown) => {
      const requested = Array.isArray(keys) ? keys : [keys];
      if (requested.includes('workflowAccessState')) {
        return {
          workflowAccessState: {
            status: 'pro',
            billingState: 'active',
            workflowAccess: 'allowed',
            blockReason: null,
            isActive: true,
            plan: 'pro',
            subscriptionId: 'sub_123',
            currentPeriodEnd: '2026-02-01T00:00:00.000Z',
            cancelAtPeriodEnd: false,
            user: { id: 'user_123', email: 'hello@ruminer.app', name: null, image: null },
            syncing: false,
            error: null,
            pendingLink: null,
            lastSyncedAt: Date.now(),
          },
        };
      }
      return {};
    });

    const state = await refreshWorkflowAccessState();

    expect(state.workflowAccess).toBe('blocked');
    expect(state.blockReason).toBe('sign_in_required');
    expect(state.isActive).toBe(false);
    expect(state.user).toBeNull();
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowAccessState: expect.objectContaining({
          workflowAccess: 'blocked',
          error: 'This browser link is missing. Sign in again to unlock workflows.',
        }),
      }),
    );
  });

  it('formats denial reasons with user-facing copy', () => {
    expect(formatWorkflowAccessDeniedReason('link_incomplete')).toBe(
      'Finish linking this browser to Ruminer Pro before using workflows.',
    );
    expect(formatWorkflowAccessDeniedReason('pro_required')).toBe(
      'Ruminer Pro is required to use workflows.',
    );
    expect(formatWorkflowAccessDeniedReason('sign_in_required')).toBe(
      'Sign in to Ruminer and attach Ruminer Pro before using workflows.',
    );
    expect(formatWorkflowAccessDeniedReason('billing_recovery_required')).toBe(
      'Update your Ruminer Pro billing details before using workflows.',
    );
  });
});
