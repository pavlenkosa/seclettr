// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WsServerMessage } from "@seclettr/protocol";
import type { SfuHttpClient } from "@/calls/group/runtime/sfu/http-client";
import { createSfuConsumerRuntime } from "@/calls/group/runtime/sfu/consumer-runtime";
import type { RecvTransport } from "@/calls/group/runtime/sfu/types";

function createFakeTrack(id: string, kind: "audio" | "video"): MediaStreamTrack {
  return {
    id,
    kind,
    label: id,
    enabled: true,
    muted: false,
    readyState: "live",
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaStreamTrack;
}

function createFakeConsumer(id: string, track: MediaStreamTrack) {
  const listeners = new Map<string, () => void>();
  return {
    id,
    paused: false,
    closed: false,
    track,
    close: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    }),
    listeners,
  };
}

describe("createSfuConsumerRuntime", () => {
  const originalMediaStream = globalThis.MediaStream;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaStream", class FakeMediaStream {
      private tracks: MediaStreamTrack[];

      constructor(tracks: MediaStreamTrack[] = []) {
        this.tracks = [...tracks];
      }

      getTracks() {
        return [...this.tracks];
      }
    } as unknown as typeof MediaStream);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.MediaStream = originalMediaStream;
  });

  it("owns remote consume, removal cleanup, and short-term suppression after producer removal", async () => {
    const remoteTrack = createFakeTrack("remote-audio-1", "audio");
    const consumer = createFakeConsumer("consumer-1", remoteTrack);
    let producerSignalListener: ((message: WsServerMessage) => void) | undefined;
    const onRemoteMediaUpdate = vi.fn();
    const listRoomProducers = vi.fn(async () => [
      {
        producerId: "producer-1",
        userId: "user-2",
        deviceId: "device-2",
        kind: "audio" as const,
      },
    ]);
    const consume = vi.fn(async () => ({
      consumerId: "consumer-1",
      producerId: "producer-1",
      kind: "audio" as const,
      rtpParameters: {},
    }));
    const recvTransport = {
      id: "recv-transport-1",
      consume: vi.fn(async () => consumer),
    } as unknown as RecvTransport;

    const runtime = createSfuConsumerRuntime({
      roomId: "room-1",
      userId: "user-1",
      deviceId: "device-1",
      recvTransport,
      rtpCapabilities: {},
      mediaEncryptionMode: "off",
      getLocalProducerIds: () => new Set<string>(),
      onRemoteMediaUpdate,
      sfuHttpClient: {
        consume,
        resumeConsumer: vi.fn(async () => undefined),
        listRoomProducers,
      } as unknown as SfuHttpClient,
      wsClient: {
        on: (listener) => {
          producerSignalListener = listener;
          return () => {
            producerSignalListener = undefined;
          };
        },
      },
    });

    await runtime.syncRemoteProducers();

    expect(consume).toHaveBeenCalledWith(
      "room-1",
      "user-1",
      "recv-transport-1",
      "producer-1",
      {}
    );
    expect(onRemoteMediaUpdate).toHaveBeenLastCalledWith([
      expect.objectContaining({
        userId: "user-2",
        hasAudio: true,
        hasVideo: false,
      }),
    ]);

    if (producerSignalListener) {
      producerSignalListener({
        type: "group.call.producer_state",
        callId: "room-1",
        producerId: "producer-1",
        userId: "user-2",
        deviceId: "device-2",
        groupId: "room-1",
        changedAt: new Date().toISOString(),
        kind: "audio",
        state: "removed",
      } as WsServerMessage);
    }

    expect(consumer.close).toHaveBeenCalledTimes(1);
    expect(onRemoteMediaUpdate).toHaveBeenLastCalledWith([]);

    await runtime.syncRemoteProducers();
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("cleans up partially created consumers when resume fails", async () => {
    const remoteTrack = createFakeTrack("remote-audio-2", "audio");
    const consumer = createFakeConsumer("consumer-2", remoteTrack);
    const resumeConsumer = vi.fn(async () => {
      throw new Error("resume failed");
    });
    const runtime = createSfuConsumerRuntime({
      roomId: "room-1",
      userId: "user-1",
      deviceId: "device-1",
      recvTransport: {
        id: "recv-transport-1",
        consume: vi.fn(async () => consumer),
      } as unknown as RecvTransport,
      rtpCapabilities: {},
      mediaEncryptionMode: "off",
      getLocalProducerIds: () => new Set<string>(),
      sfuHttpClient: {
        consume: vi.fn(async () => ({
          consumerId: "consumer-2",
          producerId: "producer-2",
          kind: "audio" as const,
          rtpParameters: {},
        })),
        resumeConsumer,
        listRoomProducers: vi.fn(async () => [
          {
            producerId: "producer-2",
            userId: "user-2",
            deviceId: "device-2",
            kind: "audio" as const,
          },
        ]),
      } as unknown as SfuHttpClient,
      wsClient: {
        on: () => () => undefined,
      },
    });

    await runtime.syncRemoteProducers();

    expect(resumeConsumer).toHaveBeenCalledWith("consumer-2", {
      roomId: "room-1",
      userId: "user-1",
    });
    expect(consumer.close).toHaveBeenCalledTimes(1);
    expect(runtime.getDebugSnapshot()).toEqual(
      expect.objectContaining({
        consumers: [],
      })
    );
  });

  it("removes the visibilitychange listener on close", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

    const runtime = createSfuConsumerRuntime({
      roomId: "room-1",
      userId: "user-1",
      deviceId: "device-1",
      recvTransport: {
        id: "recv-transport-1",
        consume: vi.fn(),
      } as unknown as RecvTransport,
      rtpCapabilities: {},
      mediaEncryptionMode: "off",
      getLocalProducerIds: () => new Set<string>(),
      sfuHttpClient: {
        consume: vi.fn(),
        resumeConsumer: vi.fn(),
        listRoomProducers: vi.fn(),
      } as unknown as SfuHttpClient,
      wsClient: {
        on: () => () => undefined,
      },
    });

    const addedVisibilityListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange"
    )?.[1];

    runtime.close();

    const removedVisibilityListener = removeEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange"
    )?.[1];

    expect(addedVisibilityListener).toBeDefined();
    expect(removedVisibilityListener).toBe(addedVisibilityListener);
  });
});
