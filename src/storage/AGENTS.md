<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# storage

## Purpose
Persistence layer for agent sessions, tasks, and task events. Provides a `TaskStore` interface with two implementations: in-memory (for testing) and SQLite (for production).

## Key Files

| File | Description |
|------|-------------|
| `store.ts` | `TaskStore` interface — defines session management, task CRUD, and event append/list operations |
| `memory-store.ts` | `InMemoryTaskStore` — array/map-based implementation for development and testing |
| `sqlite-store.ts` | `SqliteTaskStore` — uses Node.js built-in `node:sqlite` (`DatabaseSync`) with WAL mode; creates tables on construction |

## For AI Agents

### Working In This Directory
- Both stores implement the same `TaskStore` interface — changes must be made in both
- SQLite store uses synchronous `DatabaseSync` API (Node.js 22+) wrapped in async methods
- Sessions are keyed by `(agent, channelId, threadId)` with a uniqueness constraint
- Tasks use UUID primary keys; events are append-only with auto-increment IDs
- The storage driver is selected in `index.ts` based on `config.storageDriver` ("memory" or "sqlite")

### Testing Requirements
- Test both implementations when changing the `TaskStore` interface
- SQLite store auto-creates the `data/` directory and database file

### Common Patterns
- `scopeKey()` converts `ChannelScope` to `{ channelId, threadId: string | null }` for SQL NULL handling
- `parentTaskId` is omitted from `TaskRecord` when absent (not set to undefined) to satisfy `exactOptionalPropertyTypes`

## Dependencies

### Internal
- `../config.ts` — `AgentKind`
- `../types.ts` — `AgentSession`, `ChannelScope`, `CreateTaskInput`, `TaskRecord`

### External
- `node:sqlite` — `DatabaseSync` (SQLite store only)
- `node:crypto` — `randomUUID` for ID generation

<!-- MANUAL: -->
