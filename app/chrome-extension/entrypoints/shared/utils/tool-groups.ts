import { STORAGE_KEYS } from '@/common/constants';

export type ToolGroupId = 'observe' | 'navigate' | 'interact' | 'execute' | 'workflow';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
}

export interface ToolGroupDefinition {
  id: ToolGroupId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  tools: ToolDefinition[];
}

export interface ToolGroupState {
  observe: boolean;
  navigate: boolean;
  interact: boolean;
  execute: boolean;
  workflow: boolean;
  updatedAt: string;
}

export interface IndividualToolState {
  overrides: Record<string, boolean>;
  updatedAt: string;
}

export const TOOL_GROUP_DEFINITIONS: ToolGroupDefinition[] = [
  {
    id: 'observe',
    label: 'Observe',
    description: 'Read-only tools (no side effects)',
    defaultEnabled: true,
    tools: [
      { id: 'get_windows_and_tabs', name: 'List Tabs', description: 'Get all windows and tabs' },
      { id: 'chrome_screenshot', name: 'Screenshot', description: 'Capture page screenshot' },
      { id: 'chrome_read_page', name: 'Read Page', description: 'Read page content' },
      {
        id: 'chrome_get_web_content',
        name: 'Get Web Content',
        description: 'Fetch interactive elements',
      },
      { id: 'chrome_console', name: 'Console', description: 'Read console output' },
      { id: 'chrome_history', name: 'History', description: 'Read browser history' },
      {
        id: 'chrome_bookmark_search',
        name: 'Search Bookmarks',
        description: 'Search browser bookmarks',
      },
    ],
  },
  {
    id: 'navigate',
    label: 'Navigate',
    description: 'Tab and page navigation',
    defaultEnabled: true,
    tools: [
      { id: 'chrome_navigate', name: 'Navigate', description: 'Navigate to URL' },
      { id: 'chrome_switch_tab', name: 'Switch Tab', description: 'Switch to a tab' },
      { id: 'chrome_close_tabs', name: 'Close Tabs', description: 'Close tabs' },
    ],
  },
  {
    id: 'interact',
    label: 'Interact',
    description: 'DOM manipulation and network',
    defaultEnabled: true,
    tools: [
      { id: 'chrome_click_element', name: 'Click', description: 'Click an element' },
      {
        id: 'chrome_fill_or_select',
        name: 'Fill/Select',
        description: 'Fill forms or select options',
      },
      { id: 'chrome_keyboard', name: 'Keyboard', description: 'Send keyboard input' },
      { id: 'chrome_computer', name: 'Computer', description: 'Computer use (mouse/keyboard)' },
      {
        id: 'chrome_request_element_selection',
        name: 'Element Picker',
        description: 'Pick an element',
      },
      { id: 'chrome_handle_dialog', name: 'Dialog', description: 'Handle browser dialogs' },
      {
        id: 'chrome_network_capture',
        name: 'Network Capture',
        description: 'Capture network traffic',
      },
      { id: 'chrome_network_request', name: 'Network Request', description: 'Make HTTP requests' },
      { id: 'chrome_bookmark_add', name: 'Add Bookmark', description: 'Create a bookmark' },
      { id: 'chrome_bookmark_delete', name: 'Delete Bookmark', description: 'Delete a bookmark' },
      { id: 'chrome_file_upload', name: 'File Upload', description: 'Upload files' },
      { id: 'chrome_handle_download', name: 'Download', description: 'Handle downloads' },
    ],
  },
  {
    id: 'execute',
    label: 'Execute',
    description: 'JavaScript execution',
    defaultEnabled: false,
    tools: [
      { id: 'chrome_javascript', name: 'JavaScript', description: 'Execute JavaScript code' },
      {
        id: 'chrome_inject_script',
        name: 'Inject Script',
        description: 'Inject and execute scripts',
      },
      { id: 'chrome_userscript', name: 'Userscript', description: 'Run userscripts' },
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    description: 'Browser workflow actions',
    defaultEnabled: true,
    tools: [
      { id: 'flow_record_start', name: 'Record Start', description: 'Start recording' },
      { id: 'flow_record_stop', name: 'Record Stop', description: 'Stop recording' },
      { id: 'flow_save', name: 'Save Flow', description: 'Save recorded flow' },
      { id: 'flow_list', name: 'List Flows', description: 'List saved flows' },
      { id: 'flow_run', name: 'Run Flow', description: 'Execute a flow' },
    ],
  },
];

const DEFAULT_TOOL_GROUP_STATE: ToolGroupState = {
  observe: true,
  navigate: true,
  interact: true,
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

export async function getIndividualToolState(): Promise<IndividualToolState> {
  const raw =
    (await chrome.storage.local.get(STORAGE_KEYS.INDIVIDUAL_TOOL_STATE))[
      STORAGE_KEYS.INDIVIDUAL_TOOL_STATE
    ] || {};
  const overrides = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
  return {
    overrides: overrides as Record<string, boolean>,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.length > 0
        ? raw.updatedAt
        : new Date(0).toISOString(),
  };
}

export async function setIndividualToolOverride(
  toolId: string,
  enabled: boolean,
): Promise<IndividualToolState> {
  const current = await getIndividualToolState();
  const nextOverrides = { ...current.overrides };
  if (enabled) {
    delete nextOverrides[toolId];
  } else {
    nextOverrides[toolId] = false;
  }
  const next: IndividualToolState = {
    overrides: nextOverrides,
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.INDIVIDUAL_TOOL_STATE]: next });
  return next;
}

export async function clearIndividualToolOverrides(): Promise<IndividualToolState> {
  const next: IndividualToolState = {
    overrides: {},
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.INDIVIDUAL_TOOL_STATE]: next });
  return next;
}

export function getDisabledToolGroups(state: ToolGroupState): ToolGroupId[] {
  return (Object.keys(state) as (keyof ToolGroupState)[])
    .filter((key): key is ToolGroupId => key !== 'updatedAt')
    .filter((key) => state[key] === false);
}

export function buildToolGroupRestrictionText(
  state: ToolGroupState,
  individualState?: IndividualToolState | null,
): string {
  const disabledGroups = getDisabledToolGroups(state);
  const lines: string[] = [];

  for (const groupId of disabledGroups) {
    switch (groupId) {
      case 'interact':
        lines.push(
          '- Interact: disabled (no DOM interaction, cookie-network/file tools, or bookmarks writes)',
        );
        break;
      case 'execute':
        lines.push('- Execute: disabled (no JavaScript eval/injection tools)');
        break;
      case 'navigate':
        lines.push('- Navigate: disabled (no navigation or tab switch/close actions)');
        break;
      case 'observe':
        lines.push('- Observe: disabled (no snapshot/screenshot/history/bookmark/console reads)');
        break;
      case 'workflow':
        lines.push('- Workflow: disabled (no RR-V3 flow/trigger/run actions)');
        break;
    }
  }

  const overrides = individualState?.overrides ?? {};
  for (const group of TOOL_GROUP_DEFINITIONS) {
    if (!state[group.id]) continue;
    const disabledTools = group.tools.filter((t) => overrides[t.id] === false).map((t) => t.id);
    if (disabledTools.length > 0) {
      lines.push(`- ${group.label}: disabled tools: ${disabledTools.join(', ')}`);
    }
  }

  if (lines.length === 0) return '';

  return [
    'Tool group restrictions:',
    ...lines,
    '',
    'Ask the user to enable a group or tool before using it.',
  ]
    .join('\n')
    .trim();
}
