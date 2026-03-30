import type { AgentAdapter } from "./adapter.js";
import { CliAgentAdapter } from "./cli-adapter.js";
import { StubAgentAdapter } from "./stub-adapter.js";
import type { AgentKind, AppConfig } from "../config.js";

export function createAgentAdapters(config: AppConfig): Map<AgentKind, AgentAdapter> {
  const adapters = new Map<AgentKind, AgentAdapter>();

  for (const agent of config.enabledAgents) {
    const cliConfig = config.agentCommands[agent];
    adapters.set(
      agent,
      cliConfig
        ? new CliAgentAdapter(
            agent,
            cliConfig,
            config.executionMode,
            config.dockerBinary,
            config.dockerProviders[agent]
          )
        : new StubAgentAdapter(agent)
    );
  }

  return adapters;
}
