import { TOOL_NAMES, TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { handleCallTool } from '@/entrypoints/background/tools';
import { ensureToolGroupEnabled } from './tool-group-gate';
import type { BrowserProxyResponse } from './protocol';

type RouteHint = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
};

type BrowserExtPayload = {
  name?: string;
  args?: unknown;
};

const TOOL_NAME_SET = new Set(TOOL_SCHEMAS.map((tool) => tool.name));

const WORKFLOW_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.RECORD_REPLAY.RECORD_START,
  TOOL_NAMES.RECORD_REPLAY.RECORD_STOP,
  TOOL_NAMES.RECORD_REPLAY.FLOW_SAVE,
  TOOL_NAMES.RECORD_REPLAY.FLOW_LIST,
  TOOL_NAMES.RECORD_REPLAY.FLOW_RUN,
]);

const EXECUTE_TOOL_NAMES = new Set<string>([TOOL_NAMES.BROWSER.JAVASCRIPT]);

const NAVIGATE_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.BROWSER.NAVIGATE,
  TOOL_NAMES.BROWSER.SWITCH_TAB,
  TOOL_NAMES.BROWSER.CLOSE_TABS,
]);

const INTERACT_TOOL_NAMES = new Set<string>([
  TOOL_NAMES.BROWSER.CLICK,
  TOOL_NAMES.BROWSER.FILL,
  TOOL_NAMES.BROWSER.KEYBOARD,
  TOOL_NAMES.BROWSER.REQUEST_ELEMENT_SELECTION,
  TOOL_NAMES.BROWSER.FILE_UPLOAD,
  TOOL_NAMES.BROWSER.HANDLE_DIALOG,
  TOOL_NAMES.BROWSER.COMPUTER,
  TOOL_NAMES.BROWSER.NETWORK_REQUEST,
  TOOL_NAMES.BROWSER.NETWORK_CAPTURE,
  TOOL_NAMES.BROWSER.HANDLE_DOWNLOAD,
  TOOL_NAMES.BROWSER.BOOKMARK_ADD,
  TOOL_NAMES.BROWSER.BOOKMARK_DELETE,
  TOOL_NAMES.BROWSER.GIF_RECORDER,
  TOOL_NAMES.BROWSER.PERFORMANCE_START_TRACE,
  TOOL_NAMES.BROWSER.PERFORMANCE_STOP_TRACE,
  TOOL_NAMES.BROWSER.PERFORMANCE_ANALYZE_INSIGHT,
]);

function invalidRequest(message: string): BrowserProxyResponse {
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message,
    },
  };
}

function parseToolTextResult(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

async function executeTool(name: string, args: unknown): Promise<BrowserProxyResponse> {
  const result = await handleCallTool({ name, args });
  if (result.isError) {
    const message = result.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')
      .trim();
    return {
      ok: false,
      error: {
        code: 'tool_execution_failed',
        message: message || `Tool execution failed: ${name}`,
      },
    };
  }

  const firstText = result.content.find((item: any) => item.type === 'text');
  return {
    ok: true,
    result: firstText ? parseToolTextResult(firstText.text) : null,
  };
}

function toRouteHintFromToolName(name: string): RouteHint {
  if (WORKFLOW_TOOL_NAMES.has(name)) {
    return { method: 'POST', path: '/rr_v3/tool' };
  }
  if (NAVIGATE_TOOL_NAMES.has(name)) {
    return { method: 'POST', path: '/navigate' };
  }
  if (EXECUTE_TOOL_NAMES.has(name)) {
    return { method: 'POST', path: '/javascript/eval' };
  }
  if (INTERACT_TOOL_NAMES.has(name)) {
    return { method: 'POST', path: '/act' };
  }
  return { method: 'GET', path: '/snapshot' };
}

function parsePayload(rawPayload: unknown):
  | {
      name: string;
      args: unknown;
      route: RouteHint;
    }
  | {
      invalid: string;
    } {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { invalid: 'payload must be an object' };
  }

  const payload = rawPayload as BrowserExtPayload;
  const name = typeof payload.name === 'string' ? payload.name : '';
  const args = payload.args ?? {};

  if (!name) {
    return { invalid: 'Missing required field: name' };
  }

  if (name === 'schema.get') {
    return {
      name,
      args,
      route: { method: 'GET', path: '/schema/browser-ext' },
    };
  }

  if (!TOOL_NAME_SET.has(name)) {
    return { invalid: `Unsupported tool name: ${name}` };
  }

  return {
    name,
    args,
    route: toRouteHintFromToolName(name),
  };
}

export async function dispatchBrowserExtRequest(
  rawPayload: unknown,
): Promise<BrowserProxyResponse> {
  const parsed = parsePayload(rawPayload);
  if ('invalid' in parsed) {
    return invalidRequest(`Invalid browser-ext payload: ${parsed.invalid}`);
  }

  const gate = await ensureToolGroupEnabled(parsed.route.method, parsed.route.path);
  if ('error' in gate) {
    return {
      ok: false,
      error: gate.error,
    };
  }

  if (parsed.name === 'schema.get') {
    return {
      ok: true,
      result: TOOL_SCHEMAS,
    };
  }

  return executeTool(parsed.name, parsed.args);
}
