import { describe, expect, it, vi } from "vitest";
import { ensureDedicatedVideoTransceivers } from "@/calls/direct/model/call-visual-transceivers";

function createVideoTransceiver(mid: string | null): RTCRtpTransceiver {
  return {
    mid,
    sender: {
      track: null,
    } as RTCRtpSender,
    receiver: {
      track: {
        kind: "video",
      } as MediaStreamTrack,
    } as RTCRtpReceiver,
  } as RTCRtpTransceiver;
}

function createAudioTransceiver(mid: string | null): RTCRtpTransceiver {
  return {
    mid,
    sender: {
      track: {
        kind: "audio",
      } as MediaStreamTrack,
    } as RTCRtpSender,
    receiver: {
      track: {
        kind: "audio",
      } as MediaStreamTrack,
    } as RTCRtpReceiver,
  } as RTCRtpTransceiver;
}

describe("call visual transceivers", () => {
  it("reuses stable dedicated video transceivers from the peer connection", () => {
    const cameraTransceiver = createVideoTransceiver("1");
    const screenTransceiver = createVideoTransceiver("2");
    const peerConnection = {
      getTransceivers: () => [
        createAudioTransceiver("0"),
        cameraTransceiver,
        screenTransceiver,
      ],
      addTransceiver: vi.fn(),
    } as unknown as RTCPeerConnection;

    expect(ensureDedicatedVideoTransceivers({
      pc: peerConnection,
      currentCameraTransceiver: null,
      currentScreenTransceiver: null,
    })).toEqual({
      cameraTransceiver,
      screenTransceiver,
    });
    expect(peerConnection.addTransceiver).not.toHaveBeenCalled();
  });

  it("repairs duplicate stale refs by preserving camera ownership and allocating a distinct screen transceiver", () => {
    const cameraTransceiver = createVideoTransceiver("1");
    const screenTransceiver = createVideoTransceiver("2");
    const peerConnection = {
      getTransceivers: () => [cameraTransceiver, screenTransceiver],
      addTransceiver: vi.fn(),
    } as unknown as RTCPeerConnection;

    expect(ensureDedicatedVideoTransceivers({
      pc: peerConnection,
      currentCameraTransceiver: cameraTransceiver,
      currentScreenTransceiver: cameraTransceiver,
    })).toEqual({
      cameraTransceiver,
      screenTransceiver,
    });
  });

  it("creates a missing reserved screen transceiver without reallocating the camera transceiver", () => {
    const cameraTransceiver = createVideoTransceiver("1");
    const newScreenTransceiver = createVideoTransceiver(null);
    const addTransceiver = vi.fn(() => newScreenTransceiver);
    const peerConnection = {
      getTransceivers: () => [cameraTransceiver],
      addTransceiver,
    } as unknown as RTCPeerConnection;

    expect(ensureDedicatedVideoTransceivers({
      pc: peerConnection,
      currentCameraTransceiver: cameraTransceiver,
      currentScreenTransceiver: null,
    })).toEqual({
      cameraTransceiver,
      screenTransceiver: newScreenTransceiver,
    });
    expect(addTransceiver).toHaveBeenCalledTimes(1);
    expect(addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
  });
});
