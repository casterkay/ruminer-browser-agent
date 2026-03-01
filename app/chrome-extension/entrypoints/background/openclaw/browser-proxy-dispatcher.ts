import { TOOL_NAMES } from 'chrome-mcp-shared';
import { handleCallTool } from '@/entrypoints/background/tools';
import type { BrowserProxyRequest, BrowserProxyResponse } from './protocol';
import { ensureToolGroupEnabled } from './tool-group-gate';

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

function routeNotFound(method: string, path: string): BrowserProxyResponse {
  return {
    ok: false,
    error: {
      code: 'route_not_found',
      message: `Unsupported browser.proxy route: ${method} ${path}`,
      details: { method, path },
    },
  };
}

function invalidRequest(message: string): BrowserProxyResponse {
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message,
    },
  };
}

export async function dispatchBrowserProxyRequest(
  request: BrowserProxyRequest,
): Promise<BrowserProxyResponse> {
  const method = request.method.toUpperCase() as BrowserProxyRequest['method'];
  const path = request.path;

  if (!path || !path.startsWith('/')) {
    return invalidRequest('Request path must start with "/"');
  }

  const gate = await ensureToolGroupEnabled(method, path);
  if ('error' in gate) {
    return {
      ok: false,
      error: gate.error,
    };
  }

  const query = request.query || {};
  const body = (request.body || {}) as Record<string, unknown>;

  if (method === 'GET' && path === '/tabs/list') {
    return executeTool(TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS, {});
  }

  if (method === 'GET' && path === '/snapshot') {
    return executeTool(TOOL_NAMES.BROWSER.READ_PAGE, {
      tabId: typeof query.tabId === 'string' ? Number(query.tabId) : undefined,
    });
  }

  if (method === 'GET' && path === '/bookmarks/search') {
    return executeTool(TOOL_NAMES.BROWSER.BOOKMARK_SEARCH, {
      query: typeof query.query === 'string' ? query.query : undefined,
      maxResults: typeof query.maxResults === 'string' ? Number(query.maxResults) : undefined,
      folderPath: typeof query.folderPath === 'string' ? query.folderPath : undefined,
    });
  }

  if (method === 'GET' && path === '/history/search') {
    return executeTool(TOOL_NAMES.BROWSER.HISTORY, {
      text: typeof query.text === 'string' ? query.text : undefined,
      startTime: typeof query.startTime === 'string' ? query.startTime : undefined,
      endTime: typeof query.endTime === 'string' ? query.endTime : undefined,
      maxResults: typeof query.maxResults === 'string' ? Number(query.maxResults) : undefined,
    });
  }

  if (method === 'POST' && path === '/navigate') {
    return executeTool(TOOL_NAMES.BROWSER.NAVIGATE, body);
  }

  if (method === 'POST' && path === '/tabs/switch') {
    return executeTool(TOOL_NAMES.BROWSER.SWITCH_TAB, body);
  }

  if (method === 'POST' && path === '/tabs/close') {
    return executeTool(TOOL_NAMES.BROWSER.CLOSE_TABS, body);
  }

  if (method === 'POST' && path === '/act') {
    const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';
    if (action === 'click') {
      return executeTool(TOOL_NAMES.BROWSER.CLICK, body);
    }
    if (action === 'type' || action === 'fill' || action === 'select') {
      return executeTool(TOOL_NAMES.BROWSER.FILL, body);
    }
    if (action === 'keyboard' || action === 'key') {
      return executeTool(TOOL_NAMES.BROWSER.KEYBOARD, body);
    }

    return invalidRequest(`Unsupported /act action: ${action || '(missing action)'}`);
  }

  if (method === 'POST' && path === '/element-selection/request') {
    return executeTool(TOOL_NAMES.BROWSER.REQUEST_ELEMENT_SELECTION, body);
  }

  if (method === 'POST' && path === '/element-selection/resolve') {
    return {
      ok: true,
      result: {
        resolved: true,
        selectors: Array.isArray(body.selectors) ? body.selectors : [],
      },
    };
  }

  if (method === 'POST' && path === '/network/request') {
    return executeTool(TOOL_NAMES.BROWSER.NETWORK_REQUEST, body);
  }

  if (method === 'POST' && path === '/javascript/eval') {
    return executeTool(TOOL_NAMES.BROWSER.JAVASCRIPT, {
      code: body.code,
      tabId: body.tabId,
      timeoutMs: body.timeoutMs,
    });
  }

  return routeNotFound(method, path);
}
