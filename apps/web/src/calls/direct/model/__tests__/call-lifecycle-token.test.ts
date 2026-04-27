import { describe, expect, it } from "vitest";
import {
  beginDirectCallLifecycleToken,
  isCurrentDirectCallLifecycleToken,
} from "@/calls/direct/model/direct-call-lifecycle";

describe("call lifecycle token helpers", () => {
  it("creates a monotonic lifecycle token", () => {
    expect(beginDirectCallLifecycleToken(0)).toBe(1);
    expect(beginDirectCallLifecycleToken(1)).toBe(2);
  });

  it("validates only the current lifecycle token", () => {
    expect(isCurrentDirectCallLifecycleToken(2, 2)).toBe(true);
    expect(isCurrentDirectCallLifecycleToken(3, 2)).toBe(false);
  });
});
