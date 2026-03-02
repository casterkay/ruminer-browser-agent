export const COMMAND_NAME = 'mcp-chrome-bridge';
export const HOST_NAME = 'com.chromemcp.nativehost';
export const DESCRIPTION = 'Node.js Host for Browser Bridge Extension';

const DEFAULT_EXTENSION_IDS = ['chbienkbakdikbkehibcoolnafdjdkln'];

function normalizeExtensionId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^chrome-extension:\/\/([a-p]{32})\/?$/);
  if (match?.[1]) {
    return match[1];
  }

  if (/^[a-p]{32}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function getExtensionIds(): string[] {
  const raw =
    process.env.RUMINER_EXTENSION_IDS ||
    process.env.RUMINER_EXTENSION_ID ||
    process.env.CHROME_EXTENSION_ID ||
    '';

  const candidates = raw
    ? raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : DEFAULT_EXTENSION_IDS;

  const ids = candidates
    .map((value) => normalizeExtensionId(value))
    .filter((value): value is string => !!value);

  return Array.from(new Set(ids));
}

export function getAllowedOrigins(): string[] {
  const ids = getExtensionIds();
  return ids.map((id) => `chrome-extension://${id}/`);
}
