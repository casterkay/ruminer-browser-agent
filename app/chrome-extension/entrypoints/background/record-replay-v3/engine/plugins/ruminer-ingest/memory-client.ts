export {
  getMemoryStatus,
  memoryReplaceConversation,
  memoryUpsertMessage,
  getEmosRequestContext as getMemoryRequestContext,
  emosDeleteMemory as memoryDelete,
  emosGetMemories as memoryRead,
  emosSearchMemories as memorySearch,
} from './emos-client';

export type {
  EmosDeleteFilters as MemoryDeleteFilters,
  EmosGetMemoriesRequest as MemoryReadRequest,
  EmosSearchRequest as MemorySearchRequest,
  EmosSearchResponse as MemorySearchResponse,
  MemoryConversationIdentity,
  MemoryRequestContext,
  MemorySingleMessage,
  MemoryStatus,
} from './emos-client';
