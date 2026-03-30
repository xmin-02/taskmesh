<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# artifacts

## Purpose
Manages writing file artifacts produced by agent tasks to disk, organized by session, agent, and task ID.

## Key Files

| File | Description |
|------|-------------|
| `manager.ts` | `ArtifactManager` — writes `FileArtifactInstruction[]` to `<session>/artifacts/<agent>/<taskId>/<relativePath>`, sanitizing path segments to prevent traversal |

## For AI Agents

### Working In This Directory
- Artifacts are written under the session's `artifactsDir`, not the global `artifacts/` path
- Path sanitization: `sanitizeSegment()` strips non-alphanumeric chars; `sanitizeRelativePath()` removes `../` traversal
- The manager delegates session path resolution to `SessionWorkspaceManager`

### Testing Requirements
- Verify path traversal prevention (e.g., `../../etc/passwd` should be sanitized)

## Dependencies

### Internal
- `../sessions/workspace-manager.ts` — `SessionWorkspaceManager`
- `../config.ts` — `AgentKind`
- `../types.ts` — `ChannelScope`, `FileArtifactInstruction`, `ResolvedArtifact`

### External
- `node:fs` — `mkdirSync`, `writeFileSync`
- `node:path` — `dirname`, `join`, `normalize`

<!-- MANUAL: -->
