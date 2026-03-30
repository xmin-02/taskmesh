import { randomUUID } from "node:crypto";

import type { AgentKind } from "../config.js";
import type { AgentSession, ChannelScope, CreateTaskInput, TaskRecord } from "../types.js";
import type { TaskStore } from "./store.js";

function sameScope(left: ChannelScope, right: ChannelScope): boolean {
  return left.channelId === right.channelId && left.threadId === right.threadId;
}

export class InMemoryTaskStore implements TaskStore {
  private readonly sessions: AgentSession[] = [];
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly events = new Map<string, string[]>();

  async getOrCreateSession(agent: AgentKind, scope: ChannelScope): Promise<AgentSession> {
    const existing = this.sessions.find((session) => session.agent === agent && sameScope(session.scope, scope));
    if (existing) {
      return existing;
    }

    const created: AgentSession = {
      id: randomUUID(),
      agent,
      scope
    };

    this.sessions.push(created);
    return created;
  }

  async updateSessionExternalId(sessionId: string, externalSessionId: string): Promise<void> {
    const session = this.sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    session.externalSessionId = externalSessionId;
  }

  async createTask(task: CreateTaskInput): Promise<TaskRecord> {
    const createdBase = {
      ...task,
      id: randomUUID(),
      status: "queued" as const
    };

    const created: TaskRecord = task.parentTaskId
      ? createdBase
      : {
          id: createdBase.id,
          agent: createdBase.agent,
          scope: createdBase.scope,
          prompt: createdBase.prompt,
          status: createdBase.status
        };

    this.tasks.set(created.id, created);
    this.events.set(created.id, []);
    return created;
  }

  async updateTaskStatus(taskId: string, status: TaskRecord["status"]): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`);
    }

    task.status = status;
  }

  async appendEvent(taskId: string, message: string): Promise<void> {
    const list = this.events.get(taskId);
    if (!list) {
      throw new Error(`Unknown task: ${taskId}`);
    }

    list.push(message);
  }

  async listEvents(taskId: string): Promise<string[]> {
    return this.events.get(taskId) ?? [];
  }
}
