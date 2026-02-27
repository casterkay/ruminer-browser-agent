import type { InboundRequestResult } from './connection';
import type { BrowserProxyRequest, GatewayRequestFrame } from './protocol';
import { dispatchBrowserProxyRequest } from './browser-proxy-dispatcher';

function isBrowserProxyRequest(value: unknown): value is BrowserProxyRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BrowserProxyRequest).method === 'string' &&
    typeof (value as BrowserProxyRequest).path === 'string'
  );
}

function extractBrowserProxyRequest(frame: GatewayRequestFrame): BrowserProxyRequest | null {
  if (frame.method === 'browser.proxy' && isBrowserProxyRequest(frame.params)) {
    return frame.params;
  }

  if (frame.method !== 'node.invoke') {
    return null;
  }

  const payload = (frame.params || {}) as Record<string, unknown>;

  const invokeMethod =
    (typeof payload.method === 'string' && payload.method) ||
    (typeof payload.name === 'string' && payload.name) ||
    '';

  if (invokeMethod !== 'browser.proxy') {
    return null;
  }

  const nested = payload.params || payload.payload || payload.request || payload;
  if (isBrowserProxyRequest(nested)) {
    return nested;
  }

  return null;
}

export async function handleNodeInvokeRequest(
  frame: GatewayRequestFrame,
): Promise<InboundRequestResult> {
  const browserProxyRequest = extractBrowserProxyRequest(frame);

  if (!browserProxyRequest) {
    return {
      ok: false,
      payload: {
        ok: false,
        error: {
          code: 'unsupported_invoke_method',
          message: `Unsupported inbound method: ${frame.method}`,
        },
      },
    };
  }

  const response = await dispatchBrowserProxyRequest(browserProxyRequest);
  return {
    ok: response.ok,
    payload: response,
  };
}
