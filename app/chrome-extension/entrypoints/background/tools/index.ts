import { ERROR_MESSAGES } from '@/common/constants';
import { createErrorResponse } from '@/common/tool-handler';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { recordingSession } from '../record-replay/recording/session-manager';
import {
  formatWorkflowAccessDeniedReason,
  getWorkflowAccessDenialReason,
  getWorkflowAccessStateSnapshot,
} from '../workflow-access';
import * as browserTools from './browser';
import { flowListTool, flowRecordStartTool, flowRecordStopTool, flowSaveTool } from './flow-learn';
import { emosReadMemoriesTool, emosSearchMemoriesTool } from './memory';
import { flowRunTool } from './record-replay';
import { maybeBuildSupplementaryStep, needsSupplementaryStep } from './step-supplement';

const tools = {
  ...browserTools,
  flowRunTool,
  flowListTool,
  flowRecordStartTool,
  flowRecordStopTool,
  flowSaveTool,
  emosReadMemoriesTool,
  emosSearchMemoriesTool,
} as any;
const toolsMap = new Map(Object.values(tools).map((tool: any) => [tool.name, tool]));

const WORKFLOW_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.RECORD_REPLAY.RECORD_START,
  TOOL_NAMES.RECORD_REPLAY.RECORD_STOP,
  TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE,
  TOOL_NAMES.RECORD_REPLAY.FLOW_LIST,
  TOOL_NAMES.RECORD_REPLAY.FLOW_RUN,
]);

function isWorkflowToolName(name: string): boolean {
  return name.startsWith('flow.') || WORKFLOW_TOOL_NAMES.has(name);
}

/**
 * Tool call parameter interface
 */
export interface ToolCallParam {
  name: string;
  args: any;
}

/**
 * Handle tool execution
 */
export const handleCallTool = async (param: ToolCallParam) => {
  const tool = toolsMap.get(param.name);
  if (!tool) {
    return createErrorResponse(`Tool ${param.name} not found`);
  }

  if (isWorkflowToolName(param.name)) {
    const access = await getWorkflowAccessStateSnapshot({ refreshIfStale: true });
    const reason = getWorkflowAccessDenialReason(access);
    if (reason) {
      return createErrorResponse(formatWorkflowAccessDeniedReason(reason));
    }
  }

  try {
    const result = await tool.execute(param.args);

    // Phase 2: Supplementary step injection for non-DOM tools.
    // When a recording session is active and the tool bypasses DOM events,
    // inject a supplementary step so the captured flow is complete.
    if (
      !result.isError &&
      recordingSession.canAcceptSteps() &&
      needsSupplementaryStep(param.name)
    ) {
      try {
        const step = maybeBuildSupplementaryStep(param.name, param.args, result);
        if (step) {
          recordingSession.appendSteps([step]);
        }
      } catch (e) {
        // Supplementary injection is best-effort — don't fail the tool call
        console.warn('Supplementary step injection failed:', e);
      }
    }

    return result;
  } catch (error) {
    console.error(`Tool execution failed for ${param.name}:`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : ERROR_MESSAGES.TOOL_EXECUTION_FAILED,
    );
  }
};
