import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseOrReply, parseVersionedOrReply } from "../utils/validation.js";

describe("parseOrReply", () => {
  it("returns parsed payload for valid input", () => {
    const schema = z.object({ a: z.string().min(1) });
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as unknown;

    const parsed = parseOrReply(reply as never, schema, { a: "ok" });

    expect(parsed).toEqual({ a: "ok" });
    expect(code).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends 400 response for invalid input", () => {
    const schema = z.object({ a: z.string().min(3) });
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as unknown;

    const parsed = parseOrReply(reply as never, schema, { a: "x" });

    expect(parsed).toBeNull();
    expect(code).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]?.[0] as {
      error?: string;
      details?: unknown;
    };
    expect(payload.error).toBe("Validation error");
    expect(payload.details).toBeDefined();
  });
});

describe("parseVersionedOrReply", () => {
  it("returns stripped payload for valid versioned input", () => {
    const schema = z.object({
      version: z.literal(1),
      roomId: z.string().min(1),
    });
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as unknown;

    const parsed = parseVersionedOrReply(
      reply as never,
      schema,
      {
        version: 1,
        roomId: "room-1",
      },
      1
    );

    expect(parsed).toEqual({ roomId: "room-1" });
    expect(code).not.toHaveBeenCalled();
  });

  it("sends explicit unsupported-version response", () => {
    const schema = z.object({
      version: z.literal(1),
      roomId: z.string().min(1),
    });
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });
    const reply = { code } as unknown;

    const parsed = parseVersionedOrReply(
      reply as never,
      schema,
      {
        version: 2,
        roomId: "room-1",
      },
      1
    );

    expect(parsed).toBeNull();
    expect(code).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith({
      error: "Unsupported protocol version",
      code: "UNSUPPORTED_PROTOCOL_VERSION",
      supportedVersion: 1,
      receivedVersion: 2,
    });
  });
});
