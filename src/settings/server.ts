import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";

import type { AppConfig } from "../config.js";
import { EnvSettingsStore } from "./env-store.js";
import { SettingsTokenManager } from "./token-manager.js";
import { SettingsTunnel } from "./tunnel.js";

function readCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    })
  );
}

function sendHtml(response: ServerResponse, statusCode: number, html: string, sessionId?: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (sessionId) {
    response.setHeader("Set-Cookie", `taskmesh_settings_session=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
  }
  response.end(html);
}

function sendText(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(body);
}

function renderPage(config: AppConfig, settings: ReturnType<EnvSettingsStore["getSettings"]>, message?: string): string {
  const options = {
    executionMode: ["host", "docker"],
    defaultAgent: ["claude", "codex", "gemini"]
  };

  const checked = (value: boolean) => (value ? "checked" : "");
  const selected = (current: string, value: string) => (current === value ? "selected" : "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Taskmesh Settings</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #111; }
    h1 { margin-bottom: 8px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 20px; margin-top: 20px; }
    label { display: block; font-weight: 600; margin-top: 12px; }
    select, button { margin-top: 8px; padding: 10px 12px; font-size: 14px; }
    .row { margin-top: 12px; }
    .hint { color: #555; font-size: 14px; }
    .ok { margin-top: 16px; color: #0a7a28; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Taskmesh Settings</h1>
  <div class="hint">Local runtime settings for this MacBook. Changes are written to <code>.env</code>.</div>
  ${message ? `<div class="ok">${message}</div>` : ""}
  <div class="card">
    <form method="post" action="/settings">
      <label for="executionMode">Execution Mode</label>
      <select id="executionMode" name="executionMode">
        ${options.executionMode.map((value) => `<option value="${value}" ${selected(settings.executionMode, value)}>${value}</option>`).join("")}
      </select>

      <label for="defaultAgent">Default Agent</label>
      <select id="defaultAgent" name="defaultAgent">
        ${options.defaultAgent.map((value) => `<option value="${value}" ${selected(settings.defaultAgent, value)}>${value}</option>`).join("")}
      </select>

      <div class="row">
        <label><input type="checkbox" name="autoCreateSessionLogs" value="true" ${checked(settings.autoCreateSessionLogs)} /> Auto-create session logs</label>
      </div>

      <div class="row">
        <label><input type="checkbox" name="settingsEnableTunnel" value="true" ${checked(settings.settingsEnableTunnel)} /> Enable cloudflared tunnel links</label>
      </div>

      <button type="submit">Save</button>
    </form>
  </div>
  <div class="card">
    <div><strong>Session root</strong>: <code>${config.sessionRoot}</code></div>
    <div><strong>Artifacts path</strong>: <code>${config.artifactsPath}</code></div>
    <div><strong>Settings port</strong>: <code>${config.settingsPort}</code></div>
  </div>
</body>
</html>`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => resolve(body));
  });
}

export class SettingsWebApp {
  private readonly store: EnvSettingsStore;
  private readonly tokens: SettingsTokenManager;
  private readonly tunnel: SettingsTunnel | undefined;

  constructor(
    private readonly config: AppConfig,
    envPath: string
  ) {
    this.store = new EnvSettingsStore(envPath, config);
    this.tokens = new SettingsTokenManager(config.settingsTokenTtlSeconds);
    this.tunnel = config.settingsEnableTunnel
      ? new SettingsTunnel(
          config.cloudflaredBinary,
          config.settingsPort,
          config.cloudflareTunnelMode,
          config.cloudflareTunnelToken,
          config.cloudflareTunnelPublicUrl
        )
      : undefined;
  }

  async start(): Promise<void> {
    const server = createServer(async (request, response) => {
      const url = parseUrl(request.url ?? "", true);
      const cookies = readCookies(request);
      const sessionId = cookies.taskmesh_settings_session;

      if (request.method === "GET" && url.pathname === "/healthz") {
        sendText(response, 200, "ok");
        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        sendHtml(
          response,
          200,
          "<h1>Taskmesh Settings</h1><p>Open the full <code>/settings?token=...</code> link issued from Discord.</p>"
        );
        return;
      }

      if (request.method === "GET" && url.pathname === "/settings") {
        const token = typeof url.query.token === "string" ? url.query.token : undefined;
        const establishedSession =
          (sessionId && this.tokens.validateSession(sessionId) ? sessionId : undefined) ??
          this.tokens.consumeAccessToken(token);
        if (!establishedSession || !this.tokens.validateSession(establishedSession)) {
          sendHtml(response, 403, "<h1>Access denied</h1><p>This settings link is invalid, expired, or already used.</p>");
          return;
        }

        sendHtml(response, 200, renderPage(this.config, this.store.getSettings()), establishedSession);
        return;
      }

      if (request.method === "POST" && url.pathname === "/settings") {
        if (!this.tokens.validateSession(sessionId)) {
          sendHtml(response, 403, "<h1>Access denied</h1><p>Your settings session has expired.</p>");
          return;
        }

        const body = await readBody(request);
        const params = new URLSearchParams(body);
        const executionMode = params.get("executionMode");
        const defaultAgent = params.get("defaultAgent");

        const updated = this.store.updateSettings({
          executionMode: executionMode === "docker" ? "docker" : "host",
          defaultAgent: defaultAgent === "codex" || defaultAgent === "gemini" ? defaultAgent : "claude",
          autoCreateSessionLogs: params.get("autoCreateSessionLogs") === "true",
          settingsEnableTunnel: params.get("settingsEnableTunnel") === "true"
        });

        sendHtml(response, 200, renderPage(this.config, updated, "Saved. Restart Taskmesh for execution-mode changes to take full effect."), sessionId);
        return;
      }

      response.statusCode = 404;
      response.end("Not found");
    });

    await new Promise<void>((resolve) => {
      server.listen(this.config.settingsPort, "127.0.0.1", () => resolve());
    });
  }

  issueLocalLink(): { token: string; localUrl: string } {
    const token = this.tokens.issueAccessToken();
    return {
      token,
      localUrl: `http://127.0.0.1:${this.config.settingsPort}/settings?token=${token}`
    };
  }

  async issueExternalLink(token: string): Promise<{ externalUrl?: string; externalError?: string }> {
    const externalBase = this.tunnel
      ? await this.tunnel.issueTemporaryUrl(this.config.settingsTokenTtlSeconds)
      : undefined;
    const externalError = this.tunnel?.getLastError();

    return {
      ...(externalBase ? { externalUrl: `${externalBase}/settings?token=${token}` } : {}),
      ...(!externalBase && externalError ? { externalError } : {})
    };
  }
}
