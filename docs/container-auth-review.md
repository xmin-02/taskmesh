# Container Auth Review

## Goal

Evaluate whether Taskmesh can run agent workloads inside per-session containers while preserving existing CLI login state.

## Summary

Container isolation is feasible, but provider strategy should differ by CLI.

- `Codex`: high confidence
- `Gemini`: high confidence
- `Claude`: possible, but should be validated carefully

The best near-term plan is:

1. Keep the Discord orchestrator on the host
2. Run agent workloads in per-session containers
3. Mount only session workspace and artifacts as read-write
4. Reuse authentication via read-only mounts or environment-variable injection

## Local findings

### Codex

Observed local state:

- `~/.codex/auth.json`
- `~/.codex/config.toml`

Implication:

- Codex likely supports file-based auth reuse
- A container can probably reuse login by mounting `~/.codex` read-only

Recommended container strategy:

- mount `~/.codex:/home/taskmesh/.codex:ro`
- mount session workspace and artifacts read-write
- run `codex exec ...` inside the container

Risk level: low to medium

### Gemini

Observed local state:

- `~/.gemini/oauth_creds.json`
- `~/.gemini/google_accounts.json`
- `~/.gemini/settings.json`

Implication:

- Gemini likely supports file-based auth reuse
- A container can probably reuse login by mounting `~/.gemini` read-only

Recommended container strategy:

- mount `~/.gemini:/home/taskmesh/.gemini:ro`
- mount session workspace and artifacts read-write
- run `gemini ...` inside the container

Risk level: low to medium

### Claude

Observed local state:

- `~/.claude/` contains sessions, settings, plugins, memory, and local runtime state
- no single obvious auth file was identified from quick inspection

Reference pattern from `sumone`:

- provider auth can be stored separately and injected through env vars
- relevant Claude env vars include:
  - `CLAUDE_CODE_OAUTH_TOKEN`
  - `CLAUDE_CODE_OAUTH_REFRESH_TOKEN`
  - `CLAUDE_CODE_ACCOUNT_UUID`
  - `CLAUDE_CODE_USER_EMAIL`
  - `CLAUDE_CODE_ORGANIZATION_UUID`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_AUTH_TOKEN`

Implication:

- Claude may be better handled by explicit env injection than by mounting the entire `~/.claude` directory
- If Claude still depends on macOS keychain behavior, this may fail inside containers

Recommended container strategy:

1. First attempt read-only mount of minimal Claude runtime state
2. If that is unreliable, extract auth values on the host and inject them into the container environment

Risk level: medium to high

## Recommended architecture

```text
Discord
  -> Host Taskmesh Orchestrator
      -> Session Manager
      -> Container Runner
          -> session-alpha container
              -> /workspace
              -> /artifacts
              -> claude/codex/gemini process
          -> session-beta container
              -> /workspace
              -> /artifacts
              -> claude/codex/gemini process
```

## Container boundaries

### Read-write mounts

- `/workspace`
- `/artifacts`

### Read-only mounts

- `~/.codex`
- `~/.gemini`
- minimal Claude auth path, if verified

### Avoid mounting

- full home directory
- full `/Users/sumin/taskmesh`
- `.env`
- SQLite DB path

## Security posture

This is stronger than host-only workspace separation, but not perfect isolation.

- session files are isolated from each other
- auth directories remain visible to containers that need them
- read-only mounts reduce mutation risk but not credential exposure risk

## Practical recommendation

### Phase 1

- containerize `Codex`
- containerize `Gemini`
- keep `Claude` on host or test a container POC separately

### Phase 2

- validate Claude auth reuse
- standardize per-session container lifecycle

### Phase 3

- add resource limits
- add network controls
- add container cleanup and retention policies

## Suggested POC order

1. Build a minimal image with `codex` CLI
2. Mount `~/.codex` read-only
3. Run a non-interactive `codex exec` test in `/workspace`
4. Repeat for Gemini with `~/.gemini`
5. Validate Claude with env-injection or a minimal state mount
