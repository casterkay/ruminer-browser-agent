/**
 * Agent DB row types.
 *
 * The native server uses SQLite for persistence (projects/sessions/messages).
 * These interfaces represent the *selected* row shapes used by services.
 *
 * Column naming:
 * - SQLite columns are snake_case
 * - Services select with aliases to camelCase for ergonomics
 */

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  rootPath: string;
  preferredCli: string | null;
  selectedModel: string | null;
  activeClaudeSessionId: string | null;
  useCcr: string | null;
  enableChromeMcp: string; // '1' | '0'
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
}

export interface SessionRow {
  id: string;
  projectId: string;
  engineName: string;
  engineSessionId: string | null;
  name: string | null;
  model: string | null;
  permissionMode: string;
  allowDangerouslySkipPermissions: string | null;
  systemPromptConfig: string | null;
  optionsConfig: string | null;
  managementInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  projectId: string;
  sessionId: string;
  conversationId: string | null;
  role: string;
  content: string;
  messageType: string;
  metadata: string | null;
  cliSource: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface MemoryDocumentRow {
  id: string;
  backend: string;
  documentType: string;
  groupId: string | null;
  groupName: string | null;
  sourcePlatform: string | null;
  conversationId: string | null;
  title: string | null;
  sourceUrl: string | null;
  filePath: string;
  relativePath: string;
  contentHash: string;
  metadata: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MemoryMessageRow {
  id: string;
  documentId: string;
  groupId: string | null;
  sender: string | null;
  senderName: string | null;
  role: string | null;
  content: string;
  createTime: string;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  conversationId: string | null;
  referList: string | null;
  metadata: string | null;
  messageIndex: number | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
