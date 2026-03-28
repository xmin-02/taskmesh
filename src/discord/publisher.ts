import {
  Client,
  ChannelType,
  type GuildBasedChannel,
  GatewayIntentBits,
  Partials
} from "discord.js";

import type { AgentKind, AppConfig } from "../config.js";
import type { ChannelMode } from "./channel-policy.js";
import type { TaskEvent } from "../types.js";

type BotIdentity = "orchestrator" | AgentKind;

function createReceiverClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
  });
}

function createSenderClient(): Client {
  return new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel]
  });
}

async function sendToScope(client: Client, channelId: string, threadId: string | undefined, content: string): Promise<void> {
  const targetId = threadId ?? channelId;
  const channel = await client.channels.fetch(targetId);

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    throw new Error(`Channel ${targetId} is not text-capable`);
  }

  await channel.send(content);
}

async function sendFilesToScope(
  client: Client,
  channelId: string,
  threadId: string | undefined,
  content: string,
  filePaths: string[]
): Promise<void> {
  const targetId = threadId ?? channelId;
  const channel = await client.channels.fetch(targetId);

  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    throw new Error(`Channel ${targetId} is not text-capable`);
  }

  await channel.send({
    content,
    files: filePaths
  });
}

async function sendTypingToScope(client: Client, channelId: string, threadId: string | undefined): Promise<void> {
  const targetId = threadId ?? channelId;
  const channel = await client.channels.fetch(targetId);

  if (!channel || !channel.isTextBased() || !("sendTyping" in channel)) {
    throw new Error(`Channel ${targetId} does not support typing`);
  }

  await channel.sendTyping();
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function sessionBaseName(channel: { isThread?: () => boolean; parent?: { name?: string | null } | null; name?: string | null }): string | undefined {
  if (typeof channel.isThread === "function" && channel.isThread() && channel.parent?.name) {
    return channel.parent.name;
  }

  return channel.name ?? undefined;
}

export class DiscordPublisher {
  private readonly orchestratorClient: Client;
  private readonly agentClients: Partial<Record<AgentKind, Client>>;

  constructor(private readonly config: AppConfig) {
    this.orchestratorClient = createReceiverClient();
    this.agentClients = {};

    if (config.discordBots.claude) {
      this.agentClients.claude = createSenderClient();
    }
    if (config.discordBots.codex) {
      this.agentClients.codex = createSenderClient();
    }
    if (config.discordBots.gemini) {
      this.agentClients.gemini = createSenderClient();
    }
  }

  get receiverClient(): Client {
    return this.orchestratorClient;
  }

  private async ensureSessionLogChannels(channelId: string): Promise<void> {
    if (!this.config.autoCreateSessionLogs) {
      return;
    }

    const sourceChannel = await this.orchestratorClient.channels.fetch(channelId);
    if (!sourceChannel || !("guild" in sourceChannel)) {
      return;
    }

    const baseName = sessionBaseName(sourceChannel);
    if (!baseName) {
      return;
    }

    const guild = sourceChannel.guild;
    await guild.channels.fetch();

    const categoryName = `${baseName} log`;
    let category = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        normalizeName(channel.name) === normalizeName(categoryName)
    );

    if (!category) {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory
      });
    }

    const channelSpecs = [
      { name: "status", type: ChannelType.GuildText },
      { name: "delegate", type: ChannelType.GuildText },
      { name: "done", type: ChannelType.GuildText },
      { name: "fail", type: ChannelType.GuildText },
      { name: "files", type: ChannelType.GuildText },
      { name: "log", type: ChannelType.GuildText },
      { name: "raw-log", type: ChannelType.GuildText }
    ] as const;

    for (const spec of channelSpecs) {
      const existing = guild.channels.cache.find(
        (channel) =>
          channel.parentId === category.id &&
          normalizeName(channel.name) === normalizeName(spec.name)
      );

      if (!existing) {
        await guild.channels.create({
          name: spec.name,
          type: spec.type,
          parent: category.id
        });
      }
    }
  }

  async provisionSessionLogs(channelId: string): Promise<void> {
    await this.ensureSessionLogChannels(channelId);
  }

  private async resolveMirrorChannelId(channelId: string, suffix: string): Promise<string | undefined> {
    await this.ensureSessionLogChannels(channelId);
    const sourceChannel = await this.orchestratorClient.channels.fetch(channelId);
    if (!sourceChannel || !("guild" in sourceChannel) || !("name" in sourceChannel)) {
      return undefined;
    }

    const guild = sourceChannel.guild;
    await guild.channels.fetch();

    const sourceName = sessionBaseName(sourceChannel);
    if (!sourceName) {
      return undefined;
    }

    const dedicatedCategoryName = `${sourceName} log`;
    const shortExpectedName = suffix.replace(/^-/, "");
    const dedicatedCategory = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        normalizeName(channel.name) === normalizeName(dedicatedCategoryName)
    );

    if (dedicatedCategory) {
      const dedicatedMatch = guild.channels.cache.find((channel) => {
        if (channel.parentId !== dedicatedCategory.id) {
          return false;
        }

        return normalizeName(channel.name) === normalizeName(shortExpectedName);
      });

      if (dedicatedMatch) {
        return dedicatedMatch.id;
      }
    }

    if (!this.config.logCategoryName) {
      return undefined;
    }

    const expectedName = `${sourceName}${suffix}`;
    const logCategoryName = normalizeName(this.config.logCategoryName);

    const matched = guild.channels.cache.find((channel) => {
      if (!("name" in channel) || normalizeName(channel.name) !== normalizeName(expectedName)) {
        return false;
      }

      const parentName = "parent" in channel ? normalizeName(channel.parent?.name) : "";
      return parentName === logCategoryName;
    });

    return matched?.id;
  }

  async publishLog(channelId: string, content: string): Promise<void> {
    const logChannelId = await this.resolveMirrorChannelId(channelId, this.config.logChannelSuffix);
    if (!logChannelId) {
      return;
    }

    await sendToScope(this.orchestratorClient, logChannelId, undefined, content);
  }

  async publishRawLog(channelId: string, content: string): Promise<void> {
    const rawLogChannelId = await this.resolveMirrorChannelId(channelId, this.config.rawLogChannelSuffix);
    if (!rawLogChannelId) {
      return;
    }

    await sendToScope(this.orchestratorClient, rawLogChannelId, undefined, content);
  }

  async publishMirror(channelId: string, suffix: string, content: string): Promise<void> {
    const mirrorChannelId = await this.resolveMirrorChannelId(channelId, suffix);
    if (!mirrorChannelId) {
      return;
    }

    await sendToScope(this.orchestratorClient, mirrorChannelId, undefined, content);
  }

  async publishMirrorFiles(channelId: string, suffix: string, content: string, filePaths: string[]): Promise<void> {
    const mirrorChannelId = await this.resolveMirrorChannelId(channelId, suffix);
    if (!mirrorChannelId) {
      return;
    }

    await sendFilesToScope(this.orchestratorClient, mirrorChannelId, undefined, content, filePaths);
  }

  async startReceiver(): Promise<void> {
    await this.orchestratorClient.login(this.config.discordBots.orchestrator);
  }

  async startSenders(): Promise<void> {
    await Promise.all(
      (["claude", "codex", "gemini"] as const)
        .filter((agent) => this.agentClients[agent] && this.config.discordBots[agent])
        .map((agent) => this.agentClients[agent]!.login(this.config.discordBots[agent]!))
    );
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.orchestratorClient.destroy(),
      ...Object.values(this.agentClients).map((client) => client.destroy())
    ]);
  }

  async publishAs(identity: BotIdentity, channelId: string, threadId: string | undefined, content: string): Promise<void> {
    const client =
      identity === "orchestrator"
        ? this.orchestratorClient
        : this.agentClients[identity] ?? this.orchestratorClient;
    await sendToScope(client, channelId, threadId, content);
  }

  async publishFilesAs(
    identity: BotIdentity,
    channelId: string,
    threadId: string | undefined,
    content: string,
    filePaths: string[]
  ): Promise<void> {
    const client =
      identity === "orchestrator"
        ? this.orchestratorClient
        : this.agentClients[identity] ?? this.orchestratorClient;
    await sendFilesToScope(client, channelId, threadId, content, filePaths);
  }

  async showTypingAs(identity: BotIdentity, channelId: string, threadId: string | undefined): Promise<void> {
    const client =
      identity === "orchestrator"
        ? this.orchestratorClient
        : this.agentClients[identity] ?? this.orchestratorClient;
    await sendTypingToScope(client, channelId, threadId);
  }

  async publishTaskEvent(event: TaskEvent, mode: ChannelMode): Promise<void> {
    const logHeader = `[${event.agent}] ${event.type} :: ${event.taskId}`;
    await this.publishLog(event.scope.channelId, `${logHeader}\n${event.message}`);
    if (event.details) {
      await this.publishRawLog(
        event.scope.channelId,
        `${logHeader}\n${event.message}\n\n${event.details}`
      );
    } else {
      await this.publishRawLog(event.scope.channelId, `${logHeader}\n${event.message}`);
    }

    if (event.type === "task_started") {
      await this.publishMirror(
        event.scope.channelId,
        "-status",
        `[${event.agent}] started\n${event.message}`
      );
    }

    if (event.type === "delegation_requested" || event.type === "delegation_completed" || event.type === "delegation_skipped") {
      await this.publishMirror(
        event.scope.channelId,
        "-delegate",
        `[${event.agent}] ${event.type}\n${event.message}`
      );
    }

    if (event.type === "task_completed") {
      await this.publishMirror(
        event.scope.channelId,
        "-done",
        `[${event.agent}] completed\n${event.details ?? event.message}`
      );
    }

    if (event.type === "task_failed") {
      await this.publishMirror(
        event.scope.channelId,
        "-fail",
        `[${event.agent}] failed\n${event.details ?? event.message}`
      );
    }

    if (event.type === "artifacts_created" && event.artifacts?.length) {
      await this.publishMirrorFiles(
        event.scope.channelId,
        "-files",
        `[${event.agent}] generated files\n${event.artifacts.map((artifact) => artifact.relativePath).join("\n")}`,
        event.artifacts.map((artifact) => artifact.absolutePath)
      );
    }

    if (mode === "direct") {
      if (event.type === "task_started") {
        await this.showTypingAs(event.agent, event.scope.channelId, event.scope.threadId);
      }
      if (event.type === "task_failed") {
        await this.publishAs("orchestrator", event.scope.channelId, event.scope.threadId, `작업이 실패했습니다.\n${event.message}`);
      }
      if (event.type === "artifacts_created" && event.artifacts?.length) {
        await this.publishFilesAs(
          event.agent,
          event.scope.channelId,
          event.scope.threadId,
          `파일을 생성했습니다.\n${event.artifacts.map((artifact) => artifact.relativePath).join("\n")}`,
          event.artifacts.map((artifact) => artifact.absolutePath)
        );
      }
      return;
    }

    if (mode === "orchestra") {
      if (event.type === "task_started") {
        await this.showTypingAs(event.agent, event.scope.channelId, event.scope.threadId);
        await this.publishAs(event.agent, event.scope.channelId, event.scope.threadId, `작업을 시작합니다.`);
        return;
      }

      if (event.type === "delegation_requested") {
        await this.publishAs("orchestrator", event.scope.channelId, event.scope.threadId, event.message);
        return;
      }

      if (event.type === "delegation_completed") {
        await this.publishAs("orchestrator", event.scope.channelId, event.scope.threadId, event.message);
        return;
      }

      if (event.type === "delegation_skipped") {
        await this.publishAs("orchestrator", event.scope.channelId, event.scope.threadId, `위임을 건너뛰었습니다.\n${event.message}`);
        return;
      }

      if (event.type === "task_completed") {
        return;
      }

      if (event.type === "task_failed") {
        await this.publishAs("orchestrator", event.scope.channelId, event.scope.threadId, `작업이 실패했습니다.\n${event.message}`);
        return;
      }

      if (event.type === "artifacts_created" && event.artifacts?.length) {
        await this.publishFilesAs(
          event.agent,
          event.scope.channelId,
          event.scope.threadId,
          `생성한 파일입니다.\n${event.artifacts.map((artifact) => artifact.relativePath).join("\n")}`,
          event.artifacts.map((artifact) => artifact.absolutePath)
        );
      }
    }
  }
}
