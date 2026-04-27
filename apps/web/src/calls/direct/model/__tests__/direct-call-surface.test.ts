import { describe, expect, it } from "vitest";
import { resolveDirectCallSurface } from "@/calls/direct/model/direct-call-types";

describe("resolveDirectCallSurface", () => {
  it("returns hidden when there is no call state", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: false,
      hasActive: false,
      isMinimized: false,
    })).toBe("hidden");
  });

  it("returns incoming fullscreen when an incoming call is not minimized", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: true,
      hasActive: false,
      isMinimized: false,
    })).toBe("incoming-fullscreen");
  });

  it("returns incoming minimized when an incoming call is minimized", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: true,
      hasActive: false,
      isMinimized: true,
    })).toBe("incoming-minimized");
  });

  it("returns active fullscreen when an active call is not minimized", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: false,
      hasActive: true,
      isMinimized: false,
    })).toBe("active-fullscreen");
  });

  it("returns active minimized when an active call is minimized", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: false,
      hasActive: true,
      isMinimized: true,
    })).toBe("active-minimized");
  });

  it("keeps active call priority when states overlap", () => {
    expect(resolveDirectCallSurface({
      hasIncoming: true,
      hasActive: true,
      isMinimized: true,
    })).toBe("active-minimized");
  });
});
