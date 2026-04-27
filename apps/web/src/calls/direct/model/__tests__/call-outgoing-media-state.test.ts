import { describe, expect, it } from "vitest";
import {
  isSameOutgoingCallMediaState,
  resolveOutgoingCallMediaState,
  type OutgoingCallMediaStateSnapshot,
} from "@/calls/direct/model/call-media-state";

describe("call outgoing media state", () => {
  it("treats a live enabled visual track as active even if browser mute flags are unreliable", () => {
    expect(resolveOutgoingCallMediaState({
      source: "camera",
      track: {
        readyState: "live",
        enabled: true,
      },
    })).toEqual({
      state: "on",
      activity: "active",
    });
  });

  it("maps missing or ended visual tracks to deterministic inactive states", () => {
    expect(resolveOutgoingCallMediaState({
      source: "screen",
      track: null,
    })).toEqual({
      state: "off",
      activity: "inactive",
    });

    expect(resolveOutgoingCallMediaState({
      source: "screen",
      track: {
        readyState: "ended",
        enabled: true,
      },
    })).toEqual({
      state: "ended",
      activity: "inactive",
    });
  });

  it("keeps microphone semantics explicit instead of inferring visual-style off states", () => {
    expect(resolveOutgoingCallMediaState({
      source: "mic",
      track: {
        readyState: "live",
        enabled: false,
      },
    })).toEqual({
      state: "muted",
      activity: "inactive",
    });
  });

  it("deduplicates identical outgoing state snapshots and detects real topology changes", () => {
    const base: OutgoingCallMediaStateSnapshot = {
      callId: "call-1",
      source: "camera",
      state: "on",
      activity: "active",
      mid: "0",
      trackId: "track-1",
      reason: null,
    };

    expect(isSameOutgoingCallMediaState(base, { ...base })).toBe(true);
    expect(isSameOutgoingCallMediaState(base, {
      ...base,
      mid: "1",
    })).toBe(false);
    expect(isSameOutgoingCallMediaState(base, {
      ...base,
      reason: "user-toggle",
    })).toBe(false);
  });
});
