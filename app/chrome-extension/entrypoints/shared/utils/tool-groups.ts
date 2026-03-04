import { STORAGE_KEYS } from '@/common/constants';
import { TOOL_NAMES, TOOL_SCHEMAS } from 'chrome-mcp-shared';

export type ToolGroupId = 'observe' | 'navigate' | 'interact' | 'execute' | 'workflow' | 'memory';

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
  memory: boolean;
  updatedAt: string;
}

export interface IndividualToolState {
  overrides: Record<string, boolean>;
  updatedAt: string;
}

const LEGACY_TOOL_ID_ALIASES: Record<string, string> = {
  chrome_file_upload: TOOL_NAMES.BROWSER.FILE_UPLOAD,
};

function toolSchemaDescription(toolName: string): string | null {
  const schema = TOOL_SCHEMAS.find((tool) => tool.name === toolName);
  return typeof schema?.description === 'string' ? schema.description : null;
}

export const TOOL_GROUP_DEFINITIONS: ToolGroupDefinition[] = [
  {
    id: 'observe',
    label: 'Observe',
    description: 'Read-only tools (no side effects)',
    defaultEnabled: true,
    tools: [
      {
        id: TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
        name: 'List Tabs',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS) ??
          'Get all windows and tabs',
      },
      {
        id: TOOL_NAMES.BROWSER.SCREENSHOT,
        name: 'Screenshot',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.SCREENSHOT) ?? 'Capture page screenshot',
      },
      {
        id: TOOL_NAMES.BROWSER.READ_PAGE,
        name: 'Read Page',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.READ_PAGE) ?? 'Read page content',
      },
      {
        id: TOOL_NAMES.BROWSER.WEB_FETCHER,
        name: 'Get Web Content',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.WEB_FETCHER) ?? 'Fetch web content',
      },
      {
        id: TOOL_NAMES.BROWSER.CONSOLE,
        name: 'Console',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.CONSOLE) ?? 'Read console output',
      },
      {
        id: TOOL_NAMES.BROWSER.HISTORY,
        name: 'History',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.HISTORY) ?? 'Read browser history',
      },
      {
        id: TOOL_NAMES.BROWSER.BOOKMARK_SEARCH,
        name: 'Search Bookmarks',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.BOOKMARK_SEARCH) ?? 'Search browser bookmarks',
      },
      {
        id: TOOL_NAMES.BROWSER.GIF_RECORDER,
        name: 'GIF Recorder',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.GIF_RECORDER) ??
          'Record a short GIF of the current page',
      },
    ],
  },
  {
    id: 'navigate',
    label: 'Navigate',
    description: 'Tab and page navigation',
    defaultEnabled: true,
    tools: [
      {
        id: TOOL_NAMES.BROWSER.NAVIGATE,
        name: 'Navigate',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.NAVIGATE) ?? 'Navigate to URL',
      },
      {
        id: TOOL_NAMES.BROWSER.SWITCH_TAB,
        name: 'Switch Tab',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.SWITCH_TAB) ?? 'Switch to a tab',
      },
      {
        id: TOOL_NAMES.BROWSER.CLOSE_TABS,
        name: 'Close Tabs',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.CLOSE_TABS) ?? 'Close tabs',
      },
    ],
  },
  {
    id: 'interact',
    label: 'Interact',
    description: 'DOM manipulation and network',
    defaultEnabled: false,
    tools: [
      {
        id: TOOL_NAMES.BROWSER.CLICK,
        name: 'Click',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.CLICK) ?? 'Click an element',
      },
      {
        id: TOOL_NAMES.BROWSER.FILL,
        name: 'Fill/Select',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.FILL) ?? 'Fill forms or select options',
      },
      {
        id: TOOL_NAMES.BROWSER.KEYBOARD,
        name: 'Keyboard',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.KEYBOARD) ?? 'Send keyboard input',
      },
      {
        id: TOOL_NAMES.BROWSER.COMPUTER,
        name: 'Computer',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.COMPUTER) ??
          'Computer use (mouse/keyboard via screen coordinates)',
      },
      {
        id: TOOL_NAMES.BROWSER.REQUEST_ELEMENT_SELECTION,
        name: 'Element Picker',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.REQUEST_ELEMENT_SELECTION) ?? 'Pick an element',
      },
      {
        id: TOOL_NAMES.BROWSER.HANDLE_DIALOG,
        name: 'Dialog',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.HANDLE_DIALOG) ?? 'Handle dialogs',
      },
      {
        id: TOOL_NAMES.BROWSER.NETWORK_CAPTURE,
        name: 'Network Capture',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.NETWORK_CAPTURE) ?? 'Capture network traffic',
      },
      {
        id: TOOL_NAMES.BROWSER.NETWORK_REQUEST,
        name: 'Network Request',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.NETWORK_REQUEST) ?? 'Make HTTP requests',
      },
      {
        id: TOOL_NAMES.BROWSER.BOOKMARK_ADD,
        name: 'Add Bookmark',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.BOOKMARK_ADD) ?? 'Create a bookmark',
      },
      {
        id: TOOL_NAMES.BROWSER.BOOKMARK_DELETE,
        name: 'Delete Bookmark',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.BOOKMARK_DELETE) ?? 'Delete a bookmark',
      },
      {
        id: TOOL_NAMES.BROWSER.FILE_UPLOAD,
        name: 'File Upload',
        description: toolSchemaDescription(TOOL_NAMES.BROWSER.FILE_UPLOAD) ?? 'Upload files',
      },
      {
        id: TOOL_NAMES.BROWSER.HANDLE_DOWNLOAD,
        name: 'Download',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.HANDLE_DOWNLOAD) ?? 'Handle downloads',
      },
      {
        id: TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE,
        name: 'Start Perf Trace',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE) ??
          'Start performance trace recording',
      },
      {
        id: TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE,
        name: 'Stop Perf Trace',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE) ??
          'Stop performance trace recording',
      },
      {
        id: TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT,
        name: 'Analyze Perf Trace',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT) ??
          'Analyze last recorded trace',
      },
    ],
  },
  {
    id: 'execute',
    label: 'Execute',
    description: 'JavaScript execution',
    defaultEnabled: false,
    tools: [
      {
        id: TOOL_NAMES.BROWSER.JAVASCRIPT,
        name: 'JavaScript',
        description:
          toolSchemaDescription(TOOL_NAMES.BROWSER.JAVASCRIPT) ?? 'Execute JavaScript code',
      },
      {
        id: TOOL_NAMES.BROWSER.INJECT_SCRIPT,
        name: 'Inject Script',
        description: 'Inject and execute scripts (not exposed to MCP by default)',
      },
      {
        id: TOOL_NAMES.BROWSER.USERSCRIPT,
        name: 'Userscript',
        description: 'Run userscripts (not exposed to MCP by default)',
      },
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    description: 'Browser workflow actions',
    defaultEnabled: true,
    tools: [
      {
        id: TOOL_NAMES.RECORD_REPLAY.RECORD_START,
        name: 'Record Start',
        description:
          toolSchemaDescription(TOOL_NAMES.RECORD_REPLAY.RECORD_START) ?? 'Start recording',
      },
      {
        id: TOOL_NAMES.RECORD_REPLAY.RECORD_STOP,
        name: 'Record Stop',
        description:
          toolSchemaDescription(TOOL_NAMES.RECORD_REPLAY.RECORD_STOP) ?? 'Stop recording',
      },
      {
        id: TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE,
        name: 'Save Flow',
        description:
          toolSchemaDescription(TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE) ?? 'Save recorded flow',
      },
      {
        id: TOOL_NAMES.RECORD_REPLAY.FLOW_LIST,
        name: 'List Flows',
        description:
          toolSchemaDescription(TOOL_NAMES.RECORD_REPLAY.FLOW_LIST) ?? 'List saved flows',
      },
      {
        id: TOOL_NAMES.RECORD_REPLAY.FLOW_RUN,
        name: 'Run Flow',
        description: toolSchemaDescription(TOOL_NAMES.RECORD_REPLAY.FLOW_RUN) ?? 'Execute a flow',
      },
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    description: 'EverMemOS memory read/search tools',
    defaultEnabled: true,
    tools: [
      {
        id: TOOL_NAMES.MEMORY.GET_MEMORIES,
        name: 'Read Memories',
        description:
          toolSchemaDescription(TOOL_NAMES.MEMORY.GET_MEMORIES) ?? 'Read memories from EverMemOS',
      },
      {
        id: TOOL_NAMES.MEMORY.SEARCH_MEMORIES,
        name: 'Search Memories',
        description:
          toolSchemaDescription(TOOL_NAMES.MEMORY.SEARCH_MEMORIES) ??
          'Search memories in EverMemOS',
      },
    ],
  },
];

const DEFAULT_TOOL_GROUP_STATE: ToolGroupState = {
  observe: true,
  navigate: true,
  interact: true,
  execute: false,
  workflow: true,
  memory: true,
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
    memory: normalizeBoolean(raw.memory, DEFAULT_TOOL_GROUP_STATE.memory),
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
  const overridesRaw = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
  const overrides = overridesRaw as Record<string, unknown>;
  const nextOverrides: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'boolean') {
      nextOverrides[key] = value;
    }
  }

  let migrated = false;
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_TOOL_ID_ALIASES)) {
    if (nextOverrides[legacyId] === false && nextOverrides[canonicalId] !== false) {
      nextOverrides[canonicalId] = false;
      migrated = true;
    }
    if (legacyId in nextOverrides) {
      delete nextOverrides[legacyId];
      migrated = true;
    }
  }

  if (migrated) {
    const migratedState: IndividualToolState = {
      overrides: nextOverrides,
      updatedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.INDIVIDUAL_TOOL_STATE]: migratedState });
    return migratedState;
  }

  return {
    overrides: nextOverrides,
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
      case 'memory':
        lines.push('- Memory: disabled (no EverMemOS memory read/search tools)');
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

export function getEffectiveEnabledToolIds(
  state: ToolGroupState,
  individualState?: IndividualToolState | null,
): string[] {
  const overrides = individualState?.overrides ?? {};
  const enabled: string[] = [];

  for (const group of TOOL_GROUP_DEFINITIONS) {
    if (!state[group.id]) continue;
    for (const tool of group.tools) {
      if (overrides[tool.id] === false) continue;
      enabled.push(tool.id);
    }
  }

  enabled.sort();
  return enabled;
}

export function getPolicyToolCatalogIds(): string[] {
  const ids = new Set<string>();

  for (const schema of TOOL_SCHEMAS) {
    if (typeof schema?.name === 'string' && schema.name.length > 0) {
      ids.add(schema.name);
    }
  }

  for (const group of TOOL_GROUP_DEFINITIONS) {
    for (const tool of group.tools) {
      if (typeof tool.id === 'string' && tool.id.length > 0) {
        ids.add(tool.id);
      }
    }
  }

  return Array.from(ids).sort();
}

export function getEffectiveDisabledToolIds(
  state: ToolGroupState,
  individualState?: IndividualToolState | null,
): string[] {
  const enabled = new Set(getEffectiveEnabledToolIds(state, individualState ?? null));
  return getPolicyToolCatalogIds().filter((id) => !enabled.has(id));
}
