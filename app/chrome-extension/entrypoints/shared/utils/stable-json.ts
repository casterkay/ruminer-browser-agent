/**
 * Stable JSON serialization (deterministic key order).
 * @description
 * Used for hashing configs/filters/versioning where object key order must not affect the result.
 */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeForJson(value: unknown, seen: Set<unknown>): unknown {
  if (value === null) return null;
  if (value === undefined) return undefined;

  const t = typeof value;
  if (t === 'string' || t === 'boolean') return value;
  if (t === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (t !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    throw new Error('stableJson: circular reference');
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeForJson(item, seen));
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (!isPlainRecord(value)) {
      // Best-effort: stringify non-plain objects by their JSON representation if possible.
      try {
        return JSON.parse(JSON.stringify(value)) as unknown;
      } catch {
        return String(value);
      }
    }

    const keys = Object.keys(value).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const normalized = normalizeForJson(value[key], seen);
      if (normalized === undefined) continue;
      out[key] = normalized;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

export function stableJson(value: unknown): string {
  const normalized = normalizeForJson(value, new Set());
  return JSON.stringify(normalized);
}
