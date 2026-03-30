import { spawn, type ChildProcess } from "node:child_process";

import type { CloudflareTunnelMode } from "../config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SettingsTunnel {
  private process: ChildProcess | undefined;
  private startupPromise: Promise<string | undefined> | undefined;
  private shutdownTimer: NodeJS.Timeout | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly binary: string,
    private readonly port: number,
    private readonly mode: CloudflareTunnelMode,
    private readonly namedToken?: string,
    private readonly namedPublicUrl?: string
  ) {}

  private async waitForHttp(url: string): Promise<boolean> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await fetch(new URL("/healthz", url), {
          method: "GET",
          redirect: "manual"
        });
        if (response.ok) {
          return true;
        }
      } catch {
        await sleep(500);
      }
    }

    return false;
  }

  private clearRuntimeState(): void {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = undefined;
    }

    this.startupPromise = undefined;
    this.process = undefined;
  }

  private stopCurrent(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
    this.clearRuntimeState();
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  async issueTemporaryUrl(ttlSeconds: number): Promise<string | undefined> {
    if (this.mode === "named") {
      return this.ensureNamedTunnel();
    }

    this.lastError = undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const url = await this.issueTemporaryUrlOnce(ttlSeconds);
      if (url) {
        return url;
      }

      if (attempt < 1) {
        await sleep(1000);
      }
    }

    return undefined;
  }

  private async ensureNamedTunnel(): Promise<string | undefined> {
    this.lastError = undefined;

    if (!this.namedToken || !this.namedPublicUrl) {
      this.lastError = "Named tunnel is missing TASKMESH_CLOUDFLARE_TUNNEL_TOKEN or TASKMESH_CLOUDFLARE_TUNNEL_PUBLIC_URL";
      return undefined;
    }

    if (this.process && !this.process.killed) {
      return this.namedPublicUrl;
    }

    const child = spawn(this.binary, ["tunnel", "run", "--token", this.namedToken], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    this.process = child;

    let outputBuffer = "";
    const handleOutput = (chunk: Buffer | string) => {
      outputBuffer = `${outputBuffer}\n${chunk.toString()}`.slice(-4000);
    };

    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    child.on("error", (error) => {
      this.lastError = String(error);
    });
    child.on("exit", () => {
      if (!this.lastError) {
        this.lastError = outputBuffer.trim() || "Named cloudflared tunnel exited";
      }
      this.clearRuntimeState();
    });

    return this.namedPublicUrl;
  }

  private async issueTemporaryUrlOnce(ttlSeconds: number): Promise<string | undefined> {
    this.stopCurrent();

    this.startupPromise = new Promise((resolve) => {
      let settled = false;
      let outputBuffer = "";
      const child = spawn(this.binary, ["tunnel", "--url", `http://127.0.0.1:${this.port}`, "--no-autoupdate"], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      this.process = child;

      const resolveOnce = (value: string | undefined) => {
        if (settled) {
          return;
        }

        settled = true;
        this.startupPromise = undefined;
        resolve(value);
      };

      const handleOutput = async (chunk: Buffer | string) => {
        const text = chunk.toString();
        outputBuffer = `${outputBuffer}\n${text}`.slice(-4000);
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match?.[0]) {
          const candidateUrl = match[0];
          const isReady = await this.waitForHttp(candidateUrl);
          if (isReady) {
            this.shutdownTimer = setTimeout(() => {
              this.stopCurrent();
            }, ttlSeconds * 1000);
            resolveOnce(candidateUrl);
          } else {
            this.lastError = `Tunnel did not become reachable for ${candidateUrl}`;
            resolveOnce(undefined);
          }
        }
      };

      child.stdout.on("data", handleOutput);
      child.stderr.on("data", handleOutput);
      child.on("error", (error) => {
        this.lastError = String(error);
      });
      child.on("exit", () => {
        if (!settled) {
          if (!this.lastError) {
            this.lastError = outputBuffer.trim() || "cloudflared exited before a usable URL was ready";
          }
          resolveOnce(undefined);
        }
        this.clearRuntimeState();
      });
    });

    return this.startupPromise;
  }
}
