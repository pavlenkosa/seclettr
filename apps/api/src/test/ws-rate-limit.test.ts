import { describe, expect, it } from "vitest";
import { WsRateLimiter } from "../services/ws-rate-limit.js";

describe("WsRateLimiter", () => {
  it("applies default bucket limit for non-call messages", () => {
    const limiter = new WsRateLimiter({
      defaultMax: 2,
      defaultWindowMs: 60_000,
      callSignalMax: 10,
      callSignalWindowMs: 60_000,
    });

    expect(limiter.consume("socket-1", "typing.start", 0)).toBe(true);
    expect(limiter.consume("socket-1", "typing.stop", 1)).toBe(true);
    expect(limiter.consume("socket-1", "typing.start", 2)).toBe(false);
  });

  it("uses separate larger budget for call signaling", () => {
    const limiter = new WsRateLimiter({
      defaultMax: 1,
      defaultWindowMs: 60_000,
      callSignalMax: 6,
      callSignalWindowMs: 60_000,
    });

    expect(limiter.consume("socket-1", "typing.start", 0)).toBe(true);
    expect(limiter.consume("socket-1", "typing.stop", 1)).toBe(false);

    expect(limiter.consume("socket-1", "call.ice", 2)).toBe(true);
    expect(limiter.consume("socket-1", "call.offer", 3)).toBe(true);
    expect(limiter.consume("socket-1", "call.answer", 4)).toBe(true);
    expect(limiter.consume("socket-1", "group.call.media-key", 5)).toBe(true);
    expect(limiter.consume("socket-1", "group.call.media-key.ack", 6)).toBe(true);
    expect(limiter.consume("socket-1", "group.call.producer_state", 7)).toBe(true);
    expect(limiter.consume("socket-1", "room.join", 8)).toBe(false);
  });

  it("clears both buckets on disconnect", () => {
    const limiter = new WsRateLimiter({
      defaultMax: 1,
      defaultWindowMs: 60_000,
      callSignalMax: 1,
      callSignalWindowMs: 60_000,
    });

    expect(limiter.consume("socket-1", "typing.start", 0)).toBe(true);
    expect(limiter.consume("socket-1", "call.ice", 1)).toBe(true);

    limiter.clear("socket-1");

    expect(limiter.consume("socket-1", "typing.start", 2)).toBe(true);
    expect(limiter.consume("socket-1", "call.ice", 3)).toBe(true);
  });
});
