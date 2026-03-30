<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-03-30 | Updated: 2026-03-30 -->

# settings

## Purpose
Web-based settings interface accessible via Discord `/setting` command. Issues one-time token-authenticated URLs (local or via Cloudflare tunnel) to a lightweight HTTP settings page that can modify runtime configuration by writing to `.env`.

## Key Files

| File | Description |
|------|-------------|
| `server.ts` | `SettingsWebApp` — HTTP server on `127.0.0.1:<port>` serving an HTML settings form; handles token-gated GET/POST for `/settings` |
| `token-manager.ts` | `SettingsTokenManager` — issues one-time access tokens, converts them to session cookies, manages TTL-based expiry |
| `env-store.ts` | `EnvSettingsStore` — reads/writes editable settings (executionMode, defaultAgent, autoCreateSessionLogs, settingsEnableTunnel) to `.env` file and live `AppConfig` |
| `tunnel.ts` | `SettingsTunnel` — manages `cloudflared` tunnel processes for temporary or named public URLs to the local settings server |

## For AI Agents

### Working In This Directory
- The settings flow: Discord `/setting` -> issue token -> user opens URL -> token consumed -> session cookie set -> form submit -> `.env` updated
- Two tunnel modes: `trycloudflare` (temporary free URLs) and `named` (persistent tunnel with token)
- `SettingsTokenManager` handles both access tokens (one-time) and session IDs (cookie-based, TTL-bounded)
- The settings page is server-rendered HTML — no frontend framework
- Only a small allowlist of settings are editable; most config requires restart

### Testing Requirements
- Token lifecycle: verify that tokens expire, are consumed once, and sessions are validated
- Tunnel: `waitForHttp()` polls up to 20 attempts before declaring tunnel unreachable

### Common Patterns
- `replaceOrAppendEnvValue()` in `env-store.ts` handles both existing key replacement and new key append
- Process env and `AppConfig` object are both updated in-memory on save for immediate effect (except execution mode)

## Dependencies

### Internal
- `../config.ts` — `AppConfig`, `ExecutionMode`, `AgentKind`, `CloudflareTunnelMode`

### External
- `node:http` — HTTP server
- `node:url` — URL parsing
- `node:crypto` — `randomUUID` for tokens
- `node:child_process` — `spawn` for cloudflared
- `node:fs` — `.env` file read/write

<!-- MANUAL: -->
