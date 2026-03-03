import { createPrivateKey, sign } from 'node:crypto';
import type { OpenClawDeviceIdentity } from './device-identity';

export const GATEWAY_PROTOCOL_VERSION = 3;

export const OPENCLAW_CLIENT_IDS = {
  NODE_HOST: 'node-host',
} as const;

export const OPENCLAW_CLIENT_MODES = {
  NODE: 'node',
} as const;

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
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return new Uint8Array(Buffer.from(padded, 'base64'));
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

function signDevicePayload(privateKeyBase64Url: string, payload: string): string {
  const privateKeyDer = base64UrlToBytes(privateKeyBase64Url);
  const key = createPrivateKey({ key: Buffer.from(privateKeyDer), format: 'der', type: 'pkcs8' });
  const signature = sign(null, Buffer.from(payload, 'utf8'), key);
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

export function buildSignedConnectParams(
  input: {
    identity: OpenClawDeviceIdentity;
  } & BuildGatewayConnectParamsInput,
): {
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
} {
  const scopes = input.scopes || [];
  const caps = input.caps || [];
  const commands = input.commands || [];
  const permissions = input.permissions || {};
  const signedAtMs = Date.now();
  const nonce = input.nonce || undefined;

  const payload = buildDeviceAuthPayload({
    deviceId: input.identity.deviceId,
    clientId: input.client.id,
    clientMode: input.client.mode,
    role: input.role,
    scopes,
    signedAtMs,
    token: input.authToken,
    nonce,
  });

  const signature = signDevicePayload(input.identity.privateKey, payload);

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
      id: input.identity.deviceId,
      publicKey: input.identity.publicKey,
      signature,
      signedAt: signedAtMs,
      ...(nonce ? { nonce } : {}),
    },
  };
}
