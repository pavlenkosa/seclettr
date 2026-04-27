import { beforeEach, describe, expect, it, vi } from "vitest";

const sfuClientProduceMocks = vi.hoisted(() => {
  type FakeHandler = (...args: any[]) => void;
  type FakeTransport = {
    id: string;
    handlers: Map<string, FakeHandler>;
    on: (...args: any[]) => void;
    close: () => void;
  };

  const createFakeTransport = (id: string): FakeTransport => {
    const handlers = new Map<string, FakeHandler>();
    return {
      id,
      handlers,
      on: vi.fn((event: string, handler: FakeHandler) => {
        handlers.set(event, handler);
      }),
      close: vi.fn(),
    };
  };

  return {
    getRouterRtpCapabilities: vi.fn(async () => ({ codecs: [] })),
    createTransport: vi.fn(async ({ direction }: { direction: "send" | "recv" }) => ({
      transportId: direction === "send" ? "send-transport" : "recv-transport",
    })),
    connectTransport: vi.fn(async () => undefined),
    produce: vi.fn(async () => "producer-1"),
    leaveRoomPeer: vi.fn(async () => undefined),
    syncRemoteProducers: vi.fn(async () => undefined),
    initializeLocalProducers: vi.fn(async () => undefined),
    setVideoTrack: vi.fn(async () => undefined),
    setLocalMediaKey: vi.fn(),
    setRemoteMediaKey: vi.fn(),
    producerClose: vi.fn(),
    consumerClose: vi.fn(),
    wsSend: vi.fn(),
    sendTransport: null as FakeTransport | null,
    recvTransport: null as FakeTransport | null,
    createFakeTransport,
  };
});

vi.mock("mediasoup-client", () => ({
  Device: class FakeMediasoupDevice {
    public rtpCapabilities: { codecs: unknown[] } = { codecs: [] };

    async load({
      routerRtpCapabilities,
    }: {
      routerRtpCapabilities: { codecs: unknown[] };
    }) {
      this.rtpCapabilities = routerRtpCapabilities;
    }

    canProduce() {
      return true;
    }

    createSendTransport(options: { id: string }) {
      const transport = sfuClientProduceMocks.createFakeTransport(options.id);
      sfuClientProduceMocks.sendTransport = transport;
      return transport;
    }

    createRecvTransport(options: { id: string }) {
      const transport = sfuClientProduceMocks.createFakeTransport(options.id);
      sfuClientProduceMocks.recvTransport = transport;
      return transport;
    }
  },
}));

vi.mock("@/calls/group/runtime/sfu/http-client", () => ({
  createSfuHttpClient: () => ({
    getRouterRtpCapabilities: sfuClientProduceMocks.getRouterRtpCapabilities,
    createTransport: sfuClientProduceMocks.createTransport,
    connectTransport: sfuClientProduceMocks.connectTransport,
    produce: sfuClientProduceMocks.produce,
    closeProducer: vi.fn(async () => undefined),
    consume: vi.fn(async () => {
      throw new Error("consume is not used in this test");
    }),
    resumeConsumer: vi.fn(async () => undefined),
    listRoomProducers: vi.fn(async () => []),
    leaveRoomPeer: sfuClientProduceMocks.leaveRoomPeer,
    toTransportOptions: (response: { transportId: string }) => ({
      id: response.transportId,
    }),
  }),
}));

vi.mock("@/calls/group/runtime/sfu/http-client", () => ({
  createSfuHttpClient: () => ({
    getRouterRtpCapabilities: sfuClientProduceMocks.getRouterRtpCapabilities,
    createTransport: sfuClientProduceMocks.createTransport,
    connectTransport: sfuClientProduceMocks.connectTransport,
    produce: sfuClientProduceMocks.produce,
    closeProducer: vi.fn(async () => undefined),
    consume: vi.fn(async () => {
      throw new Error("consume is not used in this test");
    }),
    resumeConsumer: vi.fn(async () => undefined),
    listRoomProducers: vi.fn(async () => []),
    leaveRoomPeer: sfuClientProduceMocks.leaveRoomPeer,
    toTransportOptions: (response: { transportId: string }) => ({
      id: response.transportId,
    }),
  }),
}));

vi.mock("@/calls/group/runtime/sfu/producer-runtime", () => ({
  createSfuProducerRuntime: () => ({
    initializeLocalProducers: sfuClientProduceMocks.initializeLocalProducers,
    setVideoTrack: sfuClientProduceMocks.setVideoTrack,
    setLocalMediaKey: sfuClientProduceMocks.setLocalMediaKey,
    getLocalProducerIds: () => new Set<string>(),
    getDebugSnapshot: () => ({}),
    close: sfuClientProduceMocks.producerClose,
  }),
}));

