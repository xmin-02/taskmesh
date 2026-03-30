# Taskmesh Architecture

## Goal

Taskmesh provides a Discord-native workspace where multiple AI agents can collaborate in the same channel, delegate work to one another, and continue work after receiving downstream results.

Primary deployment target: a single MacBook running Taskmesh in the background.

## Core requirements

- A Discord channel is the primary shared workspace
- A Discord thread can represent a focused subtask or delegated branch
- Claude Code, Codex, and Gemini can all receive direct work
- Any agent can delegate work to any other agent
- Shared tools are exposed through a common interface rather than copied per provider
- Provider-specific tools remain available behind each adapter

## Design principles

- Keep orchestration outside the model runtime
- Maintain separate provider sessions per channel
- Persist a shared channel memory in addition to per-agent transcripts
- Treat delegation as a first-class task type
- Make Discord the visible control plane and storage the source of truth

## High-level architecture

```text
Discord
  -> Taskmesh Bot Service (launchd)
      -> Gateway
      -> Router
      -> Orchestrator
          -> Discord Publisher
              -> Orchestrator Bot
              -> Claude Bot
              -> Codex Bot
              -> Gemini Bot
          -> Session Manager
          -> Delegation Manager
          -> Result Publisher
          -> Agent Registry
              -> Claude CLI Adapter
              -> Codex CLI Adapter
              -> Gemini CLI Adapter
          -> Storage
              -> Channels
              -> Agent Sessions
              -> Tasks
              -> Task Events
              -> Shared Memory
```

## Local process model

- Taskmesh runs as a long-lived background service on macOS
- agent adapters invoke locally installed CLIs
- SQLite is stored on the same machine for low-latency persistence
- `launchd` is the preferred process supervisor
- a later step can split the bot and workers into separate local services if needed

### Planned containerized variant

- Orchestrator remains on the host
- each session can map to a dedicated container
- agent CLIs run inside the session container
- session workspace and artifacts are the only writable mounts
- auth reuse is provider-specific and documented separately

## Session model

### Channel scope

Each Discord `channel_id` owns:

- shared channel memory
- active task queue
- per-agent session references
- execution policy and tool availability

### Thread scope

Each Discord `thread_id` can optionally own:

- a child task tree
- narrowed context for a branch of work
- links to its parent channel and parent task

### Agent session scope

For each channel or thread, keep separate session records:

- `claude_session_id`
- `codex_session_id`
- `gemini_session_id`

This avoids transcript contamination while still allowing shared summaries.

## Discord category policy

Taskmesh supports two policy zones:

### Direct agent category

Example category: `Mac Book Pro M5 Max`

Expected channels:

- `claude-code`
- `codex`
- `gemini`

These channels are direct entrypoints. Each channel is pinned to one agent and does not require an explicit prefix to route correctly.

### Orchestra category

Example category: `Agent Orchestra`

Every channel inside this category is treated as a collaborative session:

- the channel is the primary session scope
- any agent can be the initial worker
- any agent can delegate to any other agent
- downstream results are posted back to the same Discord session
- orchestrator notices are posted by the orchestrator bot
- per-agent progress is posted by the matching agent bot

## Delegation flow

1. A user or agent creates a root task in a Discord channel.
2. The orchestrator selects the initial target agent.
3. The active agent may emit a Taskmesh delegation directive.
4. The orchestrator creates a child task for the delegated agent.
5. The delegated result is published to storage and optionally echoed to Discord.
6. The parent agent resumes with the returned artifact or summary.

Current directive format:

- `TASKMESH_DELEGATE claude :: continue implementation after codex review`
- `TASKMESH_DELEGATE codex :: inspect this repository for type errors`
- `TASKMESH_DELEGATE gemini :: summarize the findings for the channel`

## Shared tools

Taskmesh should expose a consistent tool surface for all agents:

- `delegate_task`
- `fetch_task_result`
- `send_discord_message`
- `list_channel_context`
- `read_shared_memory`
- `write_shared_memory`
- `schedule_task`

Provider-specific tools stay in the adapter layer.

## Discord command routing

Initial command formats:

- mention prefix: `@claude ...`, `@codex ...`, `@gemini ...`
- slash-like prefix: `/claude ...`
- generic ask form: `/ask codex ...`
- colon prefix: `claude: ...`

The router normalizes these into `{ agent, prompt }`.

## Storage model

Suggested initial tables:

- `channels`
- `threads`
- `agent_sessions`
- `tasks`
- `task_events`
- `messages`
- `shared_memory_entries`
- `attachments`

The first persistent implementation uses SQLite and stores:

- sessions keyed by `agent + channel_id + thread_id`
- tasks keyed by UUID
- task events as append-only rows

## Minimum viable build

### Phase 1

- Discord bot
- mention routing
- in-memory storage
- stub agent adapters
- task and event logging

### Phase 2

- SQLite persistence
- process-backed adapters for Claude Code, Codex, and Gemini
- streaming partial output back to Discord
- cross-agent delegation

### Phase 3

- MCP tool registry
- attachment ingestion
- browser and GitHub tools
- scheduling and policy controls
