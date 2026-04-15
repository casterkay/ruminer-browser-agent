/**
 * Storage path helpers for agent-related state.
 *
 * Provides unified path resolution for:
 * - SQLite database file
 * - Data directory
 * - Default workspace directory
 *
 * All paths can be overridden via environment variables.
 */
import { accessSync, constants as fsConstants, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_DATA_DIR = path.join(os.homedir(), 'ruminer');
const FALLBACK_DATA_DIR = path.join(os.tmpdir(), 'ruminer');
const MEMORY_STORE_DIR_NAME = 'memory';
const DEFAULT_MEMORY_STORE_ROOT = path.join(DEFAULT_DATA_DIR, MEMORY_STORE_DIR_NAME);
const MEMORY_CONVERSATIONS_DIR_NAME = 'conversations';
const MEMORY_QMD_INDEX_FILE_NAME = 'index.sqlite';
const MEMORY_TRASH_DIR_NAME = '_trash';
const FALLBACK_MEMORY_STORE_ROOT = path.join(FALLBACK_DATA_DIR, MEMORY_STORE_DIR_NAME);

function resolveWritableDir(preferredPath: string, fallbackPath: string): string {
  for (const candidate of [preferredPath, fallbackPath]) {
    try {
      mkdirSync(candidate, { recursive: true });
      accessSync(candidate, fsConstants.W_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }

  return fallbackPath;
}

/**
 * Resolve base data directory for agent state.
 *
 * Environment:
 * - CHROME_MCP_AGENT_DATA_DIR: overrides the default base directory.
 */
export function getAgentDataDir(): string {
  const raw = process.env.CHROME_MCP_AGENT_DATA_DIR;
  if (raw && raw.trim()) {
    return path.resolve(raw.trim());
  }
  return resolveWritableDir(DEFAULT_DATA_DIR, FALLBACK_DATA_DIR);
}

/**
 * Resolve database file path.
 *
 * Environment:
 * - CHROME_MCP_AGENT_DB_FILE: overrides the default database path.
 */
export function getDatabasePath(): string {
  const raw = process.env.CHROME_MCP_AGENT_DB_FILE;
  if (raw && raw.trim()) {
    return path.resolve(raw.trim());
  }
  return path.join(getAgentDataDir(), 'agent.db');
}

/**
 * Resolve the default local memory store root.
 */
export function getDefaultMemoryStoreRoot(): string {
  return resolveWritableDir(DEFAULT_MEMORY_STORE_ROOT, FALLBACK_MEMORY_STORE_ROOT);
}

/**
 * Normalize a configured memory store root.
 */
export function resolveMemoryStoreRoot(rootPath?: string): string {
  if (typeof rootPath === 'string' && rootPath.trim()) {
    return path.resolve(rootPath.trim());
  }
  return getDefaultMemoryStoreRoot();
}

/**
 * Resolve the conversations directory within a memory store root.
 */
export function getMemoryConversationsDir(rootPath = getDefaultMemoryStoreRoot()): string {
  return path.join(resolveMemoryStoreRoot(rootPath), MEMORY_CONVERSATIONS_DIR_NAME);
}

/**
 * Resolve the QMD SQLite index path within a memory store root.
 */
export function getMemoryQmdIndexPath(rootPath = getDefaultMemoryStoreRoot()): string {
  return path.join(resolveMemoryStoreRoot(rootPath), MEMORY_QMD_INDEX_FILE_NAME);
}

/**
 * Resolve the trash directory for soft-deleted memory documents.
 */
export function getMemoryTrashDir(rootPath = getDefaultMemoryStoreRoot()): string {
  return path.join(resolveMemoryStoreRoot(rootPath), MEMORY_TRASH_DIR_NAME);
}

/**
 * Get the default workspace directory for agent projects.
 * This is a subdirectory under the agent data directory.
 *
 * Cross-platform compatible:
 * - Mac/Linux: ~/ruminer/workspaces
 * - Windows: %USERPROFILE%\ruminer\workspaces
 */
export function getDefaultWorkspaceDir(): string {
  return path.join(getAgentDataDir(), 'workspaces');
}

/**
 * Generate a default project root path for a given project name.
 */
export function getDefaultProjectRoot(projectName: string): string {
  // Sanitize project name for use as directory name
  const safeName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return path.join(getDefaultWorkspaceDir(), safeName || 'default-project');
}
