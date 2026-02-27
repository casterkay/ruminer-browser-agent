type BrowserProxyRequest = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

type BrowserExtAction =
  | 'tabs.list'
  | 'snapshot.get'
  | 'navigate'
  | 'tabs.switch'
  | 'tabs.close'
  | 'act'
  | 'history.search'
  | 'bookmarks.search'
  | 'network.request'
  | 'javascript.eval';

interface BrowserExtPayload {
  action: BrowserExtAction;
  args?: Record<string, unknown>;
}

type OpenClawPluginApi = {
  registerGatewayMethod: (
    id: string,
    handler: (args: {
      respond: (ok: boolean, payload: unknown) => void;
      payload?: unknown;
    }) => void,
  ) => void;
  callGatewayMethod?: (method: string, payload?: unknown) => Promise<unknown>;
  logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
  };
};

function mapActionToRequest(
  action: BrowserExtAction,
  args: Record<string, unknown> = {},
): BrowserProxyRequest {
  switch (action) {
    case 'tabs.list':
      return { method: 'GET', path: '/tabs/list' };
    case 'snapshot.get':
      return {
        method: 'GET',
        path: '/snapshot',
        query: typeof args.tabId === 'number' ? { tabId: String(args.tabId) } : undefined,
      };
    case 'navigate':
      return { method: 'POST', path: '/navigate', body: args };
    case 'tabs.switch':
      return { method: 'POST', path: '/tabs/switch', body: args };
    case 'tabs.close':
      return { method: 'POST', path: '/tabs/close', body: args };
    case 'act':
      return { method: 'POST', path: '/act', body: args };
    case 'history.search':
      return { method: 'GET', path: '/history/search', query: args as Record<string, string> };
    case 'bookmarks.search':
      return { method: 'GET', path: '/bookmarks/search', query: args as Record<string, string> };
    case 'network.request':
      return { method: 'POST', path: '/network/request', body: args };
    case 'javascript.eval':
      return { method: 'POST', path: '/javascript/eval', body: args };
  }
}

export default function register(api: OpenClawPluginApi) {
  api.registerGatewayMethod('browser-ext.request', ({ payload, respond }) => {
    try {
      const body = (payload || {}) as BrowserExtPayload;
      if (!body.action) {
        respond(false, { error: 'Missing required field: action' });
        return;
      }

      const request = mapActionToRequest(body.action, body.args || {});

      // Prefer direct forwarding if host runtime supports gateway-to-gateway call.
      if (typeof api.callGatewayMethod === 'function') {
        void api
          .callGatewayMethod('browser.request', request)
          .then((result) => respond(true, { result }))
          .catch((error) => respond(false, { error: String(error) }));
        return;
      }

      // Fallback: return mapped request so callers can forward through browser.request.
      respond(true, {
        method: 'browser.request',
        params: request,
      });
    } catch (error) {
      api.logger.error('browser-ext.request failed', { error: String(error) });
      respond(false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  api.logger.info('browser-ext plugin ready');
}
