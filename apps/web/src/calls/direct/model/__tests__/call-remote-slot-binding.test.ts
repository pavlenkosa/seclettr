import { describe, expect, it } from "vitest";
import { resolveRemoteReceiverSlotSource, detectSourceSwitch } from "@/calls/direct/model/call-remote-slot-binding";

describe("call remote slot binding", () => {
  it("prefers exact control-plane mid ownership first", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: true,
      existingTransceiverBinding: "screen",
      transceiverMid: "1",
      remoteCameraSignaledMid: "1",
      remoteScreenSignaledMid: null,
      existingMidBinding: "screen",
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "camera", bindMid: "1" });
  });

  it("reuses explicit camera and screen transceiver ownership", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: true,
      isScreenTransceiver: false,
      existingTransceiverBinding: null,
      transceiverMid: "0",
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "camera", bindMid: "0" });

    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: true,
      existingTransceiverBinding: null,
      transceiverMid: "1",
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "screen", bindMid: "1" });
  });

  it("reuses stable mid ownership before any fallback", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: false,
      existingTransceiverBinding: "camera",
      transceiverMid: "1",
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: "screen",
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "screen", bindMid: "1" });
  });

  it("falls back to existing transceiver ownership before negotiated ordering", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: false,
      existingTransceiverBinding: "screen",
      transceiverMid: null,
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: [],
    })).toEqual({ source: "screen", bindMid: null });
  });

  it("uses negotiated mid ordering only when nothing else owns the source", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: false,
      existingTransceiverBinding: null,
      transceiverMid: "0",
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "camera", bindMid: "0" });

    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: false,
      existingTransceiverBinding: null,
      transceiverMid: "1",
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: ["0", "1"],
    })).toEqual({ source: "screen", bindMid: "1" });
  });

  it("defaults unknown unbound video transceivers to camera instead of guessing first-free slots", () => {
    expect(resolveRemoteReceiverSlotSource({
      isCameraTransceiver: false,
      isScreenTransceiver: false,
      existingTransceiverBinding: null,
      transceiverMid: null,
      remoteCameraSignaledMid: null,
      remoteScreenSignaledMid: null,
      existingMidBinding: null,
      negotiatedVideoMids: [],
    })).toEqual({ source: "camera", bindMid: null });
  });
});

describe("detectSourceSwitch", () => {
  it("detects switch on same MID", () => {
    expect(detectSourceSwitch({
      existingBinding: "camera",
      newBinding: "screen",
      sameMid: true,
    })).toBe(true);
  });

  it("does not detect switch when MID changes", () => {
    expect(detectSourceSwitch({
      existingBinding: "camera",
      newBinding: "screen",
      sameMid: false,
    })).toBe(false);
  });

  it("does not detect switch when binding is same", () => {
    expect(detectSourceSwitch({
      existingBinding: "camera",
      newBinding: "camera",
      sameMid: true,
    })).toBe(false);
  });

  it("does not detect switch when no existing binding", () => {
    expect(detectSourceSwitch({
      existingBinding: null,
      newBinding: "screen",
      sameMid: true,
    })).toBe(false);
  });
});
