const DEFAULT_NATIVE_SERVER_PORT = 12306;

export function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function normalizeNullableString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

export async function getNativeServerPort(): Promise<number> {
  const stored = await chrome.storage.local.get(['nativeServerPort']);
  const raw = stored?.nativeServerPort;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_NATIVE_SERVER_PORT;
}

export async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}
