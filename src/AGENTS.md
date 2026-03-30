<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# src

## Purpose
Application source code for the Taskmesh orchestration service. Contains the bootstrap entrypoint, shared type definitions, environment configuration, and all feature modules organized by domain.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Bootstrap entrypoint — wires config, store, adapters, publisher, orchestrator, and settings web app |
| `types.ts` | Shared type definitions: TaskRecord, AgentSession, DelegationRequest, TaskEvent, etc. |
| `config.ts` | Loads all configuration from environment variables into a typed `AppConfig` object |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `agents/` | Agent adapter interfaces and implementations (see `agents/AGENTS.md`) |
| `discord/` | Discord bot event handling, routing, and publishing (see `discord/AGENTS.md`) |
| `orchestrator/` | Core task orchestration and delegation logic (see `orchestrator/AGENTS.md`) |
| `storage/` | Persistence interfaces and implementations (see `storage/AGENTS.md`) |
| `artifacts/` | File artifact writing and path management (see `artifacts/AGENTS.md`) |
| `sessions/` | Session workspace directory management (see `sessions/AGENTS.md`) |
| `settings/` | Web-based settings UI with token auth and tunnel support (see `settings/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- All imports use `.js` extensions (ESM convention for NodeNext resolution)
- `AgentKind` is the union type `"claude" | "codex" | "gemini"` defined in `config.ts`
- `ChannelScope` (`{ channelId, threadId? }`) is the primary scoping key across the system
- The entrypoint in `index.ts` constructs the full dependency graph manually — no DI framework

### Testing Requirements
- Run `npm run check` after any change to verify type safety
- Runtime test: `npm run dev` starts the bot with `--watch`

### Common Patterns
- Interfaces defined in dedicated files (`adapter.ts`, `store.ts`), implementations in separate files
- Agent-specific behavior uses `AgentKind` discriminated logic (if/switch on `"claude" | "codex" | "gemini"`)
- Async operations return `Promise<T>` even when currently synchronous (for future-proofing storage backends)

## Dependencies

### Internal
- All subdirectories import from `config.ts` and `types.ts`

### External
- `discord.js` — used in `discord/` subdirectory
- `node:sqlite` — used in `storage/sqlite-store.ts`
- `node:child_process` — used in `agents/cli-adapter.ts` and `agents/docker-runner.ts`
- `node:http` — used in `settings/server.ts`

<!-- MANUAL: -->
