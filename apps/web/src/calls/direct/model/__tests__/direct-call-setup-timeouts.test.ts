import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DirectCallSetupTimeoutError,
  withSetupStageTimeout,
} from "@/calls/direct/model/direct-call-setup-timeouts";

describe("DirectCallSetupTimeoutError", () => {
  it("carries the stage name", () => {
    const err = new DirectCallSetupTimeoutError("local-media");
    expect(err.stage).toBe("local-media");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("withSetupStageTimeout", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("resolves when the inner promise resolves before the deadline", async () => {
    const inner = Promise.resolve("ok");
    const result = await withSetupStageTimeout(inner, 5_000, "local-media");
    expect(result).toBe("ok");
  });

  it("rejects with DirectCallSetupTimeoutError when the deadline fires first", async () => {
    let resolveInner!: () => void;
    const inner = new Promise<void>((res) => { resolveInner = res; });
    const raced = withSetupStageTimeout(inner, 5_000, "local-media");

    vi.advanceTimersByTime(5_001);

    await expect(raced).rejects.toBeInstanceOf(DirectCallSetupTimeoutError);
    resolveInner(); // cleanup
  });

  it("attaches the correct stage to the timeout error", async () => {
    let resolveInner!: () => void;
    const inner = new Promise<void>((res) => { resolveInner = res; });
    const raced = withSetupStageTimeout(inner, 1_000, "api-create-call");

    vi.advanceTimersByTime(1_001);

    const err = await raced.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DirectCallSetupTimeoutError);
    expect((err as DirectCallSetupTimeoutError).stage).toBe("api-create-call");
    resolveInner();
  });

  it("propagates inner rejection before the deadline", async () => {
    const inner = Promise.reject(new Error("device denied"));
    await expect(withSetupStageTimeout(inner, 5_000, "local-media")).rejects.toThrow("device denied");
  });

  it("does not fire the timeout after the inner promise resolves", async () => {
    let resolveInner!: (v: string) => void;
    const inner = new Promise<string>((res) => { resolveInner = res; });
    const raced = withSetupStageTimeout(inner, 5_000, "local-media");

    resolveInner("stream");
    const result = await raced;
    expect(result).toBe("stream");

    // Advancing past the original deadline should not throw anything.
    vi.advanceTimersByTime(10_000);
    // No unhandled rejection expected.
  });
});
