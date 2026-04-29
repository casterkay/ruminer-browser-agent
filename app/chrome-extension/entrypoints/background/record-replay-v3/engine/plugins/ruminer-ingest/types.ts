export interface ExtractListPayload {
  items: unknown[];
  nextCursor: string | null;
  done: boolean;
}
