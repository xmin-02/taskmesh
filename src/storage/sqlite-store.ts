import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { AgentKind } from "../config.js";
import type { AgentSession, ChannelScope, CreateTaskInput, SharedMemoryEntry, TaskRecord } from "../types.js";
import type { TaskStore } from "./store.js";

function scopeKey(scope: ChannelScope): { channelId: string; threadId: string | null } {
  return {
    channelId: scope.channelId,
    threadId: scope.threadId ?? null
  };
}

export class SqliteTaskStore implements TaskStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    const resolvedPath = resolve(databasePath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        agent TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        external_session_id TEXT,
        UNIQUE(agent, channel_id, thread_id)
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT,
        agent TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS shared_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        thread_id TEXT,
        agent TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, thread_id, key)
      );
    `);
  }

  async getOrCreateSession(agent: AgentKind, scope: ChannelScope): Promise<AgentSession> {
    const scoped = scopeKey(scope);
    const existing = this.database
      .prepare(
        `SELECT id, external_session_id
         FROM agent_sessions
         WHERE agent = ? AND channel_id = ? AND thread_id IS ?`
      )
      .get(agent, scoped.channelId, scoped.threadId) as { id: string; external_session_id: string | null } | undefined;

    if (existing) {
      return existing.external_session_id
        ? { id: existing.id, agent, scope, externalSessionId: existing.external_session_id }
        : { id: existing.id, agent, scope };
    }

    const id = randomUUID();
    this.database
      .prepare(
        `INSERT INTO agent_sessions (id, agent, channel_id, thread_id)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, agent, scoped.channelId, scoped.threadId);

    return { id, agent, scope };
  }

  async updateSessionExternalId(sessionId: string, externalSessionId: string): Promise<void> {
    this.database
      .prepare(`UPDATE agent_sessions SET external_session_id = ? WHERE id = ?`)
      .run(externalSessionId, sessionId);
  }

  async createTask(task: CreateTaskInput): Promise<TaskRecord> {
    const id = randomUUID();
    const scoped = scopeKey(task.scope);
    this.database
      .prepare(
        `INSERT INTO tasks (id, parent_task_id, agent, channel_id, thread_id, prompt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        task.parentTaskId ?? null,
        task.agent,
        scoped.channelId,
        scoped.threadId,
        task.prompt,
        "queued"
      );

    return task.parentTaskId
      ? { id, ...task, status: "queued" }
      : {
          id,
          agent: task.agent,
          scope: task.scope,
          prompt: task.prompt,
          status: "queued"
        };
  }

  async updateTaskStatus(taskId: string, status: TaskRecord["status"]): Promise<void> {
    this.database.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run(status, taskId);
  }

  async appendEvent(taskId: string, message: string): Promise<void> {
    this.database
      .prepare(`INSERT INTO task_events (task_id, message) VALUES (?, ?)`)
      .run(taskId, message);
  }

  async listEvents(taskId: string): Promise<string[]> {
    const rows = this.database
      .prepare(
        `SELECT message
         FROM task_events
         WHERE task_id = ?
         ORDER BY id ASC`
      )
      .all(taskId) as Array<{ message: string }>;

    return rows.map((row) => row.message);
  }

  async getSharedMemory(scope: ChannelScope): Promise<SharedMemoryEntry[]> {
    const scoped = scopeKey(scope);
    const rows = this.database
      .prepare(
        `SELECT key, value, agent FROM shared_memory
         WHERE channel_id = ? AND thread_id IS ?
         ORDER BY id ASC`
      )
      .all(scoped.channelId, scoped.threadId) as Array<{ key: string; value: string; agent: string }>;
    return rows.map((row) => ({ key: row.key, value: row.value, agent: row.agent as AgentKind }));
  }

  async setSharedMemory(scope: ChannelScope, agent: AgentKind, key: string, value: string): Promise<void> {
    const scoped = scopeKey(scope);
    this.database
      .prepare(
        `INSERT INTO shared_memory (channel_id, thread_id, agent, key, value)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(channel_id, thread_id, key)
         DO UPDATE SET value = excluded.value, agent = excluded.agent`
      )
      .run(scoped.channelId, scoped.threadId, agent, key, value);
  }
}
