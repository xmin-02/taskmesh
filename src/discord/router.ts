import type { AgentKind } from "../config.js";

export interface RoutedCommand {
  agent: AgentKind;
  prompt: string;
  explicitTarget: boolean;
}

const mentionPrefixes: Record<string, AgentKind> = {
  "@claude": "claude",
  "@codex": "codex",
  "@gemini": "gemini"
};

export function routeDiscordContent(content: string, defaultAgent: AgentKind): RoutedCommand {
  const trimmed = content.trim();

  for (const [prefix, agent] of Object.entries(mentionPrefixes)) {
    if (trimmed.startsWith(prefix)) {
      return {
        agent,
        prompt: trimmed.slice(prefix.length).trim(),
        explicitTarget: true
      };
    }
  }

  for (const agent of ["claude", "codex", "gemini"] as const) {
    const slashPrefix = `/${agent}`;
    const colonPrefix = `${agent}:`;

    if (trimmed.startsWith(slashPrefix)) {
      return {
        agent,
        prompt: trimmed.slice(slashPrefix.length).trim(),
        explicitTarget: true
      };
    }

    if (trimmed.toLowerCase().startsWith(colonPrefix)) {
      return {
        agent,
        prompt: trimmed.slice(colonPrefix.length).trim(),
        explicitTarget: true
      };
    }
  }

  const askMatch = trimmed.match(/^\/ask\s+(claude|codex|gemini)\s+([\s\S]+)$/i);
  if (askMatch?.[1] && askMatch[2]) {
    return {
      agent: askMatch[1].toLowerCase() as AgentKind,
      prompt: askMatch[2].trim(),
      explicitTarget: true
    };
  }

  return {
    agent: defaultAgent,
    prompt: trimmed,
    explicitTarget: false
  };
}
