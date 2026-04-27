import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  __messageAckTestUtils,
  postMessageAck,
} from "@/lib/message-ack";

describe("postMessageAck", () => {
  beforeEach(() => {
    __messageAckTestUtils.resetAckMetrics();
  });

  it("acks on first attempt", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const result = await postMessageAck("msg-1", { post });

    expect(result).toBe("acked");
    expect(post).toHaveBeenCalledTimes(1);
    expect(__messageAckTestUtils.getAckMetrics()).toMatchObject({
      attempts: 1,
      retries: 0,
      acked: 1,
      failed: 0,
    });
  });

  it("retries transient failures and then succeeds", async () => {
    const post = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockResolvedValue(undefined);
    const sleep = vi.fn(async () => {});
    const logger = { debug: vi.fn(), warn: vi.fn() };

    const result = await postMessageAck("msg-2", {
      post,
      sleep,
      logger,
    });

    expect(result).toBe("acked");
    expect(post).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 750);
    expect(__messageAckTestUtils.getAckMetrics()).toMatchObject({
      attempts: 3,
      retries: 2,
      acked: 1,
      failed: 0,
    });
  });

  it("treats 409 as already acknowledged without retry", async () => {
    const post = vi.fn().mockRejectedValue(new ApiError(409, "already acknowledged"));

    const result = await postMessageAck("msg-3", { post });

    expect(result).toBe("already_acked");
    expect(post).toHaveBeenCalledTimes(1);
    expect(__messageAckTestUtils.getAckMetrics()).toMatchObject({
      attempts: 1,
      retries: 0,
      alreadyAcked: 1,
    });
  });

  it("does not retry terminal API errors", async () => {
    const post = vi.fn().mockRejectedValue(new ApiError(404, "not found"));
    const logger = { debug: vi.fn(), warn: vi.fn() };

    const result = await postMessageAck("msg-4", { post, logger });

    expect(result).toBe("terminal_error");
    expect(post).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(__messageAckTestUtils.getAckMetrics()).toMatchObject({
      attempts: 1,
      retries: 0,
      terminalError: 1,
    });
  });

  it("fails after bounded retries for persistent transient errors", async () => {
    const post = vi.fn().mockRejectedValue(new Error("offline"));
    const sleep = vi.fn(async () => {});
    const logger = { debug: vi.fn(), warn: vi.fn() };

    const result = await postMessageAck("msg-5", { post, sleep, logger });

    expect(result).toBe("failed");
    expect(post).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(__messageAckTestUtils.getAckMetrics()).toMatchObject({
      attempts: 4,
      retries: 3,
      failed: 1,
    });
  });
});
