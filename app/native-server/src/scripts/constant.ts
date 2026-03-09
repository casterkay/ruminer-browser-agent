import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COMMAND_NAME = 'mcp-chrome-bridge';
export const HOST_NAME = 'com.chromemcp.nativehost';
export const DESCRIPTION = 'Node.js Host for Browser Bridge Extension';

const LEGACY_EXTENSION_IDS = ['chbienkbakdikbkehibcoolnafdjdkln'];

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

function deriveExtensionIdFromPublicKey(publicKey: string): string | null {
  try {
    const keyBytes = Buffer.from(publicKey, 'base64');
    if (keyBytes.length === 0) return null;

    const hash = createHash('sha256').update(keyBytes).digest();
    const alphabet = 'abcdefghijklmnop';

    let extensionId = '';
    for (const byte of hash.subarray(0, 16)) {
      extensionId += alphabet[(byte >> 4) & 0x0f] + alphabet[byte & 0x0f];
    }

    return extensionId;
  } catch {
    return null;
  }
}

function getManifestCandidates(): string[] {
  return [
    path.resolve(process.cwd(), 'app/chrome-extension/.output/chrome-mv3-dev/manifest.json'),
    path.resolve(process.cwd(), 'app/chrome-extension/.output/chrome-mv3/manifest.json'),
    path.resolve(process.cwd(), '../chrome-extension/.output/chrome-mv3-dev/manifest.json'),
    path.resolve(process.cwd(), '../chrome-extension/.output/chrome-mv3/manifest.json'),
    path.resolve(__dirname, '../../../chrome-extension/.output/chrome-mv3-dev/manifest.json'),
    path.resolve(__dirname, '../../../chrome-extension/.output/chrome-mv3/manifest.json'),
  ];
}

function getDerivedExtensionId(): string | null {
  for (const manifestPath of getManifestCandidates()) {
    try {
      if (!fs.existsSync(manifestPath)) continue;

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { key?: unknown };
      if (typeof manifest.key !== 'string' || manifest.key.trim().length === 0) {
        continue;
      }

      const extensionId = deriveExtensionIdFromPublicKey(manifest.key);
      if (extensionId) {
        return extensionId;
      }
    } catch {
      // Best-effort detection only.
    }
  }

  return null;
}

export function getExtensionIds(): string[] {
  const raw = process.env.RUMINER_EXTENSION_ID || process.env.CHROME_EXTENSION_ID || '';

  const candidates = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const derivedExtensionId = getDerivedExtensionId();
  if (derivedExtensionId) {
    candidates.push(derivedExtensionId);
  }

  candidates.push(...LEGACY_EXTENSION_IDS);

  const ids = candidates
    .map((value) => normalizeExtensionId(value))
    .filter((value): value is string => !!value);

  return Array.from(new Set(ids));
}

export function getAllowedOrigins(): string[] {
  const ids = getExtensionIds();
  return ids.map((id) => `chrome-extension://${id}/`);
}
