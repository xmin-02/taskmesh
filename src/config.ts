export type AgentKind = "claude" | "codex" | "gemini";
export type StorageDriver = "memory" | "sqlite";

export interface AgentCliConfig {
  command: string;
  args: string[];
}

export interface DiscordBotTokens {
  orchestrator: string;
  claude?: string;
  codex?: string;
  gemini?: string;
}

export interface AppConfig {
  discordBotToken: string;
  discordApplicationId: string;
  discordBots: DiscordBotTokens;
  discordGuildId?: string;
  directCategoryName?: string;
  orchestraCategoryName?: string;
  logCategoryName?: string;
  logChannelSuffix: string;
  rawLogChannelSuffix: string;
  autoCreateSessionLogs: boolean;
  defaultAgent: AgentKind;
  orchestraDefaultAgent: AgentKind;
  publishDelegationEvents: boolean;
  enabledAgents: AgentKind[];
  storageDriver: StorageDriver;
  databasePath: string;
  artifactsPath: string;
  agentCommands: Partial<Record<AgentKind, AgentCliConfig>>;
}

function readBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

function readAgent(name: string, defaultValue: AgentKind): AgentKind {
  const value = process.env[name];
  if (value === "claude" || value === "codex" || value === "gemini") {
    return value;
  }

  return defaultValue;
}

function readStorageDriver(name: string, defaultValue: StorageDriver): StorageDriver {
  const value = process.env[name];
  if (value === "memory" || value === "sqlite") {
    return value;
  }

  return defaultValue;
}

function readCliConfig(prefix: string): AgentCliConfig | undefined {
  const command = process.env[`${prefix}_COMMAND`]?.trim();
  if (!command) {
    return undefined;
  }

  const argsValue = process.env[`${prefix}_ARGS`]?.trim();
  const args = argsValue ? argsValue.split(",").map((value) => value.trim()).filter(Boolean) : [];
  return { command, args };
}

export function loadConfig(): AppConfig {
  const enabledAgents: AgentKind[] = [];

  if (readBoolean("CLAUDE_ENABLED", true)) {
    enabledAgents.push("claude");
  }
  if (readBoolean("CODEX_ENABLED", true)) {
    enabledAgents.push("codex");
  }
  if (readBoolean("GEMINI_ENABLED", true)) {
    enabledAgents.push("gemini");
  }

  const discordBotToken = process.env.DISCORD_BOT_TOKEN;
  const discordApplicationId = process.env.DISCORD_APPLICATION_ID;
  const orchestratorBotToken = process.env.DISCORD_ORCHESTRATOR_BOT_TOKEN?.trim() || discordBotToken;
  const claudeBotToken = process.env.DISCORD_CLAUDE_BOT_TOKEN?.trim();
  const codexBotToken = process.env.DISCORD_CODEX_BOT_TOKEN?.trim();
  const geminiBotToken = process.env.DISCORD_GEMINI_BOT_TOKEN?.trim();

  if (!discordBotToken) {
    throw new Error("DISCORD_BOT_TOKEN is required");
  }
  if (!discordApplicationId) {
    throw new Error("DISCORD_APPLICATION_ID is required");
  }
  if (!orchestratorBotToken) {
    throw new Error("DISCORD_ORCHESTRATOR_BOT_TOKEN is required");
  }
  const config: AppConfig = {
    discordBotToken,
    discordApplicationId,
    discordBots: {
      orchestrator: orchestratorBotToken
    },
    logChannelSuffix: process.env.DISCORD_LOG_CHANNEL_SUFFIX?.trim() || "-log",
    rawLogChannelSuffix: process.env.DISCORD_RAW_LOG_CHANNEL_SUFFIX?.trim() || "-raw-log",
    autoCreateSessionLogs: readBoolean("DISCORD_AUTO_CREATE_SESSION_LOGS", true),
    defaultAgent: readAgent("TASKMESH_DEFAULT_AGENT", "claude"),
    orchestraDefaultAgent: readAgent("TASKMESH_ORCHESTRA_DEFAULT_AGENT", "claude"),
    publishDelegationEvents: readBoolean("TASKMESH_PUBLISH_DELEGATION_EVENTS", true),
    enabledAgents,
    storageDriver: readStorageDriver("TASKMESH_STORAGE_DRIVER", "sqlite"),
    databasePath: process.env.TASKMESH_DATABASE_PATH?.trim() || "./data/taskmesh.db",
    artifactsPath: process.env.TASKMESH_ARTIFACTS_PATH?.trim() || "./artifacts",
    agentCommands: {}
  };

  const claudeCli = readCliConfig("CLAUDE");
  const codexCli = readCliConfig("CODEX");
  const geminiCli = readCliConfig("GEMINI");

  if (claudeCli) {
    config.agentCommands.claude = claudeCli;
  }
  if (codexCli) {
    config.agentCommands.codex = codexCli;
  }
  if (geminiCli) {
    config.agentCommands.gemini = geminiCli;
  }

  if (claudeBotToken) {
    config.discordBots.claude = claudeBotToken;
  }
  if (codexBotToken) {
    config.discordBots.codex = codexBotToken;
  }
  if (geminiBotToken) {
    config.discordBots.gemini = geminiBotToken;
  }

  const discordGuildId = process.env.DISCORD_GUILD_ID;
  if (discordGuildId) {
    config.discordGuildId = discordGuildId;
  }

  const directCategoryName = process.env.DISCORD_DIRECT_CATEGORY_NAME?.trim();
  if (directCategoryName) {
    config.directCategoryName = directCategoryName;
  }

  const orchestraCategoryName = process.env.DISCORD_ORCHESTRA_CATEGORY_NAME?.trim();
  if (orchestraCategoryName) {
    config.orchestraCategoryName = orchestraCategoryName;
  }

  const logCategoryName = process.env.DISCORD_LOG_CATEGORY_NAME?.trim();
  if (logCategoryName) {
    config.logCategoryName = logCategoryName;
  }

  return config;
}
