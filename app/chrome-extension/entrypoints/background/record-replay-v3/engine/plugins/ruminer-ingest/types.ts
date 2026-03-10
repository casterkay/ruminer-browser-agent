import type { EmosSingleMessage } from './emos-client';

export interface ExtractListPayload {
  items: unknown[];
  nextCursor: string | null;
  done: boolean;
}

export interface ExtractedMessage {
  platform: string | null;
  conversation_id: string | null;
  message_index: number;
  message_id: string | null;
  create_time: string | null;
  sender: string | null;
  sender_name: string | null;
  role: string | null;
  content: string | null;
  refer_list: string[] | null;
  group_id: string | null;
  group_name: string | null;
  source_url: string | null;
}

export interface NormalizedIngestionMessage extends EmosSingleMessage {
  item_key: string;
  content_hash: string;
  platform: string;
  conversation_id: string;
  message_index: number;
}

export interface LedgerBatchItem {
  action: 'ingest' | 'update' | 'skip';
  reason: string;
  shouldIngest: boolean;
  shouldAdvanceCursor: boolean;
  message: NormalizedIngestionMessage;
}
