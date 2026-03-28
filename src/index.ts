import { createAgentAdapters } from "./agents/factory.js";
import { ArtifactManager } from "./artifacts/manager.js";
import { loadConfig } from "./config.js";
import "dotenv/config";

import { startDiscordRuntime } from "./discord/bot.js";
import { Orchestrator } from "./orchestrator/orchestrator.js";
import { DiscordPublisher } from "./discord/publisher.js";
import { InMemoryTaskStore } from "./storage/memory-store.js";
import { SqliteTaskStore } from "./storage/sqlite-store.js";
import type { ChannelMode } from "./discord/channel-policy.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const store =
    config.storageDriver === "sqlite"
      ? new SqliteTaskStore(config.databasePath)
      : new InMemoryTaskStore();
  const adapters = createAgentAdapters(config);
  const artifactManager = new ArtifactManager(config.artifactsPath);
  let publisherRef: DiscordPublisher | undefined;

  await startDiscordRuntime(config, (resolveModeForChannel) =>
    new Orchestrator(store, adapters, artifactManager, async (event) => {
      if (!publisherRef) {
        return;
      }

      await publisherRef.publishTaskEvent(event, resolveModeForChannel(event.scope.channelId));
    })
  ).then((publisher) => {
    publisherRef = publisher;
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
