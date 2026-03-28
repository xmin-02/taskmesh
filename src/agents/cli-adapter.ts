import { spawn } from "node:child_process";

import type { AgentCliConfig, AgentKind } from "../config.js";
import type { AgentAdapter, AgentTooling } from "./adapter.js";
import type {
  AgentRunResult,
  AgentSession,
  DelegationInstruction,
  FileArtifactInstruction,
  TaskRecord
} from "../types.js";

const DELEGATION_PREFIX = "TASKMESH_DELEGATE";
const FILE_PREFIX = "TASKMESH_WRITE_FILE";
const FILE_CONTENT_START = "<<<TASKMESH_CONTENT";
const FILE_CONTENT_END = "TASKMESH_END_CONTENT";

function buildPrompt(task: TaskRecord, session: AgentSession): string {
  return [
    `Agent: ${task.agent}`,
    `Task ID: ${task.id}`,
    `Channel ID: ${session.scope.channelId}`,
    session.scope.threadId ? `Thread ID: ${session.scope.threadId}` : undefined,
    "Delegation Protocol: emit lines formatted as `TASKMESH_DELEGATE <agent> :: <prompt>` when you want Taskmesh to create a child task.",
    "File Protocol: emit `TASKMESH_WRITE_FILE <relative-path>` followed by `<<<TASKMESH_CONTENT`, file body, and `TASKMESH_END_CONTENT` when you want Taskmesh to save and upload a file.",
    "",
    task.prompt
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

function parseDelegations(output: string): DelegationInstruction[] {
  const delegations: DelegationInstruction[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(DELEGATION_PREFIX)) {
      continue;
    }

    const match = trimmed.match(/^TASKMESH_DELEGATE\s+(claude|codex|gemini)\s+::\s+([\s\S]+)$/i);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    delegations.push({
      toAgent: match[1].toLowerCase() as AgentKind,
      prompt: match[2].trim()
    });
  }

  return delegations;
}

function parseFileWrites(output: string): FileArtifactInstruction[] {
  const instructions: FileArtifactInstruction[] = [];
  const lines = output.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index]?.trim() ?? "";
    if (!currentLine.startsWith(FILE_PREFIX)) {
      continue;
    }

    const relativePath = currentLine.slice(FILE_PREFIX.length).trim();
    const startLine = lines[index + 1]?.trim();
    if (!relativePath || startLine !== FILE_CONTENT_START) {
      continue;
    }

    const contentLines: string[] = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor]?.trim() !== FILE_CONTENT_END) {
      contentLines.push(lines[cursor] ?? "");
      cursor += 1;
    }

    if (cursor >= lines.length) {
      continue;
    }

    instructions.push({
      relativePath,
      content: contentLines.join("\n").replace(/\s+$/u, "")
    });

    index = cursor;
  }

  return instructions;
}

function stripProtocolLines(output: string): string {
  const lines = output.split("\n");
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]?.trim() ?? "";

    if (trimmed.startsWith(DELEGATION_PREFIX)) {
      continue;
    }

    if (trimmed.startsWith(FILE_PREFIX)) {
      index += 1;
      while (index < lines.length && lines[index]?.trim() !== FILE_CONTENT_END) {
        index += 1;
      }
      continue;
    }

    kept.push(lines[index] ?? "");
  }

  return kept.join("\n").trim();
}

export class CliAgentAdapter implements AgentAdapter {
  constructor(
    public readonly kind: AgentKind,
    private readonly config: AgentCliConfig
  ) {}

  async run(task: TaskRecord, session: AgentSession, _tools: AgentTooling): Promise<AgentRunResult> {
    const prompt = buildPrompt(task, session);

    return new Promise<AgentRunResult>((resolve, reject) => {
      const child = spawn(this.config.command, this.config.args, {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`[${this.kind}] command failed with code ${code}: ${stderr.trim()}`));
          return;
        }

        const trimmedOutput = stdout.trim();
        const cleanOutput = stripProtocolLines(trimmedOutput);

        resolve({
          summary: cleanOutput || `[${this.kind}] completed task ${task.id}`,
          rawOutput: trimmedOutput,
          artifacts: [],
          fileWrites: parseFileWrites(trimmedOutput),
          delegations: parseDelegations(trimmedOutput)
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
