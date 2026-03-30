<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# Taskmesh

## Purpose
Discord-centered multi-agent orchestration service for Claude Code, Codex, and Gemini. Receives messages from Discord, routes them to the appropriate AI agent CLI, manages inter-agent delegation, and publishes results back to Discord channels. Designed for local execution on a single MacBook with launchd supervision.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Project manifest — discord.js and dotenv dependencies |
| `tsconfig.json` | TypeScript strict config targeting ES2022 / NodeNext |
| `.env.example` | Environment variable template with all supported knobs |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (see `src/AGENTS.md`) |
| `docs/` | Architecture and design documents (see `docs/AGENTS.md`) |
| `scripts/` | Shell scripts for running the service (see `scripts/AGENTS.md`) |
| `launchd/` | macOS launchd plist for background supervision (see `launchd/AGENTS.md`) |
| `runtime/` | Session workspaces and artifacts created at runtime (see `runtime/AGENTS.md`) |
| `data/` | SQLite database storage (generated at runtime) |
| `artifacts/` | Legacy artifact output directory (generated at runtime) |

## For AI Agents

### Working In This Directory
- Run `npm run build` after modifying any `.ts` file under `src/`
- Run `npm run check` for type-checking without emitting
- Copy `.env.example` to `.env` and fill in Discord bot tokens before starting
- The project uses ES modules (`"type": "module"`) — all local imports must use `.js` extensions
- TypeScript strict mode is enabled with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

### Testing Requirements
- No test framework is set up yet — verify changes with `npm run check` (type-check) at minimum
- For runtime verification, use `npm run dev` which watches for changes

### Common Patterns
- Environment-driven configuration via `src/config.ts` — all settings come from `process.env`
- Agent adapters implement the `AgentAdapter` interface and are registered via a factory
- Discord messages are routed through a policy + router pipeline before reaching the orchestrator
- Korean is used for user-facing Discord messages; English for logs and internal strings

## Dependencies

### External
- `discord.js` ^14.19.3 — Discord Gateway and bot identity management
- `dotenv` ^16.6.1 — `.env` file loading
- `node:sqlite` (built-in) — SQLite persistence via Node.js 22+ `DatabaseSync`

<!-- MANUAL: -->
