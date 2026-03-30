export type AgentKind = "claude" | "codex" | "gemini";
export type StorageDriver = "memory" | "sqlite";
export type ExecutionMode = "host" | "docker";
export type CloudflareTunnelMode = "trycloudflare" | "named";

export interface AgentCliConfig {
  command: string;
  args: string[];
}

export interface DockerProviderConfig {
  image: string;
  mounts: string[];
  envPassthrough: string[];
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
  settingChannelName: string;
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
  sessionRoot: string;
  executionMode: ExecutionMode;
  dockerBinary: string;
  settingsPort: number;
  settingsTokenTtlSeconds: number;
  settingsEnableTunnel: boolean;
  cloudflaredBinary: string;
  cloudflareTunnelMode: CloudflareTunnelMode;
  cloudflareTunnelToken?: string;
  cloudflareTunnelPublicUrl?: string;
  agentCommands: Partial<Record<AgentKind, AgentCliConfig>>;
  dockerProviders: Partial<Record<AgentKind, DockerProviderConfig>>;
  hostProjectDir: string;
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

function readExecutionMode(name: string, defaultValue: ExecutionMode): ExecutionMode {
  const value = process.env[name];
  if (value === "host" || value === "docker") {
    return value;
  }

  return defaultValue;
}

function readTunnelMode(name: string, defaultValue: CloudflareTunnelMode): CloudflareTunnelMode {
  const value = process.env[name];
  if (value === "trycloudflare" || value === "named") {
    return value;
  }

  return defaultValue;
}

function readInteger(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
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

function readList(name: string, separator = "|"): string[] {
  const value = process.env[name]?.trim();
  if (!value) {
    return [];
  }

  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readDockerProviderConfig(prefix: string): DockerProviderConfig | undefined {
  const image = process.env[`TASKMESH_DOCKER_${prefix}_IMAGE`]?.trim();
  if (!image) {
    return undefined;
  }

  return {
    image,
    mounts: readList(`TASKMESH_DOCKER_${prefix}_MOUNTS`),
    envPassthrough: readList(`TASKMESH_DOCKER_${prefix}_ENV`, ",")
  };
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
    settingChannelName: process.env.DISCORD_SETTING_CHANNEL_NAME?.trim() || "setting",
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
    sessionRoot: process.env.TASKMESH_SESSION_ROOT?.trim() || "./runtime/sessions",
    executionMode: readExecutionMode("TASKMESH_EXECUTION_MODE", "host"),
    dockerBinary: process.env.TASKMESH_DOCKER_BINARY?.trim() || "docker",
    settingsPort: readInteger("TASKMESH_SETTINGS_PORT", 4319),
    settingsTokenTtlSeconds: readInteger("TASKMESH_SETTINGS_TOKEN_TTL_SECONDS", 600),
    settingsEnableTunnel: readBoolean("TASKMESH_SETTINGS_ENABLE_TUNNEL", true),
    cloudflaredBinary: process.env.TASKMESH_CLOUDFLARED_BINARY?.trim() || "cloudflared",
    cloudflareTunnelMode: readTunnelMode("TASKMESH_CLOUDFLARE_TUNNEL_MODE", "trycloudflare"),
    ...(process.env.TASKMESH_CLOUDFLARE_TUNNEL_TOKEN?.trim()
      ? { cloudflareTunnelToken: process.env.TASKMESH_CLOUDFLARE_TUNNEL_TOKEN.trim() }
      : {}),
    ...(process.env.TASKMESH_CLOUDFLARE_TUNNEL_PUBLIC_URL?.trim()
      ? { cloudflareTunnelPublicUrl: process.env.TASKMESH_CLOUDFLARE_TUNNEL_PUBLIC_URL.trim().replace(/\/+$/u, "") }
      : {}),
    agentCommands: {},
    dockerProviders: {},
    hostProjectDir: process.env.TASKMESH_HOST_PROJECT_DIR?.trim() || process.cwd()
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

  const claudeDocker = readDockerProviderConfig("CLAUDE");
  const codexDocker = readDockerProviderConfig("CODEX");
  const geminiDocker = readDockerProviderConfig("GEMINI");

  if (claudeDocker) {
    config.dockerProviders.claude = claudeDocker;
  }
  if (codexDocker) {
    config.dockerProviders.codex = codexDocker;
  }
  if (geminiDocker) {
    config.dockerProviders.gemini = geminiDocker;
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
