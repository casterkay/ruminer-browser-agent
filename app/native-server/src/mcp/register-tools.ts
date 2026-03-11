import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { NativeMessageType, TOOL_NAMES, TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { emitMcpToolResult, emitMcpToolUse } from '../agent/mcp-tool-telemetry';
import nativeMessagingHostInstance from '../native-messaging-host';

// ---------------------------------------------------------------------------
// In-process cache for emos_search_memories results
// The OpenClaw gateway strips data.result from tool events by default
// (verbose="off"). We cache the result here so the OpenClaw engine can inject
// it as the tool_result message content when the WS event arrives.
// ---------------------------------------------------------------------------
let _lastEmosSearchResultText: string | null = null;
let _lastEmosSearchResultTs = 0;

/**
 * Consume and return the most-recently cached emos_search_memories result if
 * it was stored within `maxAgeMs` milliseconds ago. Clears the cache on read.
 */
export function consumeLastEmosSearchResult(maxAgeMs = 30_000): string | null {
  if (_lastEmosSearchResultText && Date.now() - _lastEmosSearchResultTs <= maxAgeMs) {
    const result = _lastEmosSearchResultText;
    _lastEmosSearchResultText = null;
    return result;
  }
  return null;
}

async function listDynamicFlowTools(): Promise<Tool[]> {
  try {
    const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
      {},
      'rr_list_published_flows',
      20000,
    );
    if (response && response.status === 'success' && Array.isArray(response.items)) {
      const tools: Tool[] = [];
      for (const item of response.items) {
        const name = `flow.${item.slug}`;
        const description =
          (item.meta && item.meta.tool && item.meta.tool.description) ||
          item.description ||
          'Recorded flow';
        const properties: Record<string, any> = {};
        const required: string[] = [];
        for (const v of item.variables || []) {
          const desc = v.label || v.key;
          const typ = (v.type || 'string').toLowerCase();
          const prop: any = { description: desc };
          if (typ === 'boolean') prop.type = 'boolean';
          else if (typ === 'number') prop.type = 'number';
          else if (typ === 'enum') {
            prop.type = 'string';
            if (v.rules && Array.isArray(v.rules.enum)) prop.enum = v.rules.enum;
          } else if (typ === 'array') {
            // default array of strings; can extend with itemType later
            prop.type = 'array';
            prop.items = { type: 'string' };
          } else {
            prop.type = 'string';
          }
          if (v.default !== undefined) prop.default = v.default;
          if (v.rules && v.rules.required) required.push(v.key);
          properties[v.key] = prop;
        }
        // Run options
        properties['tabTarget'] = { type: 'string', enum: ['current', 'new'], default: 'current' };
        properties['refresh'] = { type: 'boolean', default: false };
        properties['captureNetwork'] = { type: 'boolean', default: false };
        properties['returnLogs'] = { type: 'boolean', default: false };
        properties['timeoutMs'] = { type: 'number', minimum: 0 };
        const tool: Tool = {
          name,
          description,
          inputSchema: { type: 'object', properties, required },
        };
        tools.push(tool);
      }
      return tools;
    }
    return [];
  } catch (e) {
    return [];
  }
}

export const setupTools = (server: Server) => {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const dynamicTools = await listDynamicFlowTools();
    return { tools: [...TOOL_SCHEMAS, ...dynamicTools] };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments || {}),
  );
};

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    emitMcpToolUse(name, args);

    // If calling a dynamic flow tool (name starts with flow.), proxy to common flow-run tool
    if (name && name.startsWith('flow.')) {
      // We need to resolve flow by slug to ID
      try {
        const resp = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
          {},
          'rr_list_published_flows',
          20000,
        );
        const items = (resp && resp.items) || [];
        const slug = name.slice('flow.'.length);
        const match = items.find((it: any) => it.slug === slug);
        if (!match) throw new Error(`Flow not found for tool ${name}`);
        const flowArgs = { flowId: match.id, args };
        const proxyRes = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
          { name: 'record_replay_flow_run', args: flowArgs },
          NativeMessageType.CALL_TOOL,
          120000,
        );
        if (proxyRes.status === 'success') {
          const data = proxyRes.data as CallToolResult;
          emitMcpToolResult(name, args, data);
          return data;
        }
        const errorResult: CallToolResult = {
          content: [{ type: 'text', text: `Error calling dynamic flow tool: ${proxyRes.error}` }],
          isError: true,
        };
        emitMcpToolResult(name, args, errorResult);
        return errorResult;
      } catch (err: any) {
        const errorResult: CallToolResult = {
          content: [
            {
              type: 'text',
              text: `Error resolving dynamic flow tool: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        };
        emitMcpToolResult(name, args, errorResult);
        return errorResult;
      }
    }
    // 发送请求到Chrome扩展并等待响应
    const response = await nativeMessagingHostInstance.sendRequestToExtensionAndWait(
      {
        name,
        args,
      },
      NativeMessageType.CALL_TOOL,
      120000, // 延长到 120 秒，避免性能分析等长任务超时
    );
    if (response.status === 'success') {
      // Cache emos_search_memories results for the OpenClaw citation system.
      // Tool events from the gateway arrive with result stripped (verbose="off"),
      // so we bridge the gap via this in-process store.
      if (name === TOOL_NAMES.MEMORY.SEARCH_MEMORIES) {
        const data = response.data as CallToolResult;
        const firstText = Array.isArray(data?.content)
          ? ((
              data.content.find(
                (c: any) => c?.type === 'text' && typeof c?.text === 'string',
              ) as any
            )?.text ?? null)
          : null;
        if (firstText) {
          _lastEmosSearchResultText = firstText;
          _lastEmosSearchResultTs = Date.now();
        }
      }
      const data = response.data as CallToolResult;
      emitMcpToolResult(name, args, data);
      return data;
    } else {
      const errorResult: CallToolResult = {
        content: [
          {
            type: 'text',
            text: `Error calling tool: ${response.error}`,
          },
        ],
        isError: true,
      };
      emitMcpToolResult(name, args, errorResult);
      return errorResult;
    }
  } catch (error: any) {
    const errorResult: CallToolResult = {
      content: [
        {
          type: 'text',
          text: `Error calling tool: ${error.message}`,
        },
      ],
      isError: true,
    };
    emitMcpToolResult(name, args, errorResult);
    return errorResult;
  }
};
