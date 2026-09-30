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
      attemptedIceRestartCount: 0,
    })).toBe(true);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "connected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      attemptedIceRestartCount: 0,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: false,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      attemptedIceRestartCount: 0,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: true,
      hasPeerTarget: true,
      attemptedIceRestartCount: 0,
    })).toBe(false);

    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: false,
      attemptedIceRestartCount: 0,
    })).toBe(false);
  });

  it("allows up to two ICE-restart attempts per connection episode", () => {
    // First disconnect: budget full.
    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      attemptedIceRestartCount: 0,
    })).toBe(true);

    // Second disconnect: one attempt consumed.
    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      attemptedIceRestartCount: 1,
    })).toBe(true);

    // Third disconnect: budget exhausted.
    expect(shouldAttemptDirectCallIceRestart({
      connectionState: "disconnected",
      negotiationReady: true,
      renegotiationUnsupported: false,
      hasPeerTarget: true,
      attemptedIceRestartCount: 2,
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
