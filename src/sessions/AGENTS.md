<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# sessions

## Purpose
Manages the filesystem layout for per-session workspaces, creating the directory structure that agent CLIs operate within.

## Key Files

| File | Description |
|------|-------------|
| `workspace-manager.ts` | `SessionWorkspaceManager` — resolves and ensures session directories under `runtime/sessions/<sessionId>/` with `workspace/`, `artifacts/`, and `meta.json` |

## For AI Agents

### Working In This Directory
- `SessionPaths` is the key type: `{ sessionId, sessionDir, workspaceDir, artifactsDir, metaPath }`
- `sessionId` is derived from `scope.threadId ?? scope.channelId`
- `ensureSession()` creates dirs and writes `meta.json` if missing
- Path segments are sanitized via `sanitizeSegment()` to prevent directory traversal

### Testing Requirements
- Verify that `ensureSession()` is idempotent — calling it twice should not fail or overwrite `meta.json`

## Dependencies

### Internal
- `../types.ts` — `ChannelScope`

### External
- `node:fs` — `mkdirSync`, `writeFileSync`, `existsSync`
- `node:path` — `join`, `resolve`

<!-- MANUAL: -->
