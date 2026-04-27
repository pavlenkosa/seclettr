import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { FastifyReply } from "fastify";
import { parseOrReply, parseVersionedOrReply } from "../src/validation.js";

function createReplyStub() {
  let statusCode = 200;
  let payload: unknown = null;

  const reply = {
    code(nextStatusCode: number) {
      statusCode = nextStatusCode;
      return reply;
    },
    send(nextPayload: unknown) {
      payload = nextPayload;
      return reply;
    },
  } as unknown as FastifyReply;

  return {
    reply,
    getStatusCode: () => statusCode,
    getPayload: () => payload,
  };
}

describe("parseOrReply", () => {
  const schema = z.object({
    roomId: z.string().min(1),
    userId: z.string().min(1),
  });

  it("returns parsed payload when input is valid", () => {
    const { reply, getStatusCode, getPayload } = createReplyStub();

    const parsed = parseOrReply(reply, schema, {
      roomId: "room-1",
      userId: "user-1",
    });

    expect(parsed).toEqual({
      roomId: "room-1",
      userId: "user-1",
    });
    expect(getStatusCode()).toBe(200);
    expect(getPayload()).toBeNull();
  });

  it("returns null and sends deterministic 400 payload when input is invalid", () => {
    const { reply, getStatusCode, getPayload } = createReplyStub();

    const parsed = parseOrReply(reply, schema, {
      roomId: "",
      userId: "",
    });

    expect(parsed).toBeNull();
    expect(getStatusCode()).toBe(400);
    expect(getPayload()).toMatchObject({
      error: "Validation error",
    });
  });
});

describe("parseVersionedOrReply", () => {
  const schema = z.object({
    version: z.literal(1),
    roomId: z.string().min(1),
  });

  it("strips version on success", () => {
    const { reply, getStatusCode, getPayload } = createReplyStub();

    const parsed = parseVersionedOrReply(
      reply,
      schema,
      {
        version: 1,
        roomId: "room-1",
      },
      1
    );

    expect(parsed).toEqual({ roomId: "room-1" });
    expect(getStatusCode()).toBe(200);
    expect(getPayload()).toBeNull();
  });

  it("returns explicit unsupported-version payload", () => {
    const { reply, getStatusCode, getPayload } = createReplyStub();

    const parsed = parseVersionedOrReply(
      reply,
      schema,
      {
        version: 2,
        roomId: "room-1",
      },
      1
    );

    expect(parsed).toBeNull();
    expect(getStatusCode()).toBe(400);
    expect(getPayload()).toEqual({
      error: "Unsupported protocol version",
      code: "UNSUPPORTED_PROTOCOL_VERSION",
      supportedVersion: 1,
      receivedVersion: 2,
    });
  });
});
