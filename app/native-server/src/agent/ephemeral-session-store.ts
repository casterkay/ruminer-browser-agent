import type { EngineName } from './engines/types';

export interface EphemeralSessionState {
  sessionId: string;
  projectId: string;
  engineName: EngineName;
  /**
   * Engine resume state (Claude only for now).
   * Stored in-memory to keep Quick Panel sessions stateful per page without DB writes.
   */
  claudeSessionId?: string;
  updatedAtMs: number;
}

const MAX_ENTRIES = 512;
const stateBySessionId = new Map<string, EphemeralSessionState>();

function nowMs(): number {
  return Date.now();
}

function normalizeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function evictIfNeeded(): void {
  if (stateBySessionId.size <= MAX_ENTRIES) return;

  // Evict least-recently updated entries.
  const entries = Array.from(stateBySessionId.entries());
  entries.sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);

  const overflow = stateBySessionId.size - MAX_ENTRIES;
  for (let i = 0; i < overflow; i++) {
    const key = entries[i]?.[0];
    if (key) stateBySessionId.delete(key);
  }
}

export function upsertEphemeralSessionContext(input: {
  sessionId: string;
  projectId: string;
  engineName: EngineName;
}): void {
  const sessionId = normalizeId(input.sessionId);
  const projectId = normalizeId(input.projectId);
  const engineName = input.engineName;
  if (!sessionId || !projectId || !engineName) return;

  const prev = stateBySessionId.get(sessionId);
  stateBySessionId.set(sessionId, {
    sessionId,
    projectId,
    engineName,
    claudeSessionId: prev?.claudeSessionId,
    updatedAtMs: nowMs(),
  });
  evictIfNeeded();
}

export function setEphemeralClaudeSessionId(
  sessionIdRaw: string,
  claudeSessionIdRaw: string,
): void {
  const sessionId = normalizeId(sessionIdRaw);
  const claudeSessionId = normalizeId(claudeSessionIdRaw);
  if (!sessionId || !claudeSessionId) return;

  const prev = stateBySessionId.get(sessionId);
  if (!prev) {
    // Context should have been set by upsertEphemeralSessionContext; ignore if missing.
    return;
  }

  stateBySessionId.set(sessionId, {
    ...prev,
    claudeSessionId,
    updatedAtMs: nowMs(),
  });
  evictIfNeeded();
}

export function getEphemeralSessionState(sessionIdRaw: string): EphemeralSessionState | null {
  const sessionId = normalizeId(sessionIdRaw);
  if (!sessionId) return null;

  const state = stateBySessionId.get(sessionId);
  if (!state) return null;

  // Touch for LRU behavior.
  const next = { ...state, updatedAtMs: nowMs() };
  stateBySessionId.set(sessionId, next);
  return next;
}

export function clearEphemeralSessionState(sessionIdRaw: string): void {
  const sessionId = normalizeId(sessionIdRaw);
  if (!sessionId) return;
  stateBySessionId.delete(sessionId);
}
