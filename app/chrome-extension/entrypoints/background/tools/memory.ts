import { createErrorResponse, type ToolResult } from '@/common/tool-handler';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import {
  emosGetMemories,
  emosSearchMemories,
  type EmosGetMemoriesRequest,
  type EmosSearchRequest,
} from '@/entrypoints/background/ruminer/emos-client';

class EmosReadMemoriesTool {
  name = TOOL_NAMES.MEMORY.READ_MEMORIES;

  async execute(args: any): Promise<ToolResult> {
    const params = (args ?? {}) as EmosGetMemoriesRequest;

    try {
      const result = await emosGetMemories(params);
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

class EmosSearchMemoriesTool {
  name = TOOL_NAMES.MEMORY.SEARCH_MEMORIES;

  async execute(args: any): Promise<ToolResult> {
    const params = (args ?? {}) as EmosSearchRequest;
    if (typeof params.query !== 'string' || !params.query.trim()) {
      return createErrorResponse('query is required');
    }

    try {
      const result = await emosSearchMemories({ ...params, query: params.query.trim() });
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, result }) }],
        isError: false,
      };
    } catch (error) {
      return createErrorResponse(error instanceof Error ? error.message : String(error));
    }
  }
}

export const emosReadMemoriesTool = new EmosReadMemoriesTool();
export const emosSearchMemoriesTool = new EmosSearchMemoriesTool();
