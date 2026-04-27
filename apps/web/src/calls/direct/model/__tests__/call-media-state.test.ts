import { describe, expect, it } from "vitest";
import {
  isSameOutgoingCallMediaState,
  resolveOutgoingCallMediaState,
  shouldApplyIncomingMediaState,
  shouldClearSlotFromHint,
  toIncomingMediaStateHint,
  toRemoteVisualSlotHintStatus,
} from "@/calls/direct/model/call-media-state";
import type { OutgoingCallMediaStateSnapshot } from "@/calls/direct/model/call-media-state";

describe("shouldApplyIncomingMediaState", () => {
  it("rejects duplicate or stale sequence numbers", () => {
    expect(shouldApplyIncomingMediaState(3, 1, 3, 1)).toBe(false);
    expect(shouldApplyIncomingMediaState(3, 1, 2, 2)).toBe(false);
  });

  it("rejects stale revisions even when sequence increases", () => {
    expect(shouldApplyIncomingMediaState(3, 2, 4, 1)).toBe(false);
  });

  it("accepts newer sequence and revision pairs", () => {
    expect(shouldApplyIncomingMediaState(3, 2, 4, 2)).toBe(true);
    expect(shouldApplyIncomingMediaState(3, 2, 5, 3)).toBe(true);
  });

  it("accepts when nextRevision is undefined (cannot compare)", () => {
    expect(shouldApplyIncomingMediaState(3, 2, 4, undefined)).toBe(true);
  });
});

describe("toIncomingMediaStateHint", () => {
  it("sets signaledStopping for off state", () => {
    const hint = toIncomingMediaStateHint({ state: "off", activity: "inactive", reason: null, mid: null });
    expect(hint.signaledStopping).toBe(true);
    expect(hint.signaledEnded).toBe(false);
  });

  it("sets signaledEnded for ended state", () => {
    const hint = toIncomingMediaStateHint({ state: "ended", activity: "inactive", reason: "user-toggle", mid: "m0" });
    expect(hint.signaledEnded).toBe(true);
    expect(hint.signaledStopping).toBe(false);
    expect(hint.reason).toBe("user-toggle");
    expect(hint.mid).toBe("m0");
  });

  it("sets neither flag for on state", () => {
    const hint = toIncomingMediaStateHint({ state: "on", activity: "active", reason: null, mid: "m1" });
    expect(hint.signaledStopping).toBe(false);
    expect(hint.signaledEnded).toBe(false);
    expect(hint.activity).toBe("active");
  });
});

describe("toRemoteVisualSlotHintStatus", () => {
  it("maps visual media-state hints to slot lifecycle states", () => {
    expect(toRemoteVisualSlotHintStatus("track-1", "on")).toBe("starting");
    expect(toRemoteVisualSlotHintStatus("track-1", "off")).toBe("stopping");
    expect(toRemoteVisualSlotHintStatus("track-1", "ended")).toBe("stopping");
    expect(toRemoteVisualSlotHintStatus(null, "off")).toBe("inactive");
  });

  it("returns inactive when trackId is null and state is ended", () => {
    expect(toRemoteVisualSlotHintStatus(null, "ended")).toBe("inactive");
  });
});

describe("shouldClearSlotFromHint", () => {
  const endedHint = { signaledEnded: true, signaledStopping: false, activity: "inactive" as const, reason: null, mid: null };
  const stoppingHint = { signaledEnded: false, signaledStopping: true, activity: "inactive" as const, reason: null, mid: null };
  const activeHint = { signaledEnded: false, signaledStopping: false, activity: "active" as const, reason: null, mid: null };

  it("clears when peer ended and track is gone", () => {
    expect(shouldClearSlotFromHint({ slotHasTrack: false, trackEnded: false, hint: endedHint })).toBe(true);
  });

  it("clears when peer ended and track has ended", () => {
    expect(shouldClearSlotFromHint({ slotHasTrack: true, trackEnded: true, hint: endedHint })).toBe(true);
  });

  it("does not clear when peer ended but track still live", () => {
    expect(shouldClearSlotFromHint({ slotHasTrack: true, trackEnded: false, hint: endedHint })).toBe(false);
  });

  it("does not clear when peer stopping and track still live", () => {
    expect(shouldClearSlotFromHint({ slotHasTrack: true, trackEnded: false, hint: stoppingHint })).toBe(false);
  });

  it("returns false for active hint", () => {
    expect(shouldClearSlotFromHint({ slotHasTrack: true, trackEnded: false, hint: activeHint })).toBe(false);
  });
});

describe("resolveOutgoingCallMediaState", () => {
  const liveEnabled = { readyState: "live" as const, enabled: true };
  const liveDisabled = { readyState: "live" as const, enabled: false };
  const endedTrack = { readyState: "ended" as const, enabled: true };

  it("uses explicitState when provided and track is live+enabled", () => {
    const result = resolveOutgoingCallMediaState({ source: "camera", track: liveEnabled, explicitState: "on" });
    expect(result).toEqual({ state: "on", activity: "active" });
  });

  it("uses explicitState=off with inactive activity", () => {
    const result = resolveOutgoingCallMediaState({ source: "camera", track: liveEnabled, explicitState: "off" });
    expect(result).toEqual({ state: "off", activity: "inactive" });
  });

  it("mic with live+enabled track is on/active", () => {
    expect(resolveOutgoingCallMediaState({ source: "mic", track: liveEnabled })).toEqual({ state: "on", activity: "active" });
  });

  it("mic with disabled track is muted/inactive", () => {
    expect(resolveOutgoingCallMediaState({ source: "mic", track: liveDisabled })).toEqual({ state: "muted", activity: "inactive" });
  });

  it("camera with no track is off/inactive", () => {
    expect(resolveOutgoingCallMediaState({ source: "camera", track: null })).toEqual({ state: "off", activity: "inactive" });
  });

  it("camera with ended track is ended/inactive", () => {
    expect(resolveOutgoingCallMediaState({ source: "camera", track: endedTrack })).toEqual({ state: "ended", activity: "inactive" });
  });

  it("camera with live but disabled track is off/inactive", () => {
    expect(resolveOutgoingCallMediaState({ source: "camera", track: liveDisabled })).toEqual({ state: "off", activity: "inactive" });
  });

  it("camera with live+enabled track is on/active", () => {
    expect(resolveOutgoingCallMediaState({ source: "camera", track: liveEnabled })).toEqual({ state: "on", activity: "active" });
  });
});

describe("isSameOutgoingCallMediaState", () => {
  const snap: OutgoingCallMediaStateSnapshot = {
    callId: "c1",
    source: "mic",
    state: "on",
    activity: "active",
    mid: "m0",
    trackId: "t1",
    reason: null,
  };

  it("returns false when left is null", () => {
    expect(isSameOutgoingCallMediaState(null, snap)).toBe(false);
  });

  it("returns true for identical snapshots", () => {
    expect(isSameOutgoingCallMediaState(snap, { ...snap })).toBe(true);
  });

  it("returns false when any field differs", () => {
    expect(isSameOutgoingCallMediaState(snap, { ...snap, state: "muted" })).toBe(false);
    expect(isSameOutgoingCallMediaState(snap, { ...snap, activity: "inactive" })).toBe(false);
    expect(isSameOutgoingCallMediaState(snap, { ...snap, mid: "m1" })).toBe(false);
    expect(isSameOutgoingCallMediaState(snap, { ...snap, trackId: "t2" })).toBe(false);
    expect(isSameOutgoingCallMediaState(snap, { ...snap, callId: "c2" })).toBe(false);
  });
});
