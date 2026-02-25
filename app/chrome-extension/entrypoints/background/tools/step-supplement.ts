import { TOOL_NAMES } from 'chrome-mcp-shared';
import { STEP_TYPES } from '@/common/step-types';
import type { Step } from '../record-replay/types';

/**
 * Tools that bypass DOM events and need supplementary step injection into
 * the recording session. The recorder captures DOM-level events from most
 * AI tool actions automatically — this module fills the gaps for tools
 * that use CDP or direct script execution.
 */

const TOOLS_NEEDING_SUPPLEMENT = new Set([
  TOOL_NAMES.BROWSER.JAVASCRIPT,
  TOOL_NAMES.BROWSER.COMPUTER,
]);

/**
 * Check if a tool name may need supplementary step injection.
 * Fast check to avoid unnecessary work for the majority of tools.
 */
export function needsSupplementaryStep(toolName: string): boolean {
  return TOOLS_NEEDING_SUPPLEMENT.has(toolName);
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Build a supplementary Step for tools that bypass DOM events.
 * Returns null if the tool/action doesn't need supplementation.
 *
 * @param toolName - The MCP tool name
 * @param args - The tool arguments
 * @param _result - The tool execution result (currently unused, reserved for future use)
 */
export function maybeBuildSupplementaryStep(
  toolName: string,
  args: any,
  _result?: any,
): Step | null {
  if (toolName === TOOL_NAMES.BROWSER.JAVASCRIPT) {
    return buildJavascriptStep(args);
  }

  if (toolName === TOOL_NAMES.BROWSER.COMPUTER) {
    return buildComputerStep(args);
  }

  return null;
}

function buildJavascriptStep(args: any): Step {
  return {
    id: generateStepId(),
    type: STEP_TYPES.SCRIPT,
    code: args?.code || args?.expression || '',
    world: 'MAIN',
  } as Step;
}

function buildComputerStep(args: any): Step | null {
  const action = args?.action;

  if (action === 'scroll') {
    // CDP scroll bypasses DOM events
    const direction = args?.scrollDirection || 'down';
    const amount = args?.scrollAmount || 3;
    // Convert scroll ticks to approximate pixel offset
    const PIXELS_PER_TICK = 100;
    const yOffset =
      direction === 'up'
        ? -(amount * PIXELS_PER_TICK)
        : direction === 'down'
          ? amount * PIXELS_PER_TICK
          : 0;
    const xOffset =
      direction === 'left'
        ? -(amount * PIXELS_PER_TICK)
        : direction === 'right'
          ? amount * PIXELS_PER_TICK
          : 0;

    return {
      id: generateStepId(),
      type: STEP_TYPES.SCROLL,
      mode: 'offset',
      offset: { x: xOffset, y: yOffset },
    } as Step;
  }

  if (action === 'type') {
    // CDP Input.insertText bypasses DOM events
    return {
      id: generateStepId(),
      type: STEP_TYPES.KEY,
      keys: args?.text || '',
    } as Step;
  }

  if (action === 'wait') {
    const durationMs = (args?.duration || 1) * 1000;
    return {
      id: generateStepId(),
      type: STEP_TYPES.WAIT,
      condition: { sleep: durationMs },
    } as Step;
  }

  // Actions that produce DOM events (left_click, fill, etc.) are already captured
  // by the recorder via content script helpers — no supplementary step needed.
  return null;
}
