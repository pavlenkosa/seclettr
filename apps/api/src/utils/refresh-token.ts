import { z } from "zod";

const REFRESH_TOKEN_VERSION = "v1";

interface ParsedRefreshToken {
  sessionId: string;
  secret: string;
}

const SessionIdSchema = z.string().uuid();

export function buildRefreshToken(sessionId: string, secret: string): string {
  return `${REFRESH_TOKEN_VERSION}.${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): ParsedRefreshToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  if (parts[0] !== REFRESH_TOKEN_VERSION) return null;

  const sessionId = parts[1];
  const secret = parts[2];
  if (!sessionId || !secret) return null;
  if (!SessionIdSchema.safeParse(sessionId).success) return null;

  return { sessionId, secret };
}
