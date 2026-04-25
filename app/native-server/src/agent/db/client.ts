/**
 * Database client singleton for Agent storage (SQLite).
 *
 * Uses Node's built-in `node:sqlite` (DatabaseSync) to avoid native addon binding issues
 * from packages like `better-sqlite3`.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { getAgentDataDir, getDatabasePath } from '../storage';

// ============================================================
// Types
// ============================================================

export interface AgentDb {
  exec: (sql: string) => void;
  run: (sql: string, params?: SQLInputValue[]) => void;
  get: <T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]) => T | undefined;
  all: <T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]) => T[];
}

// ============================================================
// Schema Initialization SQL
// ============================================================

const CREATE_TABLES_SQL = `
-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  preferred_cli TEXT,
  selected_model TEXT,
  active_claude_session_id TEXT,
  use_ccr TEXT,
  enable_chrome_mcp TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_active_at TEXT
);

CREATE INDEX IF NOT EXISTS projects_last_active_idx ON projects(last_active_at);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  engine_name TEXT NOT NULL,
  engine_session_id TEXT,
  name TEXT,
  model TEXT,
  permission_mode TEXT NOT NULL DEFAULT 'bypassPermissions',
  allow_dangerously_skip_permissions TEXT,
  system_prompt_config TEXT,
  options_config TEXT,
  management_info TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_project_id_idx ON sessions(project_id);
CREATE INDEX IF NOT EXISTS sessions_engine_name_idx ON sessions(engine_name);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  conversation_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL,
  metadata TEXT,
  cli_source TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_project_id_idx ON messages(project_id);
CREATE INDEX IF NOT EXISTS messages_session_id_idx ON messages(session_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at);
CREATE INDEX IF NOT EXISTS messages_request_id_idx ON messages(request_id);

-- OpenClaw Gateway settings (native-server owned)
CREATE TABLE IF NOT EXISTS openclaw_gateway_settings (
  id TEXT PRIMARY KEY,
  ws_url TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_ok_at TEXT,
  last_test_error TEXT
);

-- OpenClaw device identity (Ed25519 keys + derived deviceId)
CREATE TABLE IF NOT EXISTS openclaw_device_identity (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

-- EverMemOS settings (native-server owned)
-- Store secrets (API keys) here so they can survive extension reinstall.
CREATE TABLE IF NOT EXISTS emos_settings (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Generic memory backend settings (native-server owned)
CREATE TABLE IF NOT EXISTS memory_settings (
  id TEXT PRIMARY KEY,
  backend TEXT NOT NULL,
  local_root_path TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_documents (
  id TEXT PRIMARY KEY,
  backend TEXT NOT NULL,
  document_type TEXT NOT NULL,
  group_id TEXT,
  group_name TEXT,
  source_platform TEXT,
  conversation_id TEXT,
  title TEXT,
  source_url TEXT,
  file_path TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  metadata TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS memory_documents_file_path_idx ON memory_documents(file_path);
CREATE UNIQUE INDEX IF NOT EXISTS memory_documents_relative_path_idx ON memory_documents(relative_path);
CREATE INDEX IF NOT EXISTS memory_documents_group_id_idx ON memory_documents(group_id);
CREATE INDEX IF NOT EXISTS memory_documents_updated_at_idx ON memory_documents(updated_at);

CREATE TABLE IF NOT EXISTS memory_messages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES memory_documents(id) ON DELETE CASCADE,
  group_id TEXT,
  sender TEXT,
  sender_name TEXT,
  role TEXT,
  content TEXT NOT NULL,
  create_time TEXT NOT NULL,
  source_url TEXT,
  source_platform TEXT,
  conversation_id TEXT,
  refer_list TEXT,
  metadata TEXT,
  message_index INTEGER,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_messages_document_id_idx ON memory_messages(document_id);
CREATE INDEX IF NOT EXISTS memory_messages_group_id_idx ON memory_messages(group_id);
CREATE INDEX IF NOT EXISTS memory_messages_sender_idx ON memory_messages(sender);
CREATE INDEX IF NOT EXISTS memory_messages_create_time_idx ON memory_messages(create_time);

-- Anthropic settings for Claude Code (native-server owned)
-- Used to set env vars when spawning the claude CLI.
CREATE TABLE IF NOT EXISTS anthropic_settings (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Hermes API server settings (native-server owned)
CREATE TABLE IF NOT EXISTS hermes_settings (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  workspace_root TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  last_test_ok_at TEXT,
  last_test_error TEXT
);

-- UI/system settings (native-server owned)
CREATE TABLE IF NOT EXISTS ui_settings (
  id TEXT PRIMARY KEY,
  floating_icon_enabled TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// ============================================================
// Singleton State
// ============================================================

let sqliteInstance: DatabaseSync | null = null;
let dbInstance: AgentDb | null = null;

// ============================================================
// Migrations
// ============================================================

function columnExists(sqlite: DatabaseSync, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: unknown }>;
  return rows.some((row) => row.name === columnName);
}

function runMigrations(sqlite: DatabaseSync): void {
  // Migration 1: Add active_claude_session_id column to projects table
  if (!columnExists(sqlite, 'projects', 'active_claude_session_id')) {
    sqlite.exec('ALTER TABLE projects ADD COLUMN active_claude_session_id TEXT');
  }

  // Migration 2: Add use_ccr column to projects table
  if (!columnExists(sqlite, 'projects', 'use_ccr')) {
    sqlite.exec('ALTER TABLE projects ADD COLUMN use_ccr TEXT');
  }

  // Migration 3: Add enable_chrome_mcp column to projects table (default enabled)
  if (!columnExists(sqlite, 'projects', 'enable_chrome_mcp')) {
    sqlite.exec("ALTER TABLE projects ADD COLUMN enable_chrome_mcp TEXT NOT NULL DEFAULT '1'");
  }

  if (!columnExists(sqlite, 'emos_settings', 'base_url')) {
    // Default to the public EverMemOS API.
    sqlite.exec(
      "ALTER TABLE emos_settings ADD COLUMN base_url TEXT NOT NULL DEFAULT 'https://api.evermind.ai'",
    );
  }

  if (!columnExists(sqlite, 'memory_settings', 'backend')) {
    sqlite.exec(
      "ALTER TABLE memory_settings ADD COLUMN backend TEXT NOT NULL DEFAULT 'local_markdown_qmd'",
    );
  }

  if (!columnExists(sqlite, 'memory_settings', 'local_root_path')) {
    sqlite.exec("ALTER TABLE memory_settings ADD COLUMN local_root_path TEXT NOT NULL DEFAULT ''");
  }

  if (!columnExists(sqlite, 'memory_documents', 'relative_path')) {
    sqlite.exec("ALTER TABLE memory_documents ADD COLUMN relative_path TEXT NOT NULL DEFAULT ''");
  }

  if (!columnExists(sqlite, 'hermes_settings', 'last_test_ok_at')) {
    sqlite.exec('ALTER TABLE hermes_settings ADD COLUMN last_test_ok_at TEXT');
  }

  if (!columnExists(sqlite, 'hermes_settings', 'last_test_error')) {
    sqlite.exec('ALTER TABLE hermes_settings ADD COLUMN last_test_error TEXT');
  }

  if (!columnExists(sqlite, 'hermes_settings', 'workspace_root')) {
    sqlite.exec("ALTER TABLE hermes_settings ADD COLUMN workspace_root TEXT NOT NULL DEFAULT ''");
  }
}

function ensureDataDir(): void {
  const dataDir = getAgentDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function createWrapper(sqlite: DatabaseSync): AgentDb {
  const run = (sql: string, params: SQLInputValue[] = []): void => {
    sqlite.prepare(sql).run(...params);
  };

  const get = <T = Record<string, unknown>>(
    sql: string,
    params: SQLInputValue[] = [],
  ): T | undefined => {
    const result = sqlite.prepare(sql).get(...params) as T | undefined;
    return result;
  };

  const all = <T = Record<string, unknown>>(sql: string, params: SQLInputValue[] = []): T[] => {
    const result = sqlite.prepare(sql).all(...params) as T[];
    return result;
  };

  return {
    exec: (sql: string) => sqlite.exec(sql),
    run,
    get,
    all,
  };
}

// ============================================================
// Public API
// ============================================================

export function getDb(): AgentDb {
  if (dbInstance) {
    return dbInstance;
  }

  ensureDataDir();

  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  sqliteInstance = new DatabaseSync(dbPath);

  // Performance & safety pragmas
  sqliteInstance.exec('PRAGMA foreign_keys = ON;');
  sqliteInstance.exec('PRAGMA journal_mode = WAL;');

  // Initialize schema and run migrations
  sqliteInstance.exec(CREATE_TABLES_SQL);
  runMigrations(sqliteInstance);

  dbInstance = createWrapper(sqliteInstance);
  return dbInstance;
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
  }
  dbInstance = null;
}

export function isDbInitialized(): boolean {
  return dbInstance !== null;
}

/**
 * Execute raw SQL (for advanced use cases).
 */
export function execRawSql(sqlStr: string): void {
  if (!sqliteInstance) {
    getDb();
  }
  sqliteInstance!.exec(sqlStr);
}
