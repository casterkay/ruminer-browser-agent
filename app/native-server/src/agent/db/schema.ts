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
