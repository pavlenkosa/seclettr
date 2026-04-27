import type { FastifyRequest, FastifyReply } from "fastify";

export interface AuthPayload {
  sub: string;        // userId
  deviceId: string;
  sessionId: string;
  tokenUse?: "access" | "ws" | "contact";
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
