import type { AgentAdapter, AgentTooling } from "./adapter.js";
import type { AgentRunResult, AgentSession, TaskRecord } from "../types.js";
import type { AgentKind } from "../config.js";

export class StubAgentAdapter implements AgentAdapter {
  constructor(public readonly kind: AgentKind) {}

  async run(task: TaskRecord, session: AgentSession, _tools: AgentTooling): Promise<AgentRunResult> {
    const fileMatch = task.prompt.match(/\[file:([^\]]+)\]([\s\S]*)$/i);
    if (fileMatch?.[1] && fileMatch[2]) {
      return {
        summary: `[${this.kind}] 파일을 생성했습니다.`,
        rawOutput: task.prompt,
        fileWrites: [
          {
            relativePath: fileMatch[1].trim(),
            content: fileMatch[2].trim()
          }
        ]
      };
    }

    const delegateMatch = task.prompt.match(/\[delegate:(claude|codex|gemini)\]([\s\S]*)$/i);
    if (delegateMatch?.[1] && delegateMatch[2]) {
      return {
        summary: `[${this.kind}] requested delegation from task ${task.id}`,
        rawOutput: task.prompt,
        delegations: [
          {
            toAgent: delegateMatch[1].toLowerCase() as AgentKind,
            prompt: delegateMatch[2].trim()
          }
        ]
      };
    }

    return {
      summary: `[${this.kind}] handled task ${task.id} in channel ${session.scope.channelId}`,
      rawOutput: task.prompt
    };
  }
}
