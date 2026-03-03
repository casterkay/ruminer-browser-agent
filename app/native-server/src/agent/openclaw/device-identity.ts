import { createHash, generateKeyPairSync } from 'node:crypto';
import { getDb } from '../db/client';

export interface OpenClawDeviceIdentity {
  deviceId: string;
  publicKey: string; // base64url raw
  privateKey: string; // base64url pkcs8
  createdAtMs: number;
}

const IDENTITY_ROW_ID = 'default';

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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeIdentityRow(row: {
  device_id?: unknown;
  public_key?: unknown;
  private_key?: unknown;
  created_at_ms?: unknown;
}): OpenClawDeviceIdentity | null {
  if (!isNonEmptyString(row.public_key) || !isNonEmptyString(row.private_key)) {
    return null;
  }

  const publicKeyBytes = base64UrlToBytes(row.public_key);
  const computedDeviceId = sha256Hex(publicKeyBytes);

  const createdAtMs =
    typeof row.created_at_ms === 'number' && Number.isFinite(row.created_at_ms)
      ? row.created_at_ms
      : Date.now();

  return {
    deviceId: computedDeviceId,
    publicKey: row.public_key,
    privateKey: row.private_key,
    createdAtMs,
  };
}

function extractRawEd25519PublicKeyFromSpkiDer(spkiDer: Uint8Array): Uint8Array {
  // Ed25519 SPKI encodes the 32-byte public key as a BIT STRING.
  // Common encoding ends with: 0x03 0x21 0x00 <32 bytes>
  for (let i = 0; i < spkiDer.length - 35; i += 1) {
    if (spkiDer[i] === 0x03 && spkiDer[i + 1] === 0x21 && spkiDer[i + 2] === 0x00) {
      return spkiDer.subarray(i + 3, i + 35);
    }
  }

  // Fallback: many encodings place the raw key at the end.
  if (spkiDer.length >= 32) {
    return spkiDer.subarray(spkiDer.length - 32);
  }

  throw new Error('Failed to extract raw Ed25519 public key from SPKI');
}

function generateIdentity(): OpenClawDeviceIdentity {
  const keyPair = generateKeyPairSync('ed25519');

  const spkiDer = new Uint8Array(keyPair.publicKey.export({ format: 'der', type: 'spki' }));
  const rawPublicKey = extractRawEd25519PublicKeyFromSpkiDer(spkiDer);
  const privateKeyPkcs8 = new Uint8Array(
    keyPair.privateKey.export({ format: 'der', type: 'pkcs8' }),
  );
  const deviceId = sha256Hex(rawPublicKey);

  return {
    deviceId,
    publicKey: bytesToBase64Url(rawPublicKey),
    privateKey: bytesToBase64Url(privateKeyPkcs8),
    createdAtMs: Date.now(),
  };
}

export async function getOrCreateOpenClawDeviceIdentity(): Promise<OpenClawDeviceIdentity> {
  const db = getDb();
  const row = db.get<{
    device_id?: unknown;
    public_key?: unknown;
    private_key?: unknown;
    created_at_ms?: unknown;
  }>(
    'SELECT device_id, public_key, private_key, created_at_ms FROM openclaw_device_identity WHERE id = ?',
    [IDENTITY_ROW_ID],
  );

  if (row) {
    const normalized = normalizeIdentityRow(row);
    if (normalized) {
      // Repair stored device_id if it drifted.
      if (isNonEmptyString(row.device_id) && row.device_id !== normalized.deviceId) {
        db.run('UPDATE openclaw_device_identity SET device_id = ? WHERE id = ?', [
          normalized.deviceId,
          IDENTITY_ROW_ID,
        ]);
      }
      return normalized;
    }
  }

  // Create new identity.
  const identity = generateIdentity();

  db.run(
    'INSERT INTO openclaw_device_identity (id, device_id, public_key, private_key, created_at_ms) VALUES (?, ?, ?, ?, ?)',
    [
      IDENTITY_ROW_ID,
      identity.deviceId,
      identity.publicKey,
      identity.privateKey,
      identity.createdAtMs,
    ],
  );

  return identity;
}
