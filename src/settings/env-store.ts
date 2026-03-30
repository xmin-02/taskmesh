import { readFileSync, writeFileSync } from "node:fs";

import type { AppConfig, ExecutionMode, AgentKind } from "../config.js";

export interface EditableSettings {
  executionMode: ExecutionMode;
  defaultAgent: AgentKind;
  autoCreateSessionLogs: boolean;
  settingsEnableTunnel: boolean;
}

function replaceOrAppendEnvValue(content: string, key: string, value: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  const line = `${key}=${value}`;

  return pattern.test(content)
    ? content.replace(pattern, line)
    : `${content.trimEnd()}\n${line}\n`;
}

export class EnvSettingsStore {
  constructor(
    private readonly envPath: string,
    private readonly config: AppConfig
  ) {}

  getSettings(): EditableSettings {
    return {
      executionMode: this.config.executionMode,
      defaultAgent: this.config.defaultAgent,
      autoCreateSessionLogs: this.config.autoCreateSessionLogs,
      settingsEnableTunnel: this.config.settingsEnableTunnel
    };
  }

  updateSettings(next: Partial<EditableSettings>): EditableSettings {
    let content = readFileSync(this.envPath, "utf8");

    if (next.executionMode) {
      content = replaceOrAppendEnvValue(content, "TASKMESH_EXECUTION_MODE", next.executionMode);
      process.env.TASKMESH_EXECUTION_MODE = next.executionMode;
      this.config.executionMode = next.executionMode;
    }

    if (next.defaultAgent) {
      content = replaceOrAppendEnvValue(content, "TASKMESH_DEFAULT_AGENT", next.defaultAgent);
      process.env.TASKMESH_DEFAULT_AGENT = next.defaultAgent;
      this.config.defaultAgent = next.defaultAgent;
    }

    if (typeof next.autoCreateSessionLogs === "boolean") {
      const value = String(next.autoCreateSessionLogs);
      content = replaceOrAppendEnvValue(content, "DISCORD_AUTO_CREATE_SESSION_LOGS", value);
      process.env.DISCORD_AUTO_CREATE_SESSION_LOGS = value;
      this.config.autoCreateSessionLogs = next.autoCreateSessionLogs;
    }

    if (typeof next.settingsEnableTunnel === "boolean") {
      const value = String(next.settingsEnableTunnel);
      content = replaceOrAppendEnvValue(content, "TASKMESH_SETTINGS_ENABLE_TUNNEL", value);
      process.env.TASKMESH_SETTINGS_ENABLE_TUNNEL = value;
      this.config.settingsEnableTunnel = next.settingsEnableTunnel;
    }

    writeFileSync(this.envPath, content, "utf8");
    return this.getSettings();
  }
}
