import { STORAGE_KEYS } from '@/common/constants';

export type ToolGroupId = 'observe' | 'navigate' | 'interact' | 'execute' | 'workflow';

export interface ToolGroupState {
  observe: boolean;
  navigate: boolean;
  interact: boolean;
  execute: boolean;
  workflow: boolean;
  updatedAt: string;
}

const DEFAULT_TOOL_GROUP_STATE: ToolGroupState = {
  observe: true,
  navigate: true,
  interact: false,
  execute: false,
  workflow: true,
  updatedAt: new Date(0).toISOString(),
};

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function getDefaultToolGroupState(): ToolGroupState {
  return {
    ...DEFAULT_TOOL_GROUP_STATE,
    updatedAt: new Date().toISOString(),
  };
}

export async function getToolGroupState(): Promise<ToolGroupState> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.TOOL_GROUP_STATE))[
      STORAGE_KEYS.TOOL_GROUP_STATE
    ] || {};

  return {
    observe: normalizeBoolean(raw.observe, DEFAULT_TOOL_GROUP_STATE.observe),
    navigate: normalizeBoolean(raw.navigate, DEFAULT_TOOL_GROUP_STATE.navigate),
    interact: normalizeBoolean(raw.interact, DEFAULT_TOOL_GROUP_STATE.interact),
    execute: normalizeBoolean(raw.execute, DEFAULT_TOOL_GROUP_STATE.execute),
    workflow: normalizeBoolean(raw.workflow, DEFAULT_TOOL_GROUP_STATE.workflow),
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.length > 0
        ? raw.updatedAt
        : DEFAULT_TOOL_GROUP_STATE.updatedAt,
  };
}

export async function setToolGroupState(
  patch: Partial<Omit<ToolGroupState, 'updatedAt'>>,
): Promise<ToolGroupState> {
  const current = await getToolGroupState();
  const next: ToolGroupState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.TOOL_GROUP_STATE]: next });
  return next;
}

export async function setToolGroupEnabled(
  groupId: ToolGroupId,
  enabled: boolean,
): Promise<ToolGroupState> {
  return setToolGroupState({ [groupId]: enabled } as Partial<Omit<ToolGroupState, 'updatedAt'>>);
}

export async function isToolGroupEnabled(groupId: ToolGroupId): Promise<boolean> {
  const state = await getToolGroupState();
  return state[groupId];
}

export function getDisabledToolGroups(state: ToolGroupState): ToolGroupId[] {
  return (Object.keys(state) as (keyof ToolGroupState)[])
    .filter((key): key is ToolGroupId => key !== 'updatedAt')
    .filter((key) => state[key] === false);
}

export function buildToolGroupRestrictionText(state: ToolGroupState): string {
  const disabled = getDisabledToolGroups(state);
  if (disabled.length === 0) {
    return '';
  }

  const lines = disabled.map((groupId) => {
    switch (groupId) {
      case 'interact':
        return '- Interact: disabled (no DOM interaction, cookie-network/file tools, or bookmarks writes)';
      case 'execute':
        return '- Execute: disabled (no JavaScript eval/injection tools)';
      case 'navigate':
        return '- Navigate: disabled (no navigation or tab switch/close actions)';
      case 'observe':
        return '- Observe: disabled (no snapshot/screenshot/history/bookmark/console reads)';
      case 'workflow':
        return '- Workflow: disabled (no RR-V3 flow/trigger/run actions)';
    }
  });

  return [
    'Tool group restrictions:',
    ...lines,
    '',
    'Ask the user to enable a group before using it.',
  ]
    .join('\n')
    .trim();
}
