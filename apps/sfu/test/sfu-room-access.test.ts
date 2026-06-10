import { describe, expect, it, vi } from "vitest";
import {
  createRoomAccessChecker,
} from "../src/sfu-room-access.js";

describe("createRoomAccessChecker", () => {
  it("returns expected interface", () => {
    const checker = createRoomAccessChecker({
      apiInternalUrl: "http://localhost:3001",
      roomAccessTimeoutMs: 3000,
    });

    expect(checker).toBeDefined();
    expect(typeof checker.ensureRoomAccess).toBe("function");
  });

  it("rejects immediately when no authorization header", async () => {
    const checker = createRoomAccessChecker({
      apiInternalUrl: "http://localhost:3001",
      roomAccessTimeoutMs: 3000,
    });

    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const result = await checker.ensureRoomAccess(
      { headers: {}, ip: "127.0.0.1" } as never,
      reply as never,
      "room-1"
    );

    expect(result).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  it("rejects when authorization header is empty string", async () => {
    const checker = createRoomAccessChecker({
      apiInternalUrl: "http://localhost:3001",
      roomAccessTimeoutMs: 3000,
    });

    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const result = await checker.ensureRoomAccess(
      { headers: { authorization: "  " }, ip: "127.0.0.1" } as never,
      reply as never,
      "room-1"
    );

    expect(result).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(401);
  });
});
