import { describe, expect, it } from "vitest";
import {
  shouldAttemptDirectCallIceRestart,
  shouldResetDirectCallAfterDisconnectGrace,
} from "@/calls/direct/model/direct-call-lifecycle";

describe("call connection recovery helpers", () => {
  it("attempts an ICE restart only for a recoverable disconnected call", () => {
    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      hasAttemptedIceRestart: false,
    })).toBe(true);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "connected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      hasAttemptedIceRestart: false,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: false,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      hasAttemptedIceRestart: false,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: true,
      hasPeerTarget: true,
      hasAttemptedIceRestart: false,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: false,
      hasAttemptedIceRestart: false,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      hasAttemptedIceRestart: true,
    })).toBe(false);
  });

  it("resets only after disconnect/failed grace windows", () => {
    expect(shouldResetDirectCallAfterDisconnectGrace("disconnected")).toBe(true);
    expect(shouldResetDirectCallAfterDisconnectGrace("failed")).toBe(true);
    expect(shouldResetDirectCallAfterDisconnectGrace("connected")).toBe(false);
    expect(shouldResetDirectCallAfterDisconnectGrace("connecting")).toBe(false);
    expect(shouldResetDirectCallAfterDisconnectGrace("closed")).toBe(false);
  });
});
