import { TOOL_NAMES } from 'chrome-mcp-shared';
import {
  TOOL_GROUP_DEFINITIONS,
  getIndividualToolState,
  getToolGroupState,
  type IndividualToolState,
  type ToolGroupId,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';

export interface EffectiveToolSelection {
  groupState: ToolGroupState;
  individualState: IndividualToolState;
  enabledToolIds: Set<string>;
}

const TOOL_NAME_ALIASES: Record<string, string> = {
  chrome_file_upload: TOOL_NAMES.BROWSER.FILE_UPLOAD,
  record_replay_flow_run: TOOL_NAMES.RECORD_REPLAY.FLOW_RUN,
  record_replay_flow_list: TOOL_NAMES.RECORD_REPLAY.FLOW_LIST,
  record_replay_flow_save: TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE,
  record_replay_record_start: TOOL_NAMES.RECORD_REPLAY.RECORD_START,
  record_replay_record_stop: TOOL_NAMES.RECORD_REPLAY.RECORD_STOP,
};

const TOOL_ID_TO_GROUP = new Map<string, ToolGroupId>();
for (const group of TOOL_GROUP_DEFINITIONS) {
  for (const tool of group.tools) {
    TOOL_ID_TO_GROUP.set(tool.id, group.id);
  }
}

export function normalizeToolNameForPolicy(rawName: string): string {
  return TOOL_NAME_ALIASES[rawName] ?? rawName;
}

export function computeEnabledToolIds(
  groupState: ToolGroupState,
  individualState: IndividualToolState,
): Set<string> {
  const enabled = new Set<string>();
  const overrides = individualState.overrides ?? {};

  for (const group of TOOL_GROUP_DEFINITIONS) {
    if (!groupState[group.id]) continue;
    for (const tool of group.tools) {
      if (overrides[tool.id] === false) continue;
      enabled.add(tool.id);
    }
  }

  return enabled;
}

export function isToolAllowedBySelection(
  rawToolName: string,
  selection: EffectiveToolSelection,
): boolean {
  if (!rawToolName) return false;

  if (rawToolName.startsWith('flow.')) {
    return selection.enabledToolIds.has(TOOL_NAMES.RECORD_REPLAY.FLOW_RUN);
  }

  const toolName = normalizeToolNameForPolicy(rawToolName);
  if (!TOOL_ID_TO_GROUP.has(toolName)) return false;

  return selection.enabledToolIds.has(toolName);
}

const CACHE_TTL_MS = 250;
let cachedSelection: EffectiveToolSelection | null = null;
let cachedSelectionAtMs = 0;

export async function getEffectiveToolSelection(): Promise<EffectiveToolSelection> {
  const now = Date.now();
  if (cachedSelection && now - cachedSelectionAtMs < CACHE_TTL_MS) {
    return cachedSelection;
  }

  const [groupState, individualState] = await Promise.all([
    getToolGroupState(),
    getIndividualToolState(),
  ]);

  cachedSelection = {
    groupState,
    individualState,
    enabledToolIds: computeEnabledToolIds(groupState, individualState),
  };
  cachedSelectionAtMs = now;
  return cachedSelection;
}
