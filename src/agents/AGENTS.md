<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# agents

## Purpose
Agent adapter layer that abstracts how Taskmesh invokes Claude Code, Codex, and Gemini CLIs. Defines the common `AgentAdapter` interface and provides three implementations: a CLI process runner, a Docker container runner, and a stub for testing.

## Key Files

| File | Description |
|------|-------------|
| `adapter.ts` | Core interfaces: `AgentAdapter` (run a task) and `AgentTooling` (delegation callback) |
| `cli-adapter.ts` | `CliAgentAdapter` — spawns agent CLIs as child processes, parses delegation and file-write directives from stdout |
| `docker-runner.ts` | `spawnDockerAgent()` — builds and spawns a `docker run` command with workspace/artifact mounts and env passthrough |
| `stub-adapter.ts` | `StubAgentAdapter` — test adapter that parses `[delegate:agent]` and `[file:path]` patterns from the prompt |
| `factory.ts` | `createAgentAdapters()` — factory that builds the adapter map from config, choosing CLI or stub per agent |

## For AI Agents

### Working In This Directory
- Every adapter must implement `AgentAdapter.run(task, session, sessionPaths, tools)`
- The CLI adapter parses two output protocols from agent stdout:
  - `TASKMESH_DELEGATE <agent> :: <prompt>` — triggers child task delegation
  - `TASKMESH_WRITE_FILE <path>` + `<<<TASKMESH_CONTENT` ... `TASKMESH_END_CONTENT` — triggers file artifact creation
- `buildInvocation()` in `cli-adapter.ts` handles per-agent CLI quirks (Claude session resume, Codex exec resume, Gemini resume)
- The prompt is written to the child process's stdin; output is collected from stdout

### Testing Requirements
- The stub adapter is the primary testing path — it requires no external CLIs
- Verify protocol parsing by checking `parseDelegations()` and `parseFileWrites()` in `cli-adapter.ts`

### Common Patterns
- Agent-specific branching uses `if (kind === "claude")` / `if (kind === "codex")` / `if (kind === "gemini")`
- CLI args are sanitized: `withoutArgs()` removes conflicting flags, `stripTrailingPromptDash()` handles Codex stdin marker

## Dependencies

### Internal
- `../config.ts` — `AgentKind`, `AgentCliConfig`, `DockerProviderConfig`, `ExecutionMode`
- `../types.ts` — `TaskRecord`, `AgentSession`, `AgentRunResult`, `DelegationInstruction`, `FileArtifactInstruction`
- `../sessions/workspace-manager.ts` — `SessionPaths`

### External
- `node:child_process` — `spawn` for CLI and Docker processes

<!-- MANUAL: -->
