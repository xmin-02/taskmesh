<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# scripts

## Purpose
Shell scripts for running and managing the Taskmesh service.

## Key Files

| File | Description |
|------|-------------|
| `run-taskmesh.sh` | Entrypoint script: sources `.env`, then execs `node dist/index.js`. Used by launchd. |

## For AI Agents

### Working In This Directory
- Scripts use `zsh` with `set -euo pipefail`
- The run script assumes the working directory is `/Users/sumin/taskmesh`
- Modifying this script affects the launchd-supervised service

<!-- MANUAL: -->
