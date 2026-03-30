import { spawn } from "node:child_process";
import { basename } from "node:path";

import type { AgentCliConfig, AgentKind, DockerProviderConfig, ExecutionMode } from "../config.js";
import type { AgentAdapter, AgentTooling } from "./adapter.js";
import { spawnDockerAgent } from "./docker-runner.js";
import type { SessionPaths } from "../sessions/workspace-manager.js";
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

function withoutArgs(
  args: string[],
  disallowed: string[]
): string[] {
  const result: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) {
      continue;
    }

    if (disallowed.includes(current)) {
      index += 1;
      continue;
    }

    result.push(current);
  }

  return result;
}

function stripTrailingPromptDash(args: string[]): string[] {
  return args.at(-1) === "-" ? args.slice(0, -1) : args;
}

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

const PATH_FLAGS = new Set(["--add-dir", "--cd", "-C"]);

function rewritePathsForDocker(args: string[], hostProjectDir: string): string[] {
  const result: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i] ?? "";
    result.push(current);

    if (PATH_FLAGS.has(current) && i + 1 < args.length) {
      const nextArg = args[i + 1] ?? "";
      i += 1;
      result.push(
        nextArg === hostProjectDir || nextArg.startsWith(hostProjectDir + "/")
          ? "/workspace" + nextArg.slice(hostProjectDir.length)
          : nextArg
      );
    }
  }

  return result;
}

function buildInvocation(
  kind: AgentKind,
  config: AgentCliConfig,
  session: AgentSession
): AgentCliConfig {
  if (kind === "claude") {
    const baseArgs = withoutArgs(config.args, ["--session-id", "--resume"]);
    if (session.externalSessionId) {
      return {
        command: config.command,
        args: [...baseArgs, "--resume", session.externalSessionId]
      };
    }

    return {
      command: config.command,
      args: [...baseArgs, "--session-id", session.id]
    };
  }

  if (kind === "codex") {
    const baseArgs = stripTrailingPromptDash(config.args);
    if (session.externalSessionId) {
      const execArgs = withoutArgs(baseArgs.slice(1), ["--cd", "-C", "--add-dir", "--sandbox"]);
      return {
        command: config.command,
        args: ["exec", "resume", "--last", ...execArgs, "-"]
      };
    }

    return {
      command: config.command,
      args: config.args
    };
  }

  if (kind === "gemini" && session.externalSessionId) {
    return {
      command: config.command,
      args: ["--resume", session.externalSessionId, ...config.args]
    };
  }

  return config;
}

function deriveExternalSessionId(kind: AgentKind, session: AgentSession): string | undefined {
  if (kind === "claude") {
    return session.externalSessionId ?? session.id;
  }

  if (kind === "codex" || kind === "gemini") {
    return session.externalSessionId ?? "latest";
  }

  return undefined;
}

export class CliAgentAdapter implements AgentAdapter {
  constructor(
    public readonly kind: AgentKind,
    private readonly config: AgentCliConfig,
    private readonly executionMode: ExecutionMode,
    private readonly dockerBinary: string,
    private readonly dockerProvider: DockerProviderConfig | undefined,
    private readonly hostProjectDir: string
  ) {}

  async run(task: TaskRecord, session: AgentSession, sessionPaths: SessionPaths, _tools: AgentTooling): Promise<AgentRunResult> {
    const prompt = buildPrompt(task, session);
    const invocation = buildInvocation(this.kind, this.config, session);
    const finalInvocation =
      this.executionMode === "docker"
        ? {
            command: basename(invocation.command),
            args: rewritePathsForDocker(invocation.args, this.hostProjectDir)
          }
        : invocation;

    return new Promise<AgentRunResult>((resolve, reject) => {
      const child =
        this.executionMode === "docker" && this.dockerProvider
          ? spawnDockerAgent({
              dockerBinary: this.dockerBinary,
              provider: this.dockerProvider,
              cli: finalInvocation,
              session: sessionPaths,
              agent: this.kind
            })
          : spawn(finalInvocation.command, finalInvocation.args, {
              cwd: sessionPaths.workspaceDir,
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
        const externalSessionId = deriveExternalSessionId(this.kind, session);

        resolve({
          summary: cleanOutput || `[${this.kind}] completed task ${task.id}`,
          rawOutput: trimmedOutput,
          ...(externalSessionId ? { externalSessionId } : {}),
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
