import type { FastifyReply } from "fastify";
import type { ZodTypeAny, infer as zInfer } from "zod";
import { type StripVersion, safeParseVersionedWire } from "@seclettr/protocol";

export function parseOrReply<TSchema extends ZodTypeAny>(
  reply: FastifyReply,
  schema: TSchema,
  payload: unknown
): zInfer<TSchema> | null {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    void reply.code(400).send({
      error: "Validation error",
      details: parsed.error.flatten(),
    });
    return null;
  }
  return parsed.data;
}

export function parseVersionedOrReply<TSchema extends ZodTypeAny>(
  reply: FastifyReply,
  schema: TSchema,
  payload: unknown,
  supportedVersion: number
): StripVersion<zInfer<TSchema>> | null {
  const parsed = safeParseVersionedWire(schema, payload, supportedVersion);
  if (parsed.success) {
    return parsed.data;
  }

  if (parsed.error.code === "UNSUPPORTED_PROTOCOL_VERSION") {
    void reply.code(400).send({
      error: "Unsupported protocol version",
      code: parsed.error.code,
      supportedVersion: parsed.error.supportedVersion,
      receivedVersion: parsed.error.receivedVersion ?? null,
    });
    return null;
  }

  void reply.code(400).send({
    error: "Validation error",
    code: parsed.error.code,
    details: parsed.error.details,
  });
  return null;
}
