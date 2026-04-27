import { describe, expect, it } from "vitest";
import {
  canGroupCallLifecycleAction,
  mapGroupCallLifecycleStateToSharedPhase,
  resolveGroupCallLifecycleState,
} from "@/calls/group/model/group-call-lifecycle";
import {
  canMutateCallMedia,
  canRetryCallLifecycle,
} from "@/calls/shared/model/call-lifecycle-contract";

describe("resolveGroupCallLifecycleState", () => {
  it("returns room_idle without an open session", () => {
    expect(resolveGroupCallLifecycleState({
      sessionPresent: false,
      status: "starting",
      accessGranted: false,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("room_idle");
  });

  it("returns joining before local access is granted", () => {
    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "starting",
      accessGranted: false,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("joining");
  });

  it("returns publishing while local media is switching", () => {
    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "starting",
      accessGranted: true,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("publishing");

    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "ready",
      accessGranted: true,
      remoteParticipantCount: 0,
      isVideoSwitching: true,
      isScreenSwitching: false,
    })).toBe("publishing");
  });

  it("returns joined or subscribed after room setup", () => {
    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "ready",
      accessGranted: true,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("joined");

    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "ready",
      accessGranted: true,
      remoteParticipantCount: 2,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("subscribed");
  });

  it("returns reconnecting, leaving, left and failed for explicit conditions", () => {
    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "ready",
      accessGranted: true,
      remoteParticipantCount: 1,
      isVideoSwitching: false,
      isScreenSwitching: false,
      isReconnecting: true,
    })).toBe("reconnecting");

    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "leaving",
      accessGranted: true,
      remoteParticipantCount: 1,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("leaving");

    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "ready",
      accessGranted: true,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
      hasLeft: true,
    })).toBe("left");

    expect(resolveGroupCallLifecycleState({
      sessionPresent: true,
      status: "error",
      accessGranted: false,
      remoteParticipantCount: 0,
      isVideoSwitching: false,
      isScreenSwitching: false,
    })).toBe("failed");
  });
});

describe("canGroupCallLifecycleAction", () => {
  it("allows stage pinning only after remote subscriptions exist", () => {
    expect(canGroupCallLifecycleAction("subscribed", "pin_stage_tile")).toBe(true);
    expect(canGroupCallLifecycleAction("joining", "pin_stage_tile")).toBe(false);
  });
});

describe("mapGroupCallLifecycleStateToSharedPhase", () => {
  it("maps group-specific states onto the shared lifecycle contract", () => {
    expect(mapGroupCallLifecycleStateToSharedPhase("room_idle")).toBe("idle");
    expect(mapGroupCallLifecycleStateToSharedPhase("joining")).toBe("joining");
    expect(mapGroupCallLifecycleStateToSharedPhase("joined")).toBe("live");
    expect(mapGroupCallLifecycleStateToSharedPhase("publishing")).toBe("live");
    expect(mapGroupCallLifecycleStateToSharedPhase("subscribed")).toBe("live");
    expect(mapGroupCallLifecycleStateToSharedPhase("reconnecting")).toBe("reconnecting");
    expect(mapGroupCallLifecycleStateToSharedPhase("leaving")).toBe("leaving");
    expect(mapGroupCallLifecycleStateToSharedPhase("left")).toBe("ended");
    expect(mapGroupCallLifecycleStateToSharedPhase("failed")).toBe("failed");
  });

  it("uses shared media mutation and retry semantics", () => {
    expect(canMutateCallMedia(mapGroupCallLifecycleStateToSharedPhase("subscribed"))).toBe(true);
    expect(canMutateCallMedia(mapGroupCallLifecycleStateToSharedPhase("reconnecting"))).toBe(false);
    expect(canRetryCallLifecycle(mapGroupCallLifecycleStateToSharedPhase("failed"))).toBe(true);
  });
});
