import type { RunId } from '../../domain/ids';

const cancelRequested = new Set<RunId>();

export function requestCancel(runId: RunId): void {
  const rid = String(runId || '').trim() as RunId;
  if (!rid) return;
  cancelRequested.add(rid);
}

export function isCancelRequested(runId: RunId): boolean {
  const rid = String(runId || '').trim() as RunId;
  if (!rid) return false;
  return cancelRequested.has(rid);
}

export function clearCancelRequest(runId: RunId): void {
  const rid = String(runId || '').trim() as RunId;
  if (!rid) return;
  cancelRequested.delete(rid);
}
