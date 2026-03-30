import type { AgentKind } from "../config.js";
import type { SessionPaths } from "../sessions/workspace-manager.js";
import type { AgentRunResult, AgentSession, DelegationRequest, TaskRecord } from "../types.js";

export interface AgentTooling {
  delegate(request: DelegationRequest): Promise<AgentRunResult>;
}

export interface AgentAdapter {
  readonly kind: AgentKind;
  run(task: TaskRecord, session: AgentSession, sessionPaths: SessionPaths, tools: AgentTooling): Promise<AgentRunResult>;
}
