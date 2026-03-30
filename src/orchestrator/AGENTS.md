<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# orchestrator

## Purpose
Core task execution engine that manages the lifecycle of agent tasks including creation, execution, recursive delegation, artifact handling, and event emission.

## Key Files

| File | Description |
|------|-------------|
| `orchestrator.ts` | `Orchestrator` class — `startTask()` drives the full task lifecycle: session lookup, adapter invocation, artifact writing, recursive delegation (max depth 4), and event publishing |

## For AI Agents

### Working In This Directory
- `startTask()` is recursive: agent output may contain `delegations` which spawn child tasks up to `MAX_DELEGATION_DEPTH` (4)
- Delegation results are appended to the parent task summary
- The orchestrator emits `TaskEvent` objects for every lifecycle transition (started, completed, failed, delegation_requested/completed/skipped, artifacts_created)
- Artifact writing is delegated to `ArtifactManager`; session workspace setup to `SessionWorkspaceManager`
- The `onEvent` callback is wired to `DiscordPublisher.publishTaskEvent()` in `index.ts`

### Testing Requirements
- Test with stub adapters to verify delegation depth limiting and event emission order
- Verify that `externalSessionId` updates are persisted correctly across resumed sessions

### Common Patterns
- Event emission via `this.emit()` wrapping the optional callback
- Error handling: failed tasks are marked `"failed"` in storage and re-thrown
- Task parentage: `parentTaskId` links child tasks to their delegation origin

## Dependencies

### Internal
- `../agents/adapter.ts` — `AgentAdapter`
- `../artifacts/manager.ts` — `ArtifactManager`
- `../sessions/workspace-manager.ts` — `SessionWorkspaceManager`
- `../storage/store.ts` — `TaskStore`
- `../config.ts` — `AgentKind`
- `../types.ts` — all core types

<!-- MANUAL: -->
