import { describe, expect, it, vi } from "vitest";
import { createSfuProducerRuntime } from "@/calls/group/runtime/sfu/producer-runtime";

function createFakeTrack(id: string, kind: "audio" | "video"): MediaStreamTrack {
  return {
    id,
    kind,
    label: id,
    enabled: true,
    muted: false,
    readyState: "live",
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function createFakeProducer(id: string, track: MediaStreamTrack | null) {
  return {
    id,
    paused: false,
    closed: false,
    track,
    close: vi.fn(),
  };
}

describe("createSfuProducerRuntime", () => {
  it("owns local producer replacement and remote close coordination by source slot", async () => {
    const audioTrack = createFakeTrack("audio-track", "audio");
    const initialCameraTrack = createFakeTrack("camera-track-1", "video");
    const nextCameraTrack = createFakeTrack("camera-track-2", "video");
    const audioProducer = createFakeProducer("producer-audio", audioTrack);
    const initialCameraProducer = createFakeProducer("producer-camera-1", initialCameraTrack);
    const nextCameraProducer = createFakeProducer("producer-camera-2", nextCameraTrack);
    const sendTransport = {
      produce: vi.fn()
        .mockResolvedValueOnce(audioProducer)
        .mockResolvedValueOnce(initialCameraProducer)
        .mockResolvedValueOnce(nextCameraProducer),
    } as unknown as import("@/calls/group/runtime/sfu/types").SendTransport;
    const announceProducerState = vi.fn();
    const closeProducer = vi.fn(async () => undefined);

    const runtime = createSfuProducerRuntime({
      roomId: "room-1",
      deviceId: "device-1",
      localStream: {
        getAudioTracks: () => [audioTrack],
        getVideoTracks: () => [initialCameraTrack],
      } as unknown as MediaStream,
      sendTransport,
      canProduceVideo: true,
      mediaEncryptionMode: "off",
      sfuHttpClient: {
        closeProducer,
      },
      announceProducerState,
    });

    await runtime.initializeLocalProducers();
    await runtime.setVideoTrack(nextCameraTrack, "camera");

    expect(sendTransport.produce).toHaveBeenCalledTimes(3);
    expect(closeProducer).toHaveBeenCalledWith("producer-camera-1", {
      roomId: "room-1",
    });
    expect(initialCameraProducer.close).toHaveBeenCalledTimes(1);
    expect(announceProducerState).toHaveBeenNthCalledWith(1, "producer-audio", "audio", "added");
    expect(announceProducerState).toHaveBeenNthCalledWith(2, "producer-camera-1", "video", "added", "camera");
    expect(announceProducerState).toHaveBeenNthCalledWith(3, "producer-camera-1", "video", "removed", "camera");
    expect(announceProducerState).toHaveBeenNthCalledWith(4, "producer-camera-2", "video", "added", "camera");
    expect(runtime.getLocalProducerIds()).toEqual(new Set(["producer-audio", "producer-camera-2"]));
    expect(runtime.getDebugSnapshot()).toMatchObject({
      localAudioProducer: {
        id: "producer-audio",
      },
      localVideoProducers: [
        {
          id: "producer-camera-2",
          source: "camera",
        },
      ],
    });
  });
});
