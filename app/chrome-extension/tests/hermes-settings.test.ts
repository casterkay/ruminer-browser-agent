import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getHermesSettings, setHermesSettings } from '@/entrypoints/shared/utils/hermes-settings';
import { testHermes as testHermesConnection } from '@/entrypoints/shared/utils/system-settings';

const NATIVE_PORT = 12306;
const DEFAULT_BASE_URL = 'http://127.0.0.1:8642';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Hermes settings utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (chrome.runtime.sendMessage as any).mockResolvedValue({
      success: true,
      serverStatus: { isRunning: true, port: NATIVE_PORT },
    });

    (chrome.storage.local.get as any).mockImplementation(async (keys: unknown) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const response: Record<string, unknown> = {};

      if (keyList.includes('nativeServerPort')) {
        response.nativeServerPort = NATIVE_PORT;
      }
      if (keyList.includes('hermesSettings')) {
        response.hermesSettings = {};
      }

      return response;
    });

    (chrome.storage.local.set as any).mockResolvedValue(undefined);
  });

  it('falls back to local storage when the native server is unavailable', async () => {
    (chrome.storage.local.get as any).mockImplementation(async (keys: unknown) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const response: Record<string, unknown> = {};

      if (keyList.includes('nativeServerPort')) {
        response.nativeServerPort = NATIVE_PORT;
      }
      if (keyList.includes('hermesSettings')) {
        response.hermesSettings = {
          baseUrl: DEFAULT_BASE_URL,
          apiKey: 'local-hermes-key',
          workspaceRoot: '/tmp/local-hermes',
          updatedAt: '2026-04-24T00:00:00.000Z',
          lastTestOkAt: '2026-04-24T00:30:00.000Z',
          lastTestError: null,
        };
      }

      return response;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('native server offline');
      }),
    );

    const settings = await getHermesSettings();

    expect(settings).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'local-hermes-key',
      workspaceRoot: '/tmp/local-hermes',
      updatedAt: '2026-04-24T00:00:00.000Z',
      lastTestOkAt: '2026-04-24T00:30:00.000Z',
      lastTestError: null,
    });
  });

  it('persists Hermes settings via native server and mirrors the response locally', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url === `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/settings` &&
        init?.method === 'POST'
      ) {
        expect(JSON.parse(String(init.body))).toEqual({
          baseUrl: DEFAULT_BASE_URL,
          apiKey: 'remote-hermes-key',
          workspaceRoot: '/tmp/remote-hermes',
        });
        return jsonResponse({
          settings: {
            baseUrl: DEFAULT_BASE_URL,
            apiKey: 'remote-hermes-key',
            workspaceRoot: '/tmp/remote-hermes',
            updatedAt: '2026-04-24T01:00:00.000Z',
            lastTestOkAt: null,
            lastTestError: null,
          },
        });
      }

      if (
        url === `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/settings` &&
        (!init?.method || init.method === 'GET')
      ) {
        return jsonResponse({
          settings: {
            baseUrl: DEFAULT_BASE_URL,
            apiKey: 'remote-hermes-key',
            workspaceRoot: '/tmp/remote-hermes',
            updatedAt: '2026-04-24T01:00:00.000Z',
            lastTestOkAt: null,
            lastTestError: null,
          },
        });
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const settings = await setHermesSettings({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'remote-hermes-key',
      workspaceRoot: '/tmp/remote-hermes',
    });

    expect(settings).toEqual({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: 'remote-hermes-key',
      workspaceRoot: '/tmp/remote-hermes',
      updatedAt: '2026-04-24T01:00:00.000Z',
      lastTestOkAt: null,
      lastTestError: null,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      hermesSettings: {
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'remote-hermes-key',
        workspaceRoot: '/tmp/remote-hermes',
        updatedAt: '2026-04-24T01:00:00.000Z',
        lastTestOkAt: null,
        lastTestError: null,
      },
    });
  });

  it('tests Hermes after persisting the current settings', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (
        url === `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/settings` &&
        init?.method === 'POST'
      ) {
        return jsonResponse({
          settings: {
            baseUrl: DEFAULT_BASE_URL,
            apiKey: 'remote-hermes-key',
            workspaceRoot: '/tmp/remote-hermes',
            updatedAt: '2026-04-24T01:05:00.000Z',
            lastTestOkAt: null,
            lastTestError: null,
          },
        });
      }

      if (
        url === `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/settings` &&
        (!init?.method || init.method === 'GET')
      ) {
        return jsonResponse({
          settings: {
            baseUrl: DEFAULT_BASE_URL,
            apiKey: 'remote-hermes-key',
            workspaceRoot: '/tmp/remote-hermes',
            updatedAt: '2026-04-24T01:05:00.000Z',
            lastTestOkAt: null,
            lastTestError: null,
          },
        });
      }

      if (url === `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/test` && init?.method === 'POST') {
        return jsonResponse({
          ok: true,
          message: 'Hermes API server connect OK',
        });
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await testHermesConnection(
      DEFAULT_BASE_URL,
      'remote-hermes-key',
      '/tmp/remote-hermes',
    );

    expect(result).toEqual({
      ok: true,
      message: 'Hermes API server connect OK',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:${NATIVE_PORT}/agent/hermes/test`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
