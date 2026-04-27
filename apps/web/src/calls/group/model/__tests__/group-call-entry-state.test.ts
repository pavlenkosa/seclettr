import { describe, expect, it } from "vitest";
import {
  resolveGroupCallLaunchType,
  resolveGroupCallNoticeSurface,
} from "@/calls/group/model/entry";

describe("resolveGroupCallLaunchType", () => {
  it("keeps the requested type when there is no active call", () => {
    expect(resolveGroupCallLaunchType("audio", null)).toBe("audio");
  });

  it("prefers the current active call type when joining an existing room", () => {
    expect(resolveGroupCallLaunchType("audio", { callType: "video" })).toBe("video");
  });
});

describe("resolveGroupCallNoticeSurface", () => {
  it("hides the notice when there is no active group call", () => {
    expect(resolveGroupCallNoticeSurface({
      activeCall: null,
      hasOpenSession: false,
    })).toBe("hidden");
  });

  it("hides the notice while the group-call panel is already open", () => {
    expect(resolveGroupCallNoticeSurface({
      activeCall: { callId: "room-1" },
      hasOpenSession: true,
    })).toBe("hidden");
  });

  it("shows the notice when a group call is available and no panel is open", () => {
    expect(resolveGroupCallNoticeSurface({
      activeCall: { callId: "room-1" },
      hasOpenSession: false,
    })).toBe("banner");
  });
});
