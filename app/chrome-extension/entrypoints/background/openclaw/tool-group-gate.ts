import type { BrowserProxyError } from './protocol';
import { getToolGroupState, type ToolGroupId } from '@/entrypoints/shared/utils/tool-groups';

export function getToolGroupForRoute(path: string): ToolGroupId {
  if (path.startsWith('/rr_v3/')) return 'workflow';
  if (
    path.startsWith('/network/') ||
    path.startsWith('/javascript/') ||
    path.startsWith('/file/')
  ) {
    return 'execute';
  }
  if (path.startsWith('/element-selection/') || path === '/act') {
    return 'interact';
  }
  if (path === '/navigate' || path === '/tabs/switch' || path === '/tabs/close') {
    return 'navigate';
  }
  return 'observe';
}

export function createToolGroupDisabledError(
  groupId: ToolGroupId,
  method: string,
  path: string,
): BrowserProxyError {
  return {
    code: 'tool_group_disabled',
    message: `Disabled by tool group: ${groupId[0].toUpperCase()}${groupId.slice(1)}`,
    details: {
      groupId,
      method,
      path,
    },
  };
}

export async function ensureToolGroupEnabled(
  method: string,
  path: string,
): Promise<{ ok: true } | { ok: false; error: BrowserProxyError }> {
  const groupId = getToolGroupForRoute(path);
  const state = await getToolGroupState();

  if (state[groupId]) {
    return { ok: true };
  }

  return {
    ok: false,
    error: createToolGroupDisabledError(groupId, method, path),
  };
}
