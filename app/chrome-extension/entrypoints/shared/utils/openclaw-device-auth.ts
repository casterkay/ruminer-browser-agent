import { STORAGE_KEYS } from '@/common/constants';

const IDENTITY_STORAGE_KEY = 'openclawGatewayDeviceIdentityV1';
const IDENTITY_VERSION = 1;

export const GATEWAY_PROTOCOL_VERSION = 3;

export const OPENCLAW_CLIENT_IDS = {
  CONTROL_UI: 'openclaw-control-ui',
  NODE_HOST: 'node-host',
} as const;

export const OPENCLAW_CLIENT_MODES = {
  WEBCHAT: 'webchat',
  NODE: 'node',
} as const;

interface StoredDeviceIdentity {
  version: number;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
}

export interface GatewayClientInfo {
  id: string;
  version: string;
  platform: string;
  mode: string;
}

export interface BuildGatewayConnectParamsInput {
  role: 'operator' | 'node';
  authToken: string;
  client: GatewayClientInfo;
  scopes?: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, unknown>;
  locale?: string;
  userAgent?: string;
  nonce?: string | null;
}

interface GatewayEventFrameLike {
  type?: string;
  event?: string;
  payload?: unknown;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isStoredIdentity(value: unknown): value is StoredDeviceIdentity {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const identity = value as Partial<StoredDeviceIdentity>;
  return (
    identity.version === IDENTITY_VERSION &&
    typeof identity.deviceId === 'string' &&
    identity.deviceId.length > 0 &&
    typeof identity.publicKey === 'string' &&
    identity.publicKey.length > 0 &&
    typeof identity.privateKey === 'string' &&
    identity.privateKey.length > 0 &&
    typeof identity.createdAtMs === 'number' &&
    Number.isFinite(identity.createdAtMs)
  );
}

async function generateIdentity(): Promise<StoredDeviceIdentity> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' } as AlgorithmIdentifier,
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const privateKeyPkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  );
  const deviceId = await sha256Hex(publicKeyRaw);

  return {
    version: IDENTITY_VERSION,
    deviceId,
    publicKey: bytesToBase64Url(publicKeyRaw),
    privateKey: bytesToBase64Url(privateKeyPkcs8),
    createdAtMs: Date.now(),
  };
}

async function persistIdentity(identity: StoredDeviceIdentity): Promise<void> {
  const current =
    (await chrome.storage.local.get(STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS))[
      STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS
    ] || {};

  await chrome.storage.local.set({
    [IDENTITY_STORAGE_KEY]: identity,
    [STORAGE_KEYS.OPENCLAW_GATEWAY_DEVICE_ID]: identity.deviceId,
    [STORAGE_KEYS.OPENCLAW_GATEWAY_SETTINGS]: { ...current, deviceId: identity.deviceId },
  });
}

async function loadOrCreateIdentity(): Promise<StoredDeviceIdentity> {
  const raw = (await chrome.storage.local.get(IDENTITY_STORAGE_KEY))[IDENTITY_STORAGE_KEY];
  if (isStoredIdentity(raw)) {
    const expectedDeviceId = await sha256Hex(base64UrlToBytes(raw.publicKey));
    const normalizedIdentity = { ...raw, deviceId: expectedDeviceId };
    if (raw.deviceId !== expectedDeviceId) {
      await persistIdentity(normalizedIdentity);
    }
    return normalizedIdentity;
  }

  const identity = await generateIdentity();
  await persistIdentity(identity);
  return identity;
}

function buildDeviceAuthPayload(input: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: 'operator' | 'node';
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce?: string | null;
}): string {
  const version = input.nonce ? 'v2' : 'v1';
  return [
    version,
    input.deviceId,
    input.clientId,
    input.clientMode,
    input.role,
    input.scopes.join(','),
    String(input.signedAtMs),
    input.token,
    input.nonce || '',
  ].join('|');
}

async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64UrlToBytes(privateKeyBase64Url),
    { name: 'Ed25519' } as AlgorithmIdentifier,
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' } as AlgorithmIdentifier,
    privateKey,
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export function extractConnectChallengeNonce(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }

  let frame: GatewayEventFrameLike;
  try {
    frame = JSON.parse(raw) as GatewayEventFrameLike;
  } catch {
    return undefined;
  }

  if ((frame.type !== 'event' && frame.type !== 'evt') || frame.event !== 'connect.challenge') {
    return undefined;
  }

  if (typeof frame.payload !== 'object' || !frame.payload) {
    return '';
  }
  const payload = frame.payload as { nonce?: unknown };
  return typeof payload.nonce === 'string' ? payload.nonce : '';
}

export async function buildSignedConnectParams(input: BuildGatewayConnectParamsInput): Promise<{
  minProtocol: number;
  maxProtocol: number;
  client: GatewayClientInfo;
  role: 'operator' | 'node';
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, unknown>;
  auth: { token: string };
  locale?: string;
  userAgent?: string;
  device: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce?: string;
  };
}> {
  const identity = await loadOrCreateIdentity();
  const scopes = input.scopes || [];
  const caps = input.caps || [];
  const commands = input.commands || [];
  const permissions = input.permissions || {};
  const signedAtMs = Date.now();
  const nonce = input.nonce || undefined;

  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: input.client.id,
    clientMode: input.client.mode,
    role: input.role,
    scopes,
    signedAtMs,
    token: input.authToken,
    nonce,
  });
  const signature = await signDevicePayload(identity.privateKey, payload);

  return {
    minProtocol: GATEWAY_PROTOCOL_VERSION,
    maxProtocol: GATEWAY_PROTOCOL_VERSION,
    client: input.client,
    role: input.role,
    scopes,
    caps,
    commands,
    permissions,
    auth: { token: input.authToken },
    locale: input.locale,
    userAgent: input.userAgent,
    device: {
      id: identity.deviceId,
      publicKey: identity.publicKey,
      signature,
      signedAt: signedAtMs,
      ...(nonce ? { nonce } : {}),
    },
  };
}
