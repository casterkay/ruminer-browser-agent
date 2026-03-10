import type { IngestionLedgerEntry } from './ingestion-ledger';

export interface LedgerCandidate {
  item_key: string;
  content_hash: string;
  source_url: string | null;
  group_id: string;
  sender: string;
  evermemos_message_id: string;
}

export type LedgerAction = 'ingest' | 'update' | 'skip';

export interface LedgerDecision {
  action: LedgerAction;
  reason: string;
  nextEntry: IngestionLedgerEntry;
  shouldAdvanceCursor: boolean;
}

export function applyLedgerPolicy(
  existing: IngestionLedgerEntry | null,
  candidate: LedgerCandidate,
  nowIso = new Date().toISOString(),
): LedgerDecision {
  if (!existing) {
    return {
      action: 'ingest',
      reason: 'new_item_key',
      shouldAdvanceCursor: true,
      nextEntry: {
        item_key: candidate.item_key,
        content_hash: candidate.content_hash,
        source_url: candidate.source_url,
        group_id: candidate.group_id,
        sender: candidate.sender,
        evermemos_message_id: candidate.evermemos_message_id,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        last_ingested_at: nowIso,
        status: 'ingested',
        last_error: null,
      },
    };
  }

  if (existing.content_hash !== candidate.content_hash) {
    return {
      action: 'update',
      reason: 'content_hash_changed',
      shouldAdvanceCursor: true,
      nextEntry: {
        ...existing,
        content_hash: candidate.content_hash,
        source_url: candidate.source_url,
        group_id: candidate.group_id,
        sender: candidate.sender,
        evermemos_message_id: candidate.evermemos_message_id,
        last_seen_at: nowIso,
        last_ingested_at: nowIso,
        status: 'ingested',
        last_error: null,
      },
    };
  }

  return {
    action: 'skip',
    reason: 'content_hash_unchanged',
    shouldAdvanceCursor: true,
    nextEntry: {
      ...existing,
      source_url: candidate.source_url,
      group_id: candidate.group_id,
      sender: candidate.sender,
      evermemos_message_id: candidate.evermemos_message_id,
      last_seen_at: nowIso,
      status: 'skipped',
      last_error: null,
    },
  };
}

export function toFailedLedgerEntry(
  existing: IngestionLedgerEntry | null,
  candidate: LedgerCandidate,
  error: string,
  nowIso = new Date().toISOString(),
): IngestionLedgerEntry {
  return {
    item_key: candidate.item_key,
    content_hash: candidate.content_hash,
    source_url: candidate.source_url,
    group_id: candidate.group_id,
    sender: candidate.sender,
    evermemos_message_id: candidate.evermemos_message_id,
    first_seen_at: existing?.first_seen_at || nowIso,
    last_seen_at: nowIso,
    last_ingested_at: existing?.last_ingested_at || null,
    status: 'failed',
    last_error: error,
  };
}

export function canAdvanceCursor(entry: IngestionLedgerEntry): boolean {
  return entry.status === 'ingested' || entry.status === 'skipped';
}
