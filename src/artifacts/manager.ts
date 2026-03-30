import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

import type { AgentKind } from "../config.js";
import type { SessionWorkspaceManager } from "../sessions/workspace-manager.js";
import type { ChannelScope, FileArtifactInstruction, ResolvedArtifact } from "../types.js";

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sanitizeRelativePath(value: string): string {
  const normalized = normalize(value).replace(/^(\.\.(\/|\\|$))+/, "");
  return normalized.replace(/^[/\\]+/, "");
}

export class ArtifactManager {
  constructor(private readonly workspaceManager: SessionWorkspaceManager) {}

  writeArtifacts(
    agent: AgentKind,
    scope: ChannelScope,
    taskId: string,
    instructions: FileArtifactInstruction[]
  ): ResolvedArtifact[] {
    const sessionPaths = this.workspaceManager.ensureSession(scope);
    const baseDir = join(
      sessionPaths.artifactsDir,
      sanitizeSegment(agent),
      sanitizeSegment(taskId)
    );

    mkdirSync(baseDir, { recursive: true });

    return instructions.map((instruction) => {
      const safeRelativePath = sanitizeRelativePath(instruction.relativePath);
      const absolutePath = join(baseDir, safeRelativePath);

      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, instruction.content, "utf8");

      return {
        absolutePath,
        relativePath: safeRelativePath
      };
    });
  }
}
