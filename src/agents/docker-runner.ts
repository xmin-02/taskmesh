import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { AgentCliConfig, AgentKind, DockerProviderConfig } from "../config.js";
import type { SessionPaths } from "../sessions/workspace-manager.js";

function expandTilde(path: string): string {
  return path.startsWith("~/") ? path.replace("~", homedir()) : path;
}

export interface DockerRunConfig {
  dockerBinary: string;
  provider: DockerProviderConfig;
  cli: AgentCliConfig;
  session: SessionPaths;
  agent: AgentKind;
}

export function spawnDockerAgent(config: DockerRunConfig) {
  const args = [
    "run",
    "--rm",
    "-i",
    "--workdir",
    "/workspace",
    "-v",
    `${config.session.workspaceDir}:/workspace`,
    "-v",
    `${config.session.artifactsDir}:/artifacts`
  ];

  const agentHomeDir = join(config.session.sessionDir, `.${config.agent}-home`);
  mkdirSync(agentHomeDir, { recursive: true });
  args.push("-v", `${agentHomeDir}:/home/taskmesh`);
  args.push("-e", "HOME=/home/taskmesh");

  args.push("--memory=4g", "--cpus=2");

  const shortId = config.session.sessionId.slice(0, 12);
  const runId = randomUUID().slice(0, 8);
  args.push("--name", `taskmesh-${config.agent}-${shortId}-${runId}`);

  for (const mount of config.provider.mounts) {
    const parts = mount.split(":");
    if (parts[0]) {
      parts[0] = expandTilde(parts[0]);
    }
    args.push("-v", parts.join(":"));
  }

  for (const envName of config.provider.envPassthrough) {
    const value = process.env[envName];
    if (value) {
      args.push("-e", `${envName}=${value}`);
    }
  }

  args.push(config.provider.image, config.cli.command, ...config.cli.args);

  return spawn(config.dockerBinary, args, {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });
}
