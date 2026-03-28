import type { DMChannel, PartialDMChannel, PartialGroupDMChannel, TextBasedChannel } from "discord.js";

import type { AgentKind } from "../config.js";

export type ChannelMode = "direct" | "orchestra" | "default";

export interface ChannelPolicyConfig {
  directCategoryName?: string;
  orchestraCategoryName?: string;
  orchestraDefaultAgent: AgentKind;
}

export interface ResolvedChannelPolicy {
  mode: ChannelMode;
  forcedAgent?: AgentKind;
  defaultAgent: AgentKind;
}

function normalizeName(value: string | null | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function readParentCategoryName(channel: TextBasedChannel): string | undefined {
  if (!("parent" in channel)) {
    return undefined;
  }

  const parent = channel.parent;
  if (!parent || parent.type !== 4) {
    return undefined;
  }

  return normalizeName(parent.name);
}

function agentFromChannelName(name: string): AgentKind | undefined {
  const normalized = normalizeName(name);
  if (normalized === "claude-code" || normalized === "claude") {
    return "claude";
  }
  if (normalized === "codex") {
    return "codex";
  }
  if (normalized === "gemini") {
    return "gemini";
  }

  return undefined;
}

export function resolveChannelPolicy(
  channel: TextBasedChannel | DMChannel | PartialDMChannel | PartialGroupDMChannel,
  config: ChannelPolicyConfig,
  globalDefaultAgent: AgentKind
): ResolvedChannelPolicy {
  const directCategoryName = normalizeName(config.directCategoryName);
  const orchestraCategoryName = normalizeName(config.orchestraCategoryName);
  const parentCategoryName = readParentCategoryName(channel);

  if (parentCategoryName && parentCategoryName === orchestraCategoryName) {
    return {
      mode: "orchestra",
      defaultAgent: config.orchestraDefaultAgent
    };
  }

  if (parentCategoryName && parentCategoryName === directCategoryName) {
    const forcedAgent =
      "name" in channel && typeof channel.name === "string"
        ? agentFromChannelName(channel.name)
        : undefined;
    return forcedAgent
      ? {
          mode: "direct",
          forcedAgent,
          defaultAgent: forcedAgent
        }
      : {
          mode: "direct",
          defaultAgent: globalDefaultAgent
        };
  }

  return {
    mode: "default",
    defaultAgent: globalDefaultAgent
  };
}
