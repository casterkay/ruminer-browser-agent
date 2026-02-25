import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { RecorderManager } from '../record-replay/recording/recorder-manager';
import { recordingSession } from '../record-replay/recording/session-manager';
import {
  saveFlow,
  publishFlow,
  getFlow,
  listFlows,
  listPublished,
} from '../record-replay/flow-store';
import type { Flow } from '../record-replay/types';

class FlowRecordStartTool {
  name = TOOL_NAMES.RECORD_REPLAY.RECORD_START;

  async execute(args: any): Promise<ToolResult> {
    const { name, description } = args || {};

    // Ensure recorder infrastructure is initialized
    await RecorderManager.init();

    const meta: Partial<Flow> = {};
    if (name) meta.name = name;
    if (description) meta.description = description;

    const result = await RecorderManager.start(Object.keys(meta).length > 0 ? meta : undefined);

    if (!result.success) {
      return createErrorResponse(result.error || 'Failed to start recording');
    }

    const session = recordingSession.getSession();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sessionId: session.sessionId,
            message:
              'Recording started. Perform browser actions using MCP tools — clicks, fills, keyboard, navigation, and tab switches are captured automatically. Call flow_record_stop when done.',
          }),
        },
      ],
      isError: false,
    };
  }
}

class FlowRecordStopTool {
  name = TOOL_NAMES.RECORD_REPLAY.RECORD_STOP;

  async execute(): Promise<ToolResult> {
    const result = await RecorderManager.stop();

    if (!result.success) {
      return createErrorResponse(result.error || 'Failed to stop recording');
    }

    if (!result.flow) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Recording stopped but no flow data was captured.',
            }),
          },
        ],
        isError: false,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            flow: result.flow,
            nodeCount: result.flow.nodes?.length || 0,
            edgeCount: result.flow.edges?.length || 0,
            variableCount: result.flow.variables?.length || 0,
            ...(result.error ? { warning: result.error } : {}),
          }),
        },
      ],
      isError: false,
    };
  }
}

class FlowSaveTool {
  name = TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE;

  async execute(args: any): Promise<ToolResult> {
    const { flow, publish, slug, parentFlowId } = args || {};

    if (!flow || typeof flow !== 'object') {
      return createErrorResponse('flow is required and must be an object');
    }

    if (!Array.isArray(flow.nodes) || flow.nodes.length === 0) {
      return createErrorResponse('flow must have a nodes array with at least one node');
    }

    // Ensure required fields
    const now = new Date().toISOString();
    if (!flow.id) {
      flow.id = `flow_${Date.now()}`;
    }
    if (!flow.name) {
      flow.name = 'Untitled Flow';
    }
    if (!flow.version) {
      flow.version = 1;
    }
    if (!flow.meta) {
      flow.meta = { createdAt: now, updatedAt: now };
    }
    flow.meta.updatedAt = now;

    // Handle versioning via parentFlowId
    if (parentFlowId) {
      const parentFlow = await getFlow(parentFlowId);
      if (parentFlow) {
        flow.version = parentFlow.version + 1;
        flow.meta.parentVersion = {
          flowId: parentFlow.id,
          version: parentFlow.version,
          createdAt: parentFlow.meta?.createdAt || now,
        };
      }
    }

    // Save the flow
    await saveFlow(flow as Flow);

    let toolName: string | undefined;
    if (publish) {
      const info = await publishFlow(flow as Flow, slug);
      toolName = `flow.${info.slug}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            flowId: flow.id,
            version: flow.version,
            ...(toolName ? { toolName } : {}),
          }),
        },
      ],
      isError: false,
    };
  }
}

class FlowListTool {
  name = TOOL_NAMES.RECORD_REPLAY.FLOW_LIST;

  async execute(args: any): Promise<ToolResult> {
    const { publishedOnly = false } = args || {};

    if (publishedOnly) {
      const published = await listPublished();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              flows: published.map((p) => ({
                id: p.id,
                slug: p.slug,
                version: p.version,
                name: p.name,
                description: p.description,
              })),
            }),
          },
        ],
        isError: false,
      };
    }

    const flows = await listFlows();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            flows: flows.map((f) => ({
              id: f.id,
              name: f.name,
              description: f.description,
              version: f.version,
              createdAt: f.meta?.createdAt,
              updatedAt: f.meta?.updatedAt,
            })),
          }),
        },
      ],
      isError: false,
    };
  }
}

export const flowRecordStartTool = new FlowRecordStartTool();
export const flowRecordStopTool = new FlowRecordStopTool();
export const flowSaveTool = new FlowSaveTool();
export const flowListTool = new FlowListTool();
