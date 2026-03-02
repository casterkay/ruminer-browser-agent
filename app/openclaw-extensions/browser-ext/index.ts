import { TOOL_SCHEMAS } from '../../../packages/shared/src/tools';
import { spawn } from 'node:child_process';

type BrowserExtRequestPayload = {
  name: string;
  args?: unknown;
  timeoutMs?: number;
};

type BrowserExtPluginConfig = {
  /**
   * If set, call tools via a named mcporter server (from mcporter config).
   * Example: "ruminer" to call `mcporter call ruminer.<tool> ...`
   */
  mcporterServer?: string;
  /**
   * If set, call tools via `mcporter --config <path> ...` to isolate config.
   */
  mcporterConfigPath?: string;
  /**
   * Override the mcporter executable (default: "mcporter").
   */
  mcporterCommand?: string;
  /**
   * Fallback MCP HTTP URL (default: http://127.0.0.1:12306/mcp).
   * Used when mcporterServer is not configured.
   */
  mcpUrl?: string;
};

type OpenClawPluginApi = {
  registerGatewayMethod: (
    id: string,
    handler: (args: {
      respond: (ok: boolean, payload: unknown) => void;
      payload?: unknown;
    }) => void,
  ) => void;
  registerTool?: (
    def: {
      name: string;
      description: string;
      parameters: unknown;
      execute: (
        id: string,
        params: unknown,
      ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
    },
    opts?: { optional?: boolean },
  ) => void;
  logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
  };
  config: unknown;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConfig(raw: unknown): BrowserExtPluginConfig {
  if (!isObjectRecord(raw)) {
    return {};
  }
  return {
    mcporterServer: typeof raw.mcporterServer === 'string' ? raw.mcporterServer : undefined,
    mcporterConfigPath:
      typeof raw.mcporterConfigPath === 'string' ? raw.mcporterConfigPath : undefined,
    mcporterCommand: typeof raw.mcporterCommand === 'string' ? raw.mcporterCommand : undefined,
    mcpUrl: typeof raw.mcpUrl === 'string' ? raw.mcpUrl : undefined,
  };
}

function resolveMcpUrl(config: BrowserExtPluginConfig): string {
  const trimmed = (config.mcpUrl || '').trim();
  if (trimmed) {
    return trimmed;
  }
  return 'http://127.0.0.1:12306/mcp';
}

async function runMcporter(
  api: OpenClawPluginApi,
  config: BrowserExtPluginConfig,
  toolName: string,
  args: unknown,
  timeoutMs?: number,
): Promise<unknown> {
  const command = (config.mcporterCommand || 'mcporter').trim() || 'mcporter';
  const toolArgs = isObjectRecord(args) ? args : {};

  const argv: string[] = ['call'];
  if (config.mcporterConfigPath?.trim()) {
    argv.push('--config', config.mcporterConfigPath.trim());
  }

  if (config.mcporterServer?.trim()) {
    argv.push(`${config.mcporterServer.trim()}.${toolName}`);
  } else {
    const mcpUrl = resolveMcpUrl(config);
    argv.push('--http-url', mcpUrl);
    if (mcpUrl.startsWith('http://')) {
      argv.push('--allow-http');
    }
    argv.push(toolName);
  }

  argv.push('--args', JSON.stringify(toolArgs));
  argv.push('--output', 'json');

  if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    argv.push('--timeout', String(Math.floor(timeoutMs)));
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Failed to run mcporter (${command}): ${error.message}. Is mcporter installed and on PATH?`,
        ),
      );
    });

    child.on('close', (code) => {
      const textOut = stdout.trim();
      const textErr = stderr.trim();

      if (code !== 0) {
        api.logger.error('mcporter call failed', {
          toolName,
          code,
          stderr: textErr,
          stdout: textOut,
        });
        reject(new Error(textErr || textOut || `mcporter exited with code ${code}`));
        return;
      }

      if (!textOut) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(textOut));
      } catch {
        resolve(textOut);
      }
    });
  });
}

function splitRequestPayload(payload: unknown): {
  params: Record<string, unknown>;
  timeoutMs: number | null;
} {
  if (!isObjectRecord(payload)) {
    throw new Error('browser-ext request payload must be an object');
  }

  const raw = { ...payload };
  const timeoutMs = typeof raw.timeoutMs === 'number' ? raw.timeoutMs : null;
  delete raw.timeoutMs;

  if (typeof raw.name !== 'string' || !raw.name) {
    throw new Error('Missing required field: name');
  }

  return {
    params: raw,
    timeoutMs,
  };
}

function serializeToolResultText(result: unknown): string {
  if (typeof result === 'string') return result;
  return JSON.stringify(result ?? null);
}

async function handleBrowserExtRequest(api: OpenClawPluginApi, payload: unknown): Promise<unknown> {
  const config = normalizeConfig(api.config);
  const { params, timeoutMs } = splitRequestPayload(payload);

  const toolName = String(params.name || '');

  if (toolName === 'schema.get') {
    return TOOL_SCHEMAS;
  }

  const args = (params as BrowserExtRequestPayload).args ?? {};
  return runMcporter(api, config, toolName, args, timeoutMs ?? undefined);
}

export default function register(api: OpenClawPluginApi) {
  api.registerGatewayMethod('browser-ext.request', ({ payload, respond }) => {
    void handleBrowserExtRequest(api, payload)
      .then((result) => respond(true, { result }))
      .catch((error) => {
        api.logger.error('browser-ext.request failed', { error: String(error) });
        respond(false, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  if (typeof api.registerTool === 'function') {
    for (const tool of TOOL_SCHEMAS) {
      try {
        api.registerTool(
          {
            name: tool.name,
            description: tool.description || `Browser extension tool: ${tool.name}`,
            parameters: tool.inputSchema || { type: 'object', properties: {}, required: [] },
            execute: async (_id, params) => {
              const config = normalizeConfig(api.config);
              const result = await runMcporter(
                api,
                config,
                tool.name,
                isObjectRecord(params) ? params : {},
              );
              return {
                content: [
                  {
                    type: 'text',
                    text: serializeToolResultText(result),
                  },
                ],
              };
            },
          },
          { optional: false },
        );
      } catch (error) {
        api.logger.warn('failed to register tool via browser-ext plugin', {
          toolName: tool.name,
          error: String(error),
        });
      }
    }
  }

  api.logger.info('browser-ext plugin ready (mcporter → MCP → native-host → extension tools)', {
    registeredCount: TOOL_SCHEMAS.length,
  });
}
