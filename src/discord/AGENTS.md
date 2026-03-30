<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# discord

## Purpose
Discord integration layer handling message reception, agent routing, channel policy resolution, multi-bot publishing, and session log channel management. This is the primary user-facing interface of Taskmesh.

## Key Files

| File | Description |
|------|-------------|
| `bot.ts` | `startDiscordRuntime()` and `attachDiscordHandlers()` — message event handling, slash command registration (`/setting`), routing pipeline, and task invocation |
| `publisher.ts` | `DiscordPublisher` — manages four Discord bot clients (orchestrator + 3 agents), message splitting, typing indicators, log channel mirroring, and file uploads |
| `router.ts` | `routeDiscordContent()` — parses message prefixes (`@claude`, `/codex`, `gemini:`, `/ask codex`) into `{ agent, prompt, explicitTarget }` |
| `channel-policy.ts` | `resolveChannelPolicy()` — determines channel mode (`direct` / `orchestra` / `default`) and forced agent based on Discord category membership |

## For AI Agents

### Working In This Directory
- The routing pipeline is: `resolveChannelPolicy()` -> `routeDiscordContent()` -> `orchestrator.startTask()`
- Four Discord bot identities are used: orchestrator (receives messages), claude/codex/gemini (send agent-specific replies)
- `DiscordPublisher` auto-creates per-session log category with channels: status, delegate, done, fail, files, log, raw-log
- Task events are mirrored to dedicated log channels by event type suffix
- Messages over 1800 chars are automatically split at line/word boundaries
- User-facing messages are in Korean; log messages are in English
- `buildAgentPrompt()` appends file-protocol instructions when file-related keywords are detected

### Testing Requirements
- Channel policy logic can be unit-tested by mocking Discord channel objects with `parent.name` and `parent.type`
- Router logic is pure function — test with string inputs

### Common Patterns
- Bot identity selection: `identity === "orchestrator" ? orchestratorClient : agentClients[identity]`
- Fallback: if an agent bot fails to send, falls back to orchestrator bot
- Category-based routing: channels under "direct" category are pinned to one agent; "orchestra" category enables delegation

## Dependencies

### Internal
- `../config.ts` — `AppConfig`, `AgentKind`
- `../orchestrator/orchestrator.ts` — `Orchestrator`
- `../settings/server.ts` — `SettingsWebApp`
- `../types.ts` — `TaskEvent`, `ChannelScope`

### External
- `discord.js` — Client, Events, GatewayIntentBits, SlashCommandBuilder, MessageFlags

<!-- MANUAL: -->
