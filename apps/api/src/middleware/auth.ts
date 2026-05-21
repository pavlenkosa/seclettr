import { createHash } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { query } from "../db/pool.js";

export interface AuthPayload {
  sub: string;        // userId (or guestSessionId for guests)
  deviceId: string;
  sessionId: string;
  tokenUse?: "access" | "ws" | "contact" | "guest";
  // Guest-only fields:
  guestName?: string;
  roomId?: string;
  iat: number;
  exp: number;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as AuthPayload;
    // Only access tokens are valid for HTTP API routes.
    if (payload.tokenUse !== "access") {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    (request as FastifyRequest & { auth: AuthPayload }).auth = payload;
  } catch {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}

/** Accepts a background poll token (Authorization: Bearer <token>) and populates request.auth.sub. */
export async function requireBackgroundToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  const hash = createHash("sha256").update(token).digest("hex");
  const rows = await query<{ user_id: string }>(
    "SELECT user_id FROM background_poll_tokens WHERE token_hash = $1",
    [hash]
  );
  if (rows.length === 0) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  (request as FastifyRequest & { auth: AuthPayload }).auth = {
    sub: rows[0]!.user_id,
    deviceId: "",
    sessionId: "",
    tokenUse: "access",
    iat: 0,
    exp: 0,
  };
}

export async function requireAuthOrBackgroundToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  // If the header looks like a background token (not a JWT), use background path.
  // JWTs have three dot-separated base64 parts; background tokens are nanoid(64).
  const looksLikeJwt = header?.startsWith("Bearer ") && header.split(".").length === 3;
  if (looksLikeJwt) {
    return requireAuth(request, reply);
  }
  return requireBackgroundToken(request, reply);
}

export async function requireGuestOrAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as AuthPayload;
    if (payload.tokenUse !== "access" && payload.tokenUse !== "guest") {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    (request as FastifyRequest & { auth: AuthPayload }).auth = payload;
  } catch {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}
