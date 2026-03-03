import { describe, expect, it } from 'vitest';

import { TOOL_NAMES, TOOL_SCHEMAS } from 'chrome-mcp-shared';

import {
  TOOL_GROUP_DEFINITIONS,
  type IndividualToolState,
  type ToolGroupState,
} from '@/entrypoints/shared/utils/tool-groups';
import {
  computeEnabledToolIds,
  isToolAllowedBySelection,
} from '@/entrypoints/background/tool-selection/resolve';

function makeGroupState(patch: Partial<Omit<ToolGroupState, 'updatedAt'>>): ToolGroupState {
  return {
    observe: true,
    navigate: true,
    interact: false,
    execute: false,
    workflow: true,
    updatedAt: new Date().toISOString(),
    ...patch,
  };
}

function makeIndividualState(
  overrides: Record<string, boolean> = {},
  updatedAt: string = new Date().toISOString(),
): IndividualToolState {
  return { overrides, updatedAt };
}

describe('tool selection (contract)', () => {
  it('UI tool catalog covers all exposed TOOL_SCHEMAS tools', () => {
    const uiToolIds = new Set(TOOL_GROUP_DEFINITIONS.flatMap((g) => g.tools.map((t) => t.id)));
    const exposed = TOOL_SCHEMAS.map((t) => t.name);
    const missing = exposed.filter((id) => !uiToolIds.has(id));
    expect(missing).toEqual([]);
  });

  it('group toggle disables all tools in that group', () => {
    const groupState = makeGroupState({ interact: false });
    const individualState = makeIndividualState();
    const selection = {
      groupState,
      individualState,
      enabledToolIds: computeEnabledToolIds(groupState, individualState),
    };

    expect(isToolAllowedBySelection(TOOL_NAMES.BROWSER.CLICK, selection)).toBe(false);
    expect(isToolAllowedBySelection(TOOL_NAMES.BROWSER.FILL, selection)).toBe(false);
  });

  it('individual override disables a single tool', () => {
    const groupState = makeGroupState({ interact: true });
    const individualState = makeIndividualState({ [TOOL_NAMES.BROWSER.CLICK]: false });
    const selection = {
      groupState,
      individualState,
      enabledToolIds: computeEnabledToolIds(groupState, individualState),
    };

    expect(isToolAllowedBySelection(TOOL_NAMES.BROWSER.CLICK, selection)).toBe(false);
    expect(isToolAllowedBySelection(TOOL_NAMES.BROWSER.FILL, selection)).toBe(true);
  });

  it('unknown tools are disabled by default', () => {
    const groupState = makeGroupState({ interact: true, execute: true });
    const individualState = makeIndividualState();
    const selection = {
      groupState,
      individualState,
      enabledToolIds: computeEnabledToolIds(groupState, individualState),
    };

    expect(isToolAllowedBySelection('totally_unknown_tool', selection)).toBe(false);
  });

  it('legacy tool name aliases are normalized for policy checks', () => {
    const groupState = makeGroupState({ interact: true });
    const individualState = makeIndividualState();
    const selection = {
      groupState,
      individualState,
      enabledToolIds: computeEnabledToolIds(groupState, individualState),
    };

    expect(isToolAllowedBySelection('chrome_file_upload', selection)).toBe(true);
  });

  it('dynamic flow.* tools are gated by flow_run', () => {
    const groupState = makeGroupState({ workflow: true });
    const individualState = makeIndividualState();
    const selection = {
      groupState,
      individualState,
      enabledToolIds: computeEnabledToolIds(groupState, individualState),
    };

    expect(isToolAllowedBySelection('flow.some-published-flow', selection)).toBe(true);
  });
});
