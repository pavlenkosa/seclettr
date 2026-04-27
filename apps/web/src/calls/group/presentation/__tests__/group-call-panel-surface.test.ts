import { describe, expect, it } from "vitest";
import {
  formatGroupCallRoomCode,
  resolveGroupCallPanelSurface,
} from "@/calls/group/presentation/group-call-panel-surface";

describe("resolveGroupCallPanelSurface", () => {
  it("returns panel when not minimized", () => {
    expect(resolveGroupCallPanelSurface(false)).toBe("panel");
  });

  it("returns dock when minimized", () => {
    expect(resolveGroupCallPanelSurface(true)).toBe("dock");
  });
});

describe("formatGroupCallRoomCode", () => {
  it("keeps short ids unchanged", () => {
    expect(formatGroupCallRoomCode("room-123")).toBe("room-123");
  });

  it("shortens long ids for compact UI display", () => {
    expect(formatGroupCallRoomCode("12345678-1234-1234-1234-1234567890ab")).toBe("12345678-7890ab");
  });
});
