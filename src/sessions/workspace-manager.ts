import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ChannelScope } from "../types.js";

export interface SessionPaths {
  sessionId: string;
  sessionDir: string;
  workspaceDir: string;
  artifactsDir: string;
  metaPath: string;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class SessionWorkspaceManager {
  constructor(private readonly rootPath: string) {}

  getSessionPaths(scope: ChannelScope): SessionPaths {
    const sessionId = scope.threadId ?? scope.channelId;
    const sessionDir = resolve(this.rootPath, sanitizeSegment(sessionId));
    return {
      sessionId,
      sessionDir,
      workspaceDir: join(sessionDir, "workspace"),
      artifactsDir: join(sessionDir, "artifacts"),
      metaPath: join(sessionDir, "meta.json")
    };
  }

  ensureSession(scope: ChannelScope): SessionPaths {
    const paths = this.getSessionPaths(scope);
    mkdirSync(paths.workspaceDir, { recursive: true });
    mkdirSync(paths.artifactsDir, { recursive: true });

    if (!existsSync(paths.metaPath)) {
      writeFileSync(
        paths.metaPath,
        JSON.stringify(
          {
            channelId: scope.channelId,
            threadId: scope.threadId ?? null
          },
          null,
          2
        ),
        "utf8"
      );
    }

    return paths;
  }
}
