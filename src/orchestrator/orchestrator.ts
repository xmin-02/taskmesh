import type { AgentKind } from "../config.js";
import type { AgentAdapter } from "../agents/adapter.js";
import { ArtifactManager } from "../artifacts/manager.js";
import { SessionWorkspaceManager } from "../sessions/workspace-manager.js";
import type { TaskStore } from "../storage/store.js";
import type { AgentRunResult, ChannelScope, DelegationRequest, TaskEvent } from "../types.js";

const MAX_DELEGATION_DEPTH = 4;

export class Orchestrator {
  constructor(
    private readonly store: TaskStore,
    private readonly adapters: Map<AgentKind, AgentAdapter>,
    private readonly artifactManager: ArtifactManager,
    private readonly workspaceManager: SessionWorkspaceManager,
    private readonly onEvent?: (event: TaskEvent) => Promise<void> | void
  ) {}

  private async emit(event: TaskEvent): Promise<void> {
    await this.onEvent?.(event);
  }

  async startTask(
    agent: AgentKind,
    prompt: string,
    scope: ChannelScope,
    parentTaskId?: string,
    depth = 0
  ): Promise<AgentRunResult> {
    const adapter = this.adapters.get(agent);
    if (!adapter) {
      throw new Error(`No adapter registered for ${agent}`);
    }

    const session = await this.store.getOrCreateSession(agent, scope);
    const sessionPaths = this.workspaceManager.ensureSession(scope);
    const taskInput = {
      agent,
      scope,
      prompt
    };

    const task = await this.store.createTask(
      parentTaskId ? { ...taskInput, parentTaskId } : taskInput
    );

    await this.store.updateTaskStatus(task.id, "running");
    await this.store.appendEvent(task.id, `Task started for ${agent}`);
    await this.emit({
      type: "task_started",
      taskId: task.id,
      ...(parentTaskId ? { parentTaskId } : {}),
      agent,
      scope,
      message: `Task started for ${agent}`,
      details: prompt
    });

    try {
      const sharedMemory = await this.store.getSharedMemory(scope);
      const result = await adapter.run(task, session, sessionPaths, {
        delegate: async (request: DelegationRequest) =>
          this.startTask(request.toAgent, request.prompt, request.scope, request.fromTaskId, depth + 1)
      }, sharedMemory);

      if (result.externalSessionId && result.externalSessionId !== session.externalSessionId) {
        await this.store.updateSessionExternalId(session.id, result.externalSessionId);
      }

      const writtenArtifacts =
        result.fileWrites?.length
          ? this.artifactManager.writeArtifacts(agent, scope, task.id, result.fileWrites)
          : [];

      if (result.memoryWrites?.length) {
        for (const entry of result.memoryWrites) {
          await this.store.setSharedMemory(scope, agent, entry.key, entry.value);
        }
      }

      if (writtenArtifacts.length) {
        await this.emit({
          type: "artifacts_created",
          taskId: task.id,
          ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
          agent,
          scope,
          message: `파일 ${writtenArtifacts.length}개를 생성했습니다.`,
          artifacts: writtenArtifacts
        });
      }

      const delegationSummaries: string[] = [];
      if (result.delegations?.length) {
        if (depth >= MAX_DELEGATION_DEPTH) {
          await this.store.appendEvent(task.id, "Delegation skipped: max depth reached");
          await this.emit({
            type: "delegation_skipped",
            taskId: task.id,
            ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
            agent,
            scope,
            message: "Delegation skipped: max depth reached"
          });
        } else {
          const childResults = await Promise.all(
            result.delegations.map(async (delegation) => {
              const delegationMessage = `Delegating to ${delegation.toAgent}: ${delegation.prompt}`;
              await this.store.appendEvent(task.id, delegationMessage);
              await this.emit({
                type: "delegation_requested",
                taskId: task.id,
                ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
                agent,
                scope,
                message: delegationMessage
              });

              const childResult = await this.startTask(
                delegation.toAgent,
                delegation.prompt,
                scope,
                task.id,
                depth + 1
              );

              const completionMessage = `Delegation completed from ${delegation.toAgent}: ${childResult.summary}`;
              await this.store.appendEvent(task.id, completionMessage);
              await this.emit({
                type: "delegation_completed",
                taskId: task.id,
                ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
                agent,
                scope,
                message: completionMessage
              });

              return `[${delegation.toAgent}] ${childResult.summary}`;
            })
          );

          delegationSummaries.push(...childResults);
        }
      }

      await this.store.appendEvent(task.id, `Task completed for ${agent}`);
      await this.store.updateTaskStatus(task.id, "completed");
      await this.emit({
        type: "task_completed",
        taskId: task.id,
        ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
        agent,
        scope,
        message: `Task completed for ${agent}`,
        details: result.summary
      });
      return delegationSummaries.length
        ? {
            ...result,
            summary: `${result.summary}\n\nDelegation Results:\n${delegationSummaries.join("\n")}`,
            artifacts: writtenArtifacts
          }
        : {
            ...result,
            artifacts: writtenArtifacts
          };
    } catch (error) {
      await this.store.appendEvent(task.id, `Task failed for ${agent}: ${String(error)}`);
      await this.store.updateTaskStatus(task.id, "failed");
      await this.emit({
        type: "task_failed",
        taskId: task.id,
        ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
        agent,
        scope,
        message: `Task failed for ${agent}: ${String(error)}`,
        details: String(error)
      });
      throw error;
    }
  }
}
