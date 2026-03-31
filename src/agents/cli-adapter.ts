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
  MemoryWriteInstruction,
  SharedMemoryEntry,
  TaskRecord
} from "../types.js";

const DELEGATION_PREFIX = "TASKMESH_DELEGATE";
const FILE_PREFIX = "TASKMESH_WRITE_FILE";
const MEMORY_PREFIX = "TASKMESH_MEMORY_SET";

interface StreamJsonToolUse {
  name: string;
  input: Record<string, unknown>;
}

function formatToolUseProgress(tool: StreamJsonToolUse): string {
  const name = tool.name;
  const input = tool.input;

  if (name === "Bash" && typeof input.command === "string") {
    const cmd = input.command.length > 80 ? input.command.slice(0, 80) + "..." : input.command;
    return `⏺ Bash(${cmd})`;
  }
  if (name === "Read" && typeof input.file_path === "string") {
    return `⏺ Read(${input.file_path})`;
  }
  if (name === "Edit" && typeof input.file_path === "string") {
    return `⏺ Edit(${input.file_path})`;
  }
  if (name === "Write" && typeof input.file_path === "string") {
    return `⏺ Write(${input.file_path})`;
  }
  if (name === "Glob" && typeof input.pattern === "string") {
    return `⏺ Glob(${input.pattern})`;
  }
  if (name === "Grep" && typeof input.pattern === "string") {
    return `⏺ Grep(${input.pattern})`;
  }

  return `⏺ ${name}`;
}

function parseStreamJsonLine(line: string): { type: string; toolUse?: StreamJsonToolUse; text?: string; result?: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;

  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const type = obj.type as string;

    if (type === "assistant") {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (!content?.length) return { type };

      for (const block of content) {
        if (block.type === "tool_use" && typeof block.name === "string") {
          return {
            type: "tool_use",
            toolUse: { name: block.name, input: (block.input as Record<string, unknown>) ?? {} }
          };
        }
        if (block.type === "text" && typeof block.text === "string") {
          return { type: "text", text: block.text };
        }
      }
    }

    if (type === "result") {
      return { type: "result", result: (obj.result as string) ?? "" };
    }

    return { type };
  } catch {
    return undefined;
  }
}
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

function buildPrompt(task: TaskRecord, session: AgentSession, sharedMemory: SharedMemoryEntry[]): string {
  const memorySection = sharedMemory.length
    ? [
        "[Shared Memory]",
        ...sharedMemory.map((entry) => `${entry.key}: ${entry.value}`),
        ""
      ]
    : [];

  return [
    ...memorySection,
    `Agent: ${task.agent}`,
    `Task ID: ${task.id}`,
    `Channel ID: ${session.scope.channelId}`,
    session.scope.threadId ? `Thread ID: ${session.scope.threadId}` : undefined,
    "Delegation Protocol: emit lines formatted as `TASKMESH_DELEGATE <agent> :: <prompt>` when you want Taskmesh to create a child task.",
    "File Protocol: emit `TASKMESH_WRITE_FILE <relative-path>` followed by `<<<TASKMESH_CONTENT`, file body, and `TASKMESH_END_CONTENT` when you want Taskmesh to save and upload a file.",
    "Memory Protocol: emit `TASKMESH_MEMORY_SET <key> :: <value>` to store information that other agents in this channel can access. Use this to share important context like user names, project goals, or task summaries.",
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

function parseMemoryWrites(output: string): MemoryWriteInstruction[] {
  const instructions: MemoryWriteInstruction[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MEMORY_PREFIX)) {
      continue;
    }

    const match = trimmed.match(/^TASKMESH_MEMORY_SET\s+(\S+)\s+::\s+([\s\S]+)$/);
    if (!match?.[1] || !match[2]) {
      continue;
    }

    instructions.push({
      key: match[1].trim(),
      value: match[2].trim()
    });
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

    if (trimmed.startsWith(MEMORY_PREFIX)) {
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

function replaceOutputFormat(args: string[]): string[] {
  const result: string[] = [];
  let hasVerbose = false;

  for (let i = 0; i < args.length; i += 1) {
    const current = args[i] ?? "";
    if (current === "--output-format" && i + 1 < args.length) {
      result.push("--output-format", "stream-json");
      i += 1;
      continue;
    }
    if (current === "--verbose") {
      hasVerbose = true;
    }
    result.push(current);
  }

  if (!hasVerbose) {
    result.unshift("--verbose");
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
        args: replaceOutputFormat([...baseArgs, "--resume", session.externalSessionId])
      };
    }

    return {
      command: config.command,
      args: replaceOutputFormat([...baseArgs, "--session-id", session.id])
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

  async run(task: TaskRecord, session: AgentSession, sessionPaths: SessionPaths, tools: AgentTooling, sharedMemory: SharedMemoryEntry[]): Promise<AgentRunResult> {
    const prompt = buildPrompt(task, session, sharedMemory);
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
      let lastProgressLength = 0;
      let streamJsonResult: string | undefined;
      const isClaudeStream = this.kind === "claude";
      let lineBuf = "";

      const progressInterval = !isClaudeStream && tools.onProgress
        ? setInterval(() => {
            const current = stripProtocolLines(stdout.trim());
            if (current.length > lastProgressLength) {
              lastProgressLength = current.length;
              tools.onProgress?.(current);
            }
          }, 3000)
        : undefined;

      child.stdout.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stdout += text;

        if (isClaudeStream && tools.onProgress) {
          lineBuf += text;
          const lines = lineBuf.split("\n");
          lineBuf = lines.pop() ?? "";

          for (const line of lines) {
            const parsed = parseStreamJsonLine(line);
            if (!parsed) continue;

            if (parsed.type === "tool_use" && parsed.toolUse) {
              tools.onProgress(formatToolUseProgress(parsed.toolUse));
            } else if (parsed.type === "result" && parsed.result) {
              streamJsonResult = parsed.result;
            }
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if (progressInterval) clearInterval(progressInterval);
        reject(error);
      });

      child.on("close", (code) => {
        if (progressInterval) clearInterval(progressInterval);
        if (code !== 0) {
          reject(new Error(`[${this.kind}] command failed with code ${code}: ${stderr.trim()}`));
          return;
        }

        const trimmedOutput = stdout.trim();
        const effectiveOutput = isClaudeStream && streamJsonResult ? streamJsonResult : trimmedOutput;
        const cleanOutput = stripProtocolLines(isClaudeStream ? effectiveOutput : trimmedOutput);
        const externalSessionId = deriveExternalSessionId(this.kind, session);

        resolve({
          summary: cleanOutput || `[${this.kind}] completed task ${task.id}`,
          rawOutput: trimmedOutput,
          ...(externalSessionId ? { externalSessionId } : {}),
          artifacts: [],
          fileWrites: parseFileWrites(effectiveOutput),
          delegations: parseDelegations(effectiveOutput),
          memoryWrites: parseMemoryWrites(effectiveOutput)
        });
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
