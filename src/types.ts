import type { AgentKind } from "./config.js";

export interface ChannelScope {
  channelId: string;
  threadId?: string;
}

export interface AgentSession {
  id: string;
  agent: AgentKind;
  scope: ChannelScope;
  externalSessionId?: string;
}

export interface TaskRecord {
  id: string;
  parentTaskId?: string;
  agent: AgentKind;
  scope: ChannelScope;
  prompt: string;
  status: "queued" | "running" | "completed" | "failed";
}

export interface DelegationRequest {
  fromTaskId: string;
  toAgent: AgentKind;
  prompt: string;
  scope: ChannelScope;
}

export interface DelegationInstruction {
  toAgent: AgentKind;
  prompt: string;
}

export interface FileArtifactInstruction {
  relativePath: string;
  content: string;
}

export interface ResolvedArtifact {
  absolutePath: string;
  relativePath: string;
}

export interface SharedMemoryEntry {
  key: string;
  value: string;
  agent: AgentKind;
}

export interface MemoryWriteInstruction {
  key: string;
  value: string;
}

export interface AgentRunResult {
  summary: string;
  rawOutput?: string;
  externalSessionId?: string;
  artifacts?: ResolvedArtifact[];
  fileWrites?: FileArtifactInstruction[];
  delegations?: DelegationInstruction[];
  memoryWrites?: MemoryWriteInstruction[];
}

export interface CreateTaskInput {
  parentTaskId?: string;
  agent: AgentKind;
  scope: ChannelScope;
  prompt: string;
}

export type TaskEventType =
  | "task_started"
  | "task_completed"
  | "task_failed"
  | "delegation_requested"
  | "delegation_completed"
  | "delegation_skipped"
  | "artifacts_created";

export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  parentTaskId?: string;
  agent: AgentKind;
  scope: ChannelScope;
  message: string;
  artifacts?: ResolvedArtifact[];
  details?: string;
}
