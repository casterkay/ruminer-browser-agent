export type WorkflowAccessStatus = 'guest' | 'free' | 'pro';
export type WorkflowBillingState =
  | 'none'
  | 'active'
  | 'trialing'
  | 'canceling'
  | 'past_due'
  | 'unpaid'
  | 'canceled';
export type WorkflowAccessDecision = 'allowed' | 'blocked';
export type WorkflowAccessBlockReason =
  | 'billing_recovery_required'
  | 'link_incomplete'
  | 'pro_required'
  | 'sign_in_required'
  | 'sync_failed';

export type WorkflowAccessUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
};

export type HostedWorkflowAccessSnapshot = {
  status: 'free' | 'pro';
  billingState: WorkflowBillingState;
  workflowAccess: WorkflowAccessDecision;
  blockReason: WorkflowAccessBlockReason | null;
  isActive: boolean;
  plan: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  linkedAt: string;
  user: WorkflowAccessUser;
};

export type WorkflowAccessLinkSession = {
  sessionId: string;
  verifier: string;
  verificationUrl: string;
  expiresAt: string;
  pollAfterMs: number;
};

export type WorkflowAccessLinkPollStatus =
  | {
      status: 'pending';
      expiresAt: string;
    }
  | {
      status: 'completed';
      expiresAt: string;
      access: HostedWorkflowAccessSnapshot;
      linkToken?: string;
    }
  | {
      status: 'expired' | 'not_found';
    };

export type WorkflowAccessState = {
  status: WorkflowAccessStatus;
  billingState: WorkflowBillingState;
  workflowAccess: WorkflowAccessDecision;
  blockReason: WorkflowAccessBlockReason | null;
  isActive: boolean;
  plan: string | null;
  subscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  user: WorkflowAccessUser | null;
  syncing: boolean;
  error: string | null;
  pendingLink: WorkflowAccessLinkSession | null;
  lastSyncedAt: number | null;
};

export const DEFAULT_WORKFLOW_ACCESS_STATE: WorkflowAccessState = {
  status: 'guest',
  billingState: 'none',
  workflowAccess: 'blocked',
  blockReason: 'sign_in_required',
  isActive: false,
  plan: null,
  subscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  user: null,
  syncing: false,
  error: null,
  pendingLink: null,
  lastSyncedAt: null,
};

function readEnvString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUser(value: unknown): WorkflowAccessUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const user = value as Record<string, unknown>;
  if (typeof user.id !== 'string' || !user.id.trim()) {
    return null;
  }

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
    name: typeof user.name === 'string' ? user.name : null,
    image: typeof user.image === 'string' ? user.image : null,
  };
}

function normalizePendingLink(value: unknown): WorkflowAccessLinkSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const link = value as Record<string, unknown>;
  if (
    typeof link.sessionId !== 'string' ||
    typeof link.verifier !== 'string' ||
    typeof link.verificationUrl !== 'string' ||
    typeof link.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    sessionId: link.sessionId,
    verifier: link.verifier,
    verificationUrl: link.verificationUrl,
    expiresAt: link.expiresAt,
    pollAfterMs:
      typeof link.pollAfterMs === 'number' && Number.isFinite(link.pollAfterMs)
        ? Math.max(500, Math.floor(link.pollAfterMs))
        : 2000,
  };
}

function normalizeStatus(value: unknown): WorkflowAccessStatus {
  return value === 'free' || value === 'pro' ? value : 'guest';
}

function normalizeBillingState(value: unknown): WorkflowBillingState {
  switch (value) {
    case 'active':
    case 'trialing':
    case 'canceling':
    case 'past_due':
    case 'unpaid':
    case 'canceled':
      return value;
    default:
      return 'none';
  }
}

function normalizeWorkflowAccess(value: unknown, fallbackStatus: WorkflowAccessStatus) {
  if (value === 'allowed' || value === 'blocked') {
    return value;
  }
  return fallbackStatus === 'pro' ? 'allowed' : 'blocked';
}

function normalizeBlockReason(
  value: unknown,
  workflowAccess: WorkflowAccessDecision,
  fallbackStatus: WorkflowAccessStatus,
): WorkflowAccessBlockReason | null {
  if (workflowAccess === 'allowed') {
    return null;
  }

  switch (value) {
    case 'billing_recovery_required':
    case 'link_incomplete':
    case 'pro_required':
    case 'sign_in_required':
    case 'sync_failed':
      return value;
    default:
      return fallbackStatus === 'free' ? 'pro_required' : 'sign_in_required';
  }
}

export function normalizeWorkflowAccessState(value: unknown): WorkflowAccessState {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_WORKFLOW_ACCESS_STATE };
  }

  const state = value as Record<string, unknown>;
  const status = normalizeStatus(state.status);
  const billingState = normalizeBillingState(state.billingState);
  const workflowAccess = normalizeWorkflowAccess(state.workflowAccess, status);

  return {
    status,
    billingState,
    workflowAccess,
    blockReason: normalizeBlockReason(state.blockReason, workflowAccess, status),
    isActive: state.isActive === true,
    plan: typeof state.plan === 'string' ? state.plan : null,
    subscriptionId: typeof state.subscriptionId === 'string' ? state.subscriptionId : null,
    currentPeriodEnd:
      typeof state.currentPeriodEnd === 'string' && state.currentPeriodEnd.trim()
        ? state.currentPeriodEnd
        : null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd === true,
    user: normalizeUser(state.user),
    syncing: state.syncing === true,
    error: typeof state.error === 'string' && state.error.trim() ? state.error : null,
    pendingLink: normalizePendingLink(state.pendingLink),
    lastSyncedAt:
      typeof state.lastSyncedAt === 'number' && Number.isFinite(state.lastSyncedAt)
        ? state.lastSyncedAt
        : null,
  };
}

export function applyHostedWorkflowAccessSnapshot(
  access: HostedWorkflowAccessSnapshot,
): WorkflowAccessState {
  return {
    status: access.status,
    billingState: access.billingState,
    workflowAccess: access.workflowAccess,
    blockReason: access.blockReason,
    isActive: access.isActive,
    plan: access.plan,
    subscriptionId: access.subscriptionId,
    currentPeriodEnd: access.currentPeriodEnd,
    cancelAtPeriodEnd: access.cancelAtPeriodEnd,
    user: access.user,
    syncing: false,
    error: null,
    pendingLink: null,
    lastSyncedAt: Date.now(),
  };
}

export function hasWorkflowAccess(state: WorkflowAccessState): boolean {
  return state.workflowAccess === 'allowed' && state.status === 'pro' && state.isActive === true;
}

export function getRuminerHostedAppUrl(): string {
  const configured = readEnvString(
    import.meta.env.WXT_PUBLIC_RUMINER_WEB_URL ?? import.meta.env.VITE_RUMINER_WEB_URL,
  );
  return configured || 'http://localhost:3000';
}

export function getRuminerHostedUrl(path: string): string {
  return new URL(path, getRuminerHostedAppUrl()).toString();
}