vi.mock("@/calls/group/runtime/sfu/producer-runtime", () => ({
  createSfuProducerRuntime: () => ({
    initializeLocalProducers: sfuClientProduceMocks.initializeLocalProducers,
    setVideoTrack: sfuClientProduceMocks.setVideoTrack,
    setLocalMediaKey: sfuClientProduceMocks.setLocalMediaKey,
    getLocalProducerIds: () => new Set<string>(),
    getDebugSnapshot: () => ({}),
    close: sfuClientProduceMocks.producerClose,
  }),
}));

vi.mock("@/calls/group/runtime/sfu/consumer-runtime", () => ({
  createSfuConsumerRuntime: () => ({
    syncRemoteProducers: sfuClientProduceMocks.syncRemoteProducers,
    setRemoteMediaKey: sfuClientProduceMocks.setRemoteMediaKey,
    getDebugSnapshot: () => ({}),
    close: sfuClientProduceMocks.consumerClose,
  }),
}));

vi.mock("@/calls/group/runtime/sfu/consumer-runtime", () => ({
  createSfuConsumerRuntime: () => ({
    syncRemoteProducers: sfuClientProduceMocks.syncRemoteProducers,
    setRemoteMediaKey: sfuClientProduceMocks.setRemoteMediaKey,
    getDebugSnapshot: () => ({}),
    close: sfuClientProduceMocks.consumerClose,
  }),
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    send: sfuClientProduceMocks.wsSend,
  },
}));

describe("startGroupSfuClient produce boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sfuClientProduceMocks.sendTransport = null;
    sfuClientProduceMocks.recvTransport = null;
  });

  it("normalizes browser-only RTP fields before calling the SFU produce endpoint", async () => {
    const { startGroupSfuClient } = await import("@/calls/group/runtime/sfu/client");

    const client = await startGroupSfuClient({
      roomId: "room-1",
      userId: "user-1",
      deviceId: "device-1",
      callType: "video",
      localStream: { id: "local-stream" } as MediaStream,
    });

    const produceHandler = sfuClientProduceMocks.sendTransport?.handlers.get("produce");
    if (!produceHandler) {
      throw new Error("Expected send transport produce handler");
    }

    let callbackPayload: { id: string } | null = null;
    await new Promise<void>((resolve, reject) => {
      produceHandler(
        {
          kind: "video",
          rtpParameters: {
            mid: "0",
            codecs: [
              {
                mimeType: "video/VP8",
                payloadType: 96,
                clockRate: 90_000,
                parameters: {},
                rtcpFeedback: [{ type: "nack", parameter: "pli" }],
              },
            ],
            headerExtensions: [
              {
                uri: "urn:ietf:params:rtp-hdrext:sdes:mid",
                id: 1,
                encrypt: false,
                parameters: {},
              },
            ],
            encodings: [
              {
                ssrc: 1111,
                scalabilityMode: "L1T3",
                rtx: { ssrc: 2222 },
                active: true,
              },
            ],
            rtcp: {
              cname: "stream-cname",
              reducedSize: true,
              mux: true,
            },
            msid: "local-stream track-1",
          },
          appData: {
            source: "camera",
          },
        },
        (payload: { id: string }) => {
          callbackPayload = payload;
          resolve();
        },
        reject
      );
    });

    expect(sfuClientProduceMocks.produce).toHaveBeenCalledWith({
      roomId: "room-1",
      transportId: "send-transport",
      kind: "video",
      source: "camera",
      rtpParameters: {
        mid: "0",
        codecs: [
          {
            mimeType: "video/VP8",
            payloadType: 96,
            clockRate: 90_000,
            parameters: {},
            rtcpFeedback: [{ type: "nack", parameter: "pli" }],
          },
        ],
        headerExtensions: [
          {
            uri: "urn:ietf:params:rtp-hdrext:sdes:mid",
            id: 1,
            encrypt: false,
            parameters: {},
          },
        ],
        encodings: [
          {
            ssrc: 1111,
            scalabilityMode: "L1T3",
            rtx: { ssrc: 2222 },
            active: true,
          },
        ],
        rtcp: {
          cname: "stream-cname",
          reducedSize: true,
          mux: true,
        },
      },
    });
    expect(callbackPayload).toEqual({ id: "producer-1" });

    client.close();
  });
});
