/**
 * Shared System Settings logic
 *
 * Pure logic for MCP status, Gateway/Emos tests, and floating icon preference.
 * Used by both SystemSettingsForm.vue (extension pages) and system-settings-modal.ts (Quick Panel).
 */

import { BACKGROUND_MESSAGE_TYPES } from '@/common/message-types';
import { setGatewaySettings } from '@/entrypoints/shared/utils/gateway-settings';
import { getNativeServerPort, readJson } from '@/entrypoints/shared/utils/settings-internals';

export const STORAGE_KEY_FLOATING_ICON = 'floatingIconEnabled';

export interface ServerStatus {
  isRunning: boolean;
  port: number | null;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export async function refreshServerStatus(): Promise<ServerStatus> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS,
    });
    if (!response?.success || !response?.serverStatus) {
      return { isRunning: false, port: null };
    }
    const s = response.serverStatus;
    const port = typeof s.port === 'number' ? s.port : s.port != null ? Number(s.port) : null;
    return { isRunning: s.isRunning === true, port };
  } catch {
    return { isRunning: false, port: null };
  }
}

export async function loadFloatingIcon(): Promise<boolean> {
  try {
    const port = await getNativeServerPort();
    const response = await fetch(`http://127.0.0.1:${port}/agent/ui/settings`, { method: 'GET' });
    if (response.ok) {
      const data = await readJson<{ settings?: any }>(response);
      const enabled = data?.settings?.floatingIconEnabled;
      if (typeof enabled === 'boolean') {
        // Keep a local mirror for content scripts.
        await chrome.storage.local.set({ [STORAGE_KEY_FLOATING_ICON]: enabled });
        return enabled;
      }
    }
  } catch {
    // fall through
  }

  const result = await chrome.storage.local.get(STORAGE_KEY_FLOATING_ICON);
  const stored = result[STORAGE_KEY_FLOATING_ICON];
  return typeof stored === 'boolean' ? stored : true;
}

export async function saveFloatingIcon(enabled: boolean): Promise<void> {
  // Always write local mirror first so the UI + content script respond immediately.
  await chrome.storage.local.set({ [STORAGE_KEY_FLOATING_ICON]: enabled });

  // Best-effort: persist to native-server for durability.
  try {
    const port = await getNativeServerPort();
    await fetch(`http://127.0.0.1:${port}/agent/ui/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floatingIconEnabled: enabled }),
    });
  } catch {
    // ignore
  }
}

export async function testGateway(
  gatewayWsUrl: string,
  gatewayAuthToken: string,
): Promise<TestResult> {
  const wsUrl = gatewayWsUrl.trim();
  const authToken = gatewayAuthToken.trim();

  const status = await refreshServerStatus();
  if (!status.isRunning || !status.port) {
    return {
      ok: false,
      message: 'Native server is not running. Start it first to test OpenClaw Gateway.',
    };
  }

  try {
    // Persist settings to native-server so test uses the same config as the engine.
    await setGatewaySettings({ gatewayWsUrl: wsUrl, gatewayAuthToken: authToken });

    const response = await fetch(`http://127.0.0.1:${status.port}/agent/openclaw/test`, {
      method: 'POST',
    });

    const text = await response.text().catch(() => '');
    let data: any = null;
    try {
      data = text ? (JSON.parse(text) as any) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      return { ok: false, message: text || `HTTP ${response.status}` };
    }

    const ok = data?.ok === true;
    const message = typeof data?.message === 'string' ? data.message : ok ? 'OK' : 'Failed';
    return { ok, message };
  } catch (reason) {
    return {
      ok: false,
      message: reason instanceof Error ? reason.message : String(reason),
    };
  }
}

export async function testEmos(baseUrl: string, apiKey: string): Promise<TestResult> {
  const base = baseUrl.trim().replace(/\/$/, '');
  const key = apiKey.trim();
  const endpoint = `${base}/api/v0/memories/search?query=ping&user_id=user&limit=1`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`EverMemOS test failed (${response.status}): ${responseText}`);
    }
    return { ok: true, message: 'EverMemOS connection test passed.' };
  } catch (reason) {
    const msg =
      reason instanceof Error
        ? `${reason.message}\n\nEndpoint: ${endpoint}`
        : `${String(reason)}\n\nEndpoint: ${endpoint}`;
    return { ok: false, message: msg };
  }
}
