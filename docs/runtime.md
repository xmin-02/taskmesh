# Runtime Plan

## Deployment target

Taskmesh is intended to run on a single MacBook in the background.

## Services

- `taskmesh-bot`: long-lived Node.js process that connects to Discord and manages orchestration
- `claude`, `codex`, `gemini`: local CLIs invoked by Taskmesh adapters
- `sqlite`: embedded local database file, no external daemon required

## Future isolation option

The preferred stronger isolation model is:

- keep the Discord orchestrator on the host
- run agent workloads inside per-session containers
- mount only per-session workspaces as read-write
- reuse provider login either by read-only auth mounts or env injection

See `docs/container-auth-review.md` for the provider-by-provider assessment.

## Discord identities

Taskmesh expects four bot tokens:

- orchestrator bot token for inbound messages and orchestration notices
- claude bot token for Claude-facing output
- codex bot token for Codex-facing output
- gemini bot token for Gemini-facing output

## Supervision

Preferred supervisor on macOS: `launchd`

Why:

- starts automatically on login or boot
- restarts on crash
- keeps logs and environment configuration manageable

## Practical notes

- the Taskmesh bot should be the only long-lived service at first
- agent CLIs can stay as on-demand subprocesses until throughput requires dedicated workers
- if concurrency becomes a problem, split orchestration and runners into separate local daemons
