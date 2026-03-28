import {
  Events,
  GatewayIntentBits,
  Partials,
  type Client,
  type Message
} from "discord.js";

import type { AppConfig } from "../config.js";
import type { Orchestrator } from "../orchestrator/orchestrator.js";
import type { ChannelMode } from "./channel-policy.js";
import { resolveChannelPolicy } from "./channel-policy.js";
import { DiscordPublisher } from "./publisher.js";
import { routeDiscordContent } from "./router.js";

function isIgnorableMessage(message: Message): boolean {
  return message.author.bot || !message.content.trim();
}

function buildPolicyConfig(config: AppConfig) {
  const base = {
    orchestraDefaultAgent: config.orchestraDefaultAgent
  };

  return {
    ...base,
    ...(config.directCategoryName ? { directCategoryName: config.directCategoryName } : {}),
    ...(config.orchestraCategoryName ? { orchestraCategoryName: config.orchestraCategoryName } : {})
  };
}

function formatDirectResult(result: string): string {
  return result.replace(/^\[[^\]]+\]\s*/gm, "").trim();
}

function isFileRequest(content: string): boolean {
  return /(파일|첨부|zip|압축|저장|내려받|download|upload|archive|\.zip|\.md|\.json|\.txt|\.exr)/i.test(content);
}

function buildAgentPrompt(originalPrompt: string): string {
  if (!isFileRequest(originalPrompt)) {
    return originalPrompt;
  }

  return [
    originalPrompt,
    "",
    "Taskmesh instruction:",
    "If this task produces one or more files, you must return them using the Taskmesh file protocol instead of only describing local paths.",
    "Use `TASKMESH_WRITE_FILE <relative-path>` followed by `<<<TASKMESH_CONTENT`, the full file body, and `TASKMESH_END_CONTENT`.",
    "If the user asked for a zip, return a valid zip file by first generating the binary or archive through your tools, then provide the resulting file via the same protocol or write a script that produces the zip and return that file.",
    "Do not answer with only a filesystem path when a file deliverable was requested."
  ].join("\n");
}

export function attachDiscordHandlers(
  client: Client,
  config: AppConfig,
  orchestrator: Orchestrator,
  publisher: DiscordPublisher
): void {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Taskmesh connected as ${readyClient.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    if (isIgnorableMessage(message)) {
      return;
    }

    const policy = resolveChannelPolicy(message.channel, buildPolicyConfig(config), config.defaultAgent);
    const routed = routeDiscordContent(message.content, policy.defaultAgent);
    const targetAgent = policy.forcedAgent ?? routed.agent;
    const taskPrompt = buildAgentPrompt(routed.prompt);
    const scope = message.channel.isThread()
      ? { channelId: message.channelId, threadId: message.channel.id }
      : { channelId: message.channelId };

    try {
      await publisher.showTypingAs(
        policy.mode === "direct" ? targetAgent : "orchestrator",
        scope.channelId,
        scope.threadId
      );

      if (policy.mode === "orchestra") {
        const explicitPrefix =
          policy.forcedAgent || routed.explicitTarget ? "Route: explicit" : "Route: default";
        await publisher.publishLog(
          scope.channelId,
          `[orchestrator] request accepted\nmode=${policy.mode}\ntarget=${targetAgent}\nroute=${explicitPrefix}`
        );
        await publisher.publishRawLog(
          scope.channelId,
          `[orchestrator] request accepted\nmode=${policy.mode}\ntarget=${targetAgent}\nroute=${explicitPrefix}\n\n${message.content}`
        );
        await publisher.publishAs(
          "orchestrator",
          scope.channelId,
          scope.threadId,
          `세션을 접수했습니다.\nMode: ${policy.mode}\nTarget: ${targetAgent}\n${explicitPrefix}`
        );
      }

      const result = await orchestrator.startTask(targetAgent, taskPrompt, scope);

      if (policy.mode === "direct") {
        await publisher.publishAs(targetAgent, scope.channelId, scope.threadId, formatDirectResult(result.summary));
        return;
      }

      await publisher.publishAs(
        "orchestrator",
        scope.channelId,
        scope.threadId,
        `최종 결과\n${formatDirectResult(result.summary)}`
      );
      await publisher.publishLog(
        scope.channelId,
        `[orchestrator] final result`
      );
      await publisher.publishRawLog(
        scope.channelId,
        `[orchestrator] final result\n${formatDirectResult(result.summary)}`
      );
    } catch (error) {
      await publisher.publishAs(
        "orchestrator",
        scope.channelId,
        scope.threadId,
        `작업 실패\n${String(error)}`
      );
      await publisher.publishLog(
        scope.channelId,
        `[orchestrator] failure`
      );
      await publisher.publishRawLog(
        scope.channelId,
        `[orchestrator] failure\n${String(error)}`
      );
    }
  });

  client.on(Events.ChannelCreate, async (channel) => {
    if (!channel.isTextBased()) {
      return;
    }

    const policy = resolveChannelPolicy(channel, buildPolicyConfig(config), config.defaultAgent);
    if (policy.mode !== "orchestra") {
      return;
    }

    await publisher.provisionSessionLogs(channel.id);
  });
}

export async function startDiscordRuntime(
  config: AppConfig,
  orchestratorFactory: (publishMode: (scopeChannelId: string) => ChannelMode) => Orchestrator
): Promise<DiscordPublisher> {
  const publisher = new DiscordPublisher(config);
  const modeByChannel = new Map<string, ChannelMode>();
  const orchestrator = orchestratorFactory((scopeChannelId) => modeByChannel.get(scopeChannelId) ?? "default");
  attachDiscordHandlers(publisher.receiverClient, config, orchestrator, publisher);
  publisher.receiverClient.on(Events.MessageCreate, (message) => {
    const policy = resolveChannelPolicy(message.channel, buildPolicyConfig(config), config.defaultAgent);
    modeByChannel.set(message.channelId, policy.mode);
  });
  await publisher.startReceiver();
  await publisher.startSenders();

  return publisher;
}
