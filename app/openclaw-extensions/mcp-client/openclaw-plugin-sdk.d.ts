// Minimal local type shim for the OpenClaw Plugin SDK.
//
// This plugin is bundled with `openclaw/*` imports marked as external so the
// runtime resolves them from the OpenClaw host. We still need TypeScript types
// locally for `tsc` and `tsup --dts`.

declare module 'openclaw/plugin-sdk/plugin-entry' {
  export type PluginRegistrationMode = 'full' | 'setup-only' | 'setup-runtime';

  export type OpenClawPluginConfigSchema =
    | {
        type: 'object';
        additionalProperties?: boolean;
        properties?: Record<string, unknown>;
        required?: string[];
        [key: string]: unknown;
      }
    | Record<string, unknown>;

  export type PluginLogger = {
    debug: (message: string, meta?: unknown) => void;
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
  };

  export type GatewayHandlerOpts = {
    params: Record<string, unknown>;
    respond: (
      ok: boolean,
      payload?: unknown,
      error?: { message: string; code?: string } | { error: string } | unknown,
      meta?: Record<string, unknown>,
    ) => void;
    [key: string]: unknown;
  };

  export type OpenClawTool = {
    name: string;
    description: string;
    parameters: unknown;
    execute: (
      id: string,
      params: unknown,
    ) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
  };

  export type OpenClawPluginApi = {
    id: string;
    name: string;
    source: string;
    rootDir?: string;
    config: unknown;
    pluginConfig?: Record<string, unknown>;
    runtime?: unknown;
    logger: PluginLogger;
    registrationMode: PluginRegistrationMode;
    resolvePath: (input: string) => string;
    registerGatewayMethod: (method: string, handler: (opts: GatewayHandlerOpts) => unknown) => void;
    registerService: (svc: {
      id: string;
      start: (ctx: unknown) => Promise<void> | void;
      stop?: (ctx: unknown) => Promise<void> | void;
    }) => void;
    registerTool?: (def: OpenClawTool, opts?: { optional?: boolean }) => void;
  };

  export type PluginEntry = {
    id: string;
    name: string;
    description: string;
    kind?: string;
    configSchema?: OpenClawPluginConfigSchema | (() => OpenClawPluginConfigSchema);
    register: (api: OpenClawPluginApi) => unknown;
  };

  export function definePluginEntry<T extends PluginEntry>(entry: T): T;
}
