import { randomUUID } from "node:crypto";

interface AccessTokenRecord {
  expiresAt: number;
  sessionId?: string;
}

interface SessionRecord {
  expiresAt: number;
}

export class SettingsTokenManager {
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly ttlSeconds: number) {}

  private now(): number {
    return Date.now();
  }

  private purgeExpired(): void {
    const now = this.now();

    for (const [token, record] of this.accessTokens) {
      if (record.expiresAt <= now) {
        this.accessTokens.delete(token);
      }
    }

    for (const [sessionId, record] of this.sessions) {
      if (record.expiresAt <= now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  issueAccessToken(): string {
    this.purgeExpired();
    const token = randomUUID();
    this.accessTokens.set(token, {
      expiresAt: this.now() + this.ttlSeconds * 1000
    });
    return token;
  }

  consumeAccessToken(token: string | undefined): string | undefined {
    this.purgeExpired();
    if (!token) {
      return undefined;
    }

    const record = this.accessTokens.get(token);
    if (!record || record.expiresAt <= this.now()) {
      return undefined;
    }

    if (record.sessionId) {
      const existingSession = this.sessions.get(record.sessionId);
      if (existingSession && existingSession.expiresAt > this.now()) {
        return record.sessionId;
      }
    }

    const sessionId = randomUUID();
    record.sessionId = sessionId;
    this.sessions.set(sessionId, {
      expiresAt: this.now() + this.ttlSeconds * 1000
    });
    return sessionId;
  }

  validateSession(sessionId: string | undefined): boolean {
    this.purgeExpired();
    if (!sessionId) {
      return false;
    }

    const record = this.sessions.get(sessionId);
    return Boolean(record && record.expiresAt > this.now());
  }
}
