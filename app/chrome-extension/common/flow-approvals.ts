import { STORAGE_KEYS } from './constants';

export type FlowApprovalRecord = {
  approvedToolsHash: string;
  approvedTools: string[];
  approvedAt: string;
};

export type FlowApprovalsStore = Record<string, FlowApprovalRecord>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytesToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(digest);
}

export function normalizeToolList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const trimmed = value
    .filter((tool): tool is string => typeof tool === 'string')
    .map((tool) => tool.trim())
    .filter(Boolean);

  return Array.from(new Set(trimmed)).sort();
}

export function isToolListSuperset(approvedTools: string[], requiredTools: string[]): boolean {
  const approved = new Set(normalizeToolList(approvedTools));
  const required = normalizeToolList(requiredTools);
  return required.every((tool) => approved.has(tool));
}

export function diffAddedTools(approvedTools: string[], requiredTools: string[]): string[] {
  const approved = new Set(normalizeToolList(approvedTools));
  return normalizeToolList(requiredTools).filter((tool) => !approved.has(tool));
}

export async function computeToolListHash(tools: string[]): Promise<string> {
  const normalized = normalizeToolList(tools);
  return sha256Hex(JSON.stringify(normalized));
}

export async function loadFlowApprovals(): Promise<FlowApprovalsStore> {
  const raw = (await chrome.storage.local.get(STORAGE_KEYS.FLOW_APPROVALS))[
    STORAGE_KEYS.FLOW_APPROVALS
  ];

  return isRecord(raw) ? (raw as FlowApprovalsStore) : {};
}

export async function saveFlowApprovals(store: FlowApprovalsStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.FLOW_APPROVALS]: store });
}
