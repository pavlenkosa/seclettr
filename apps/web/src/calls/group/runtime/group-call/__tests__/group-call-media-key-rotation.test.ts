import { describe, expect, it } from "vitest";
import {
  GROUP_CALL_MEDIA_KEY_EPOCH_WRAP,
  buildGroupCallParticipantFingerprint,
  decideGroupCallMediaKeyRotation,
} from "@/calls/group/runtime/group-call/media-key-rotation";

describe("group-call-media-key-rotation", () => {
  it("builds stable participant fingerprint independent of input order", () => {
    const first = buildGroupCallParticipantFingerprint(["u-2", "u-1", "u-2"]);
    const second = buildGroupCallParticipantFingerprint(["u-1", "u-2"]);
    expect(first).toBe("u-1,u-2");
    expect(second).toBe("u-1,u-2");
  });

  it("rotates epoch when participant roster changes", () => {
    const decision = decideGroupCallMediaKeyRotation({
      localMediaKey: {
        epoch: 2,
        keyId: "k-2",
        algorithm: "aes-256-gcm",
        keyBytes: new Uint8Array(32),
      },
      participantFingerprint: "u-1,u-2,u-3",
      previousParticipantFingerprint: "u-1,u-2",
      nowMs: 10_000,
      lastRotatedAtMs: 9_000,
      intervalMs: 60_000,
    });

    expect(decision).toEqual({
      rotate: true,
      reason: "participant-change",
      nextEpoch: 3,
    });
  });

  it("rotates epoch when interval elapses", () => {
    const decision = decideGroupCallMediaKeyRotation({
      localMediaKey: {
        epoch: 5,
        keyId: "k-5",
        algorithm: "aes-256-gcm",
        keyBytes: new Uint8Array(32),
      },
      participantFingerprint: "u-1,u-2",
      previousParticipantFingerprint: "u-1,u-2",
      nowMs: 65_000,
      lastRotatedAtMs: 1_000,
      intervalMs: 60_000,
    });

    expect(decision).toEqual({
      rotate: true,
      reason: "interval",
      nextEpoch: 6,
    });
  });

  it("does not rotate on initial participant snapshot", () => {
    const decision = decideGroupCallMediaKeyRotation({
      localMediaKey: {
        epoch: 1,
        keyId: "k-1",
        algorithm: "aes-256-gcm",
        keyBytes: new Uint8Array(32),
      },
      participantFingerprint: "u-1,u-2",
      previousParticipantFingerprint: null,
      nowMs: 5_000,
      lastRotatedAtMs: 0,
      intervalMs: 60_000,
    });

    expect(decision).toEqual({
      rotate: false,
      reason: null,
      nextEpoch: 1,
    });
  });

  it("wraps epoch back to 0 when reaching the wrap boundary", () => {
    const decision = decideGroupCallMediaKeyRotation({
      localMediaKey: {
        epoch: GROUP_CALL_MEDIA_KEY_EPOCH_WRAP - 1,
        keyId: "k-max",
        algorithm: "aes-256-gcm",
        keyBytes: new Uint8Array(32),
      },
      participantFingerprint: "u-1,u-2,u-3",
      previousParticipantFingerprint: "u-1,u-2",
      nowMs: 80_000,
      lastRotatedAtMs: 1_000,
      intervalMs: 60_000,
    });

    expect(decision).toEqual({
      rotate: true,
      reason: "participant-change",
      nextEpoch: 0,
    });
  });
});
