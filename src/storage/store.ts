import type { AgentKind } from "../config.js";
import type { AgentSession, ChannelScope, CreateTaskInput, SharedMemoryEntry, TaskRecord } from "../types.js";

export interface TaskStore {
  getOrCreateSession(agent: AgentKind, scope: ChannelScope): Promise<AgentSession>;
  updateSessionExternalId(sessionId: string, externalSessionId: string): Promise<void>;
  createTask(task: CreateTaskInput): Promise<TaskRecord>;
  updateTaskStatus(taskId: string, status: TaskRecord["status"]): Promise<void>;
  appendEvent(taskId: string, message: string): Promise<void>;
  listEvents(taskId: string): Promise<string[]>;
  getSharedMemory(scope: ChannelScope): Promise<SharedMemoryEntry[]>;
  setSharedMemory(scope: ChannelScope, agent: AgentKind, key: string, value: string): Promise<void>;
}
