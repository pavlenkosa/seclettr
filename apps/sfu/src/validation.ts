import type { FastifyReply } from "fastify";
import type { ZodTypeAny, TypeOf } from "zod";
import { type StripVersion, safeParseVersionedWire } from "@seclettr/protocol";

export function parseOrReply<TSchema extends ZodTypeAny>(
  reply: FastifyReply,
  schema: TSchema,
  payload: unknown
): TypeOf<TSchema> | null {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    void reply.code(400).send({
      error: "Validation error",
      details: parsed.error.flatten(),
    });
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return parsed.data as TypeOf<TSchema>;
}

export function parseVersionedOrReply<TSchema extends ZodTypeAny>(
  reply: FastifyReply,
  schema: TSchema,
  payload: unknown,
  supportedVersion: number
): StripVersion<TypeOf<TSchema>> | null {
  const parsed = safeParseVersionedWire(schema, payload, supportedVersion);
  if (parsed.success) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parsed.data as StripVersion<TypeOf<TSchema>>;
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
