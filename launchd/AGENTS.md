<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# launchd

## Purpose
macOS launchd configuration for running Taskmesh as a background service that starts on login and auto-restarts on crash.

## Key Files

| File | Description |
|------|-------------|
| `taskmesh.plist.example` | Example launchd plist — label `io.taskmesh.bot`, invokes `scripts/run-taskmesh.sh`, logs to `logs/` |

## For AI Agents

### Working In This Directory
- Copy the example plist to `~/Library/LaunchAgents/io.taskmesh.bot.plist` to install
- The plist references absolute paths under `/Users/sumin/taskmesh`
- `RunAtLoad` and `KeepAlive` are both enabled for automatic restart behavior

<!-- MANUAL: -->
