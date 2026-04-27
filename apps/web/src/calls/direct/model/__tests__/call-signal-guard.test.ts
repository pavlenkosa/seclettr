import { describe, expect, it } from "vitest";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import {
  resolveExpectedDirectCallSignalSender,
  updateDirectCallIfCurrent,
} from "@/calls/direct/model/call-signal-guard";

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "video",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: false,
    screenSharing: false,
    duration: 10,
    signalingVerified: true,
    e2eeActive: true,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

describe("resolveExpectedDirectCallSignalSender", () => {
  it("accepts signals from the expected peer device", () => {
    expect(resolveExpectedDirectCallSignalSender({
      active: createActiveCall(),
      callId: "call-1",
      senderUserId: "peer-1",
      senderDeviceId: "device-1",
    })).toEqual({ ok: true });
  });

  it("rejects signals for another call context", () => {
    expect(resolveExpectedDirectCallSignalSender({
      active: createActiveCall(),
      callId: "call-2",
      senderUserId: "peer-1",
      senderDeviceId: "device-1",
    })).toEqual({ ok: false, reason: "call_mismatch" });
  });

  it("rejects signals from another peer user", () => {
    expect(resolveExpectedDirectCallSignalSender({
      active: createActiveCall(),
      callId: "call-1",
      senderUserId: "peer-2",
      senderDeviceId: "device-1",
    })).toEqual({ ok: false, reason: "peer_user_mismatch" });
  });

  it("rejects signals from a stale sibling device once peer device is bound", () => {
    expect(resolveExpectedDirectCallSignalSender({
      active: createActiveCall(),
      callId: "call-1",
      senderUserId: "peer-1",
      senderDeviceId: "device-2",
    })).toEqual({ ok: false, reason: "peer_device_mismatch" });
  });

  it("allows first answer from the expected peer user before peer device is bound", () => {
    expect(resolveExpectedDirectCallSignalSender({
      active: createActiveCall({ peerDeviceId: null }),
      callId: "call-1",
      senderUserId: "peer-1",
      senderDeviceId: "device-2",
    })).toEqual({ ok: true });
  });
});

describe("updateDirectCallIfCurrent", () => {
  it("patches the active call only when the call id matches", () => {
    const active = createActiveCall({ muted: false });

    expect(updateDirectCallIfCurrent(active, "call-1", (current) => ({
      ...current,
      muted: true,
    }))).toEqual(expect.objectContaining({ muted: true }));
  });

  it("ignores stale updates from a previous call", () => {
    const active = createActiveCall({ callId: "call-2", muted: false });

    expect(updateDirectCallIfCurrent(active, "call-1", (current) => ({
      ...current,
      muted: true,
    }))).toEqual(active);
  });

  it("keeps null state untouched", () => {
    expect(updateDirectCallIfCurrent(null, "call-1", (current) => current)).toBeNull();
  });
});
