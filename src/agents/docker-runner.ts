import { spawn } from "node:child_process";

import type { AgentCliConfig, AgentKind, DockerProviderConfig } from "../config.js";
import type { SessionPaths } from "../sessions/workspace-manager.js";

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

  for (const mount of config.provider.mounts) {
    args.push("-v", mount);
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
