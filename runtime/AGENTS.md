<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# runtime

## Purpose
Runtime data directory containing per-session workspaces and artifacts created by the orchestrator during task execution. This directory is generated and managed automatically — do not commit session contents.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `sessions/` | Per-channel/thread session directories, each containing `workspace/`, `artifacts/`, and `meta.json` |

## For AI Agents

### Working In This Directory
- Session directories are named by Discord channel or thread ID
- `workspace/` is the `cwd` for agent CLI processes (host mode) or mounted at `/workspace` (docker mode)
- `artifacts/` stores files created via the `TASKMESH_WRITE_FILE` protocol
- `meta.json` records the channel/thread scope for the session
- Do not manually create or delete session directories — `SessionWorkspaceManager` handles lifecycle

<!-- MANUAL: -->
