export type GatewayRpcId = string;

export interface GatewayRequestFrame<TParams = unknown> {
  type: 'req';
  id: GatewayRpcId;
  method: string;
  params?: TParams;
}

export interface GatewayResponseFrame<TPayload = unknown> {
  type: 'res';
  id: GatewayRpcId;
  ok: boolean;
  payload?: TPayload;
}

export interface GatewayEventFrame<TPayload = unknown> {
  type: 'evt';
  event: string;
  seq?: number;
  payload?: TPayload;
}

export type GatewayInboundFrame = GatewayRequestFrame | GatewayResponseFrame | GatewayEventFrame;

export interface GatewayConnectParams {
  role: 'node' | 'operator';
  caps?: string[];
  auth?: {
    token: string;
  };
  device?: {
    id: string;
    name?: string;
  };
}

export interface GatewayHelloOkPayload {
  type?: 'hello-ok';
  nodeId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface NodeInvokePayload {
  invokeId?: string;
  method?: string;
  params?: unknown;
  [key: string]: unknown;
}

export interface BrowserProxyRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

export interface BrowserProxyError {
  code: string;
  message: string;
  details?: unknown;
}

export type BrowserProxyResponse =
  | { ok: true; result: unknown }
  | {
      ok: false;
      error: BrowserProxyError;
    };

export function isGatewayResponseFrame(value: unknown): value is GatewayResponseFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GatewayResponseFrame).type === 'res' &&
    typeof (value as GatewayResponseFrame).id === 'string'
  );
}

export function isGatewayEventFrame(value: unknown): value is GatewayEventFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GatewayEventFrame).type === 'evt' &&
    typeof (value as GatewayEventFrame).event === 'string'
  );
}

export function isGatewayRequestFrame(value: unknown): value is GatewayRequestFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as GatewayRequestFrame).type === 'req' &&
    typeof (value as GatewayRequestFrame).id === 'string' &&
    typeof (value as GatewayRequestFrame).method === 'string'
  );
}
