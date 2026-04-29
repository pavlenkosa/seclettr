// @vitest-environment jsdom

import { useRef, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useGroupCallSessionLifecycle } from "@/calls/group/runtime/useGroupCallSessionLifecycle";
import type {
  GroupCallRemoteMedia,
  GroupSfuClient,
  GroupSfuClientOptions,
} from "@/calls/group/runtime/sfu";
import type { GroupCallStatusAction } from "@/calls/group/model/group-call-types";
import type { KeyPair } from "@seclettr/crypto";
import type { MediaKeyRotationState } from "@/calls/group/runtime/group-call-session-types";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/group-call/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/group-call/media-key-delivery";

const TEST_SESSION = {
  groupId: "group-1",
  groupName: "Core Team",
  members: [],
  callType: "audio" as const,
  hostUserId: "user-1",
};
const TEST_IDENTITY_KEY_PAIR = {} as KeyPair;

const mocks = vi.hoisted(() => ({
  getActiveGroupCall: vi.fn(),
  post: vi.fn(),
  joinGroupCall: vi.fn(),
  getGroupCallParticipantDevices: vi.fn(),
  put: vi.fn(),
  leaveGroupCall: vi.fn(),
  startGroupSfuClient: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
  api: {
    getActiveGroupCall: mocks.getActiveGroupCall,
    post: mocks.post,
    joinGroupCall: mocks.joinGroupCall,
    getGroupCallParticipantDevices: mocks.getGroupCallParticipantDevices,
    put: mocks.put,
    leaveGroupCall: mocks.leaveGroupCall,
  },
}));

vi.mock("@/calls/group/runtime/sfu", () => ({
  startGroupSfuClient: mocks.startGroupSfuClient,
}));

function createFakeStream(): MediaStream {
  const audioTrack = { enabled: false, stop: vi.fn() };
  return {
    getAudioTracks: () => [audioTrack],
    getTracks: () => [audioTrack],
  } as unknown as MediaStream;
}

function createFakeSfuClient(): GroupSfuClient {
  return {
    rtpCapabilities: {},
    syncRemoteProducers: vi.fn(async () => undefined),
    removeParticipantMedia: vi.fn(),
    setVideoTrack: vi.fn(async () => undefined),
    setLocalMediaKey: vi.fn(),
    setRemoteMediaKey: vi.fn(),
    getDebugSnapshot: vi.fn(() => ({})),
    close: vi.fn(),
  } as unknown as GroupSfuClient;
}

async function flushMicrotasks(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function LifecycleHarness(props: {
  onStatus: (action: GroupCallStatusAction) => void;
}) {
  const [callId, setCallId] = useState<string | null>(null);
  const [, setAccessGranted] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [, setIsMinimized] = useState(false);
  const [, setPinnedStageTileId] = useState<string | null>(null);
  const [, setActiveParticipantUserIds] = useState<string[]>([]);
  const [, setActiveParticipantDeviceIdsByUserId] = useState<Record<string, string[]>>({});
  const [, setRemoteParticipantMediaModes] = useState<Record<string, "off" | "best-effort" | "required">>({});
  const [, setRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);
  const [, setCallHostUserId] = useState<string | null>(null);
  const [, setLocalMediaKey] = useState<LocalGroupCallMediaKey | null>(null);
  const [, setSharedMediaKeyDeviceCount] = useState(0);
  const [, setReceivedMediaKeyCount] = useState(0);

  const localMediaKeyRef = useRef<LocalGroupCallMediaKey | null>(null);
  const sharedMediaKeyTargetsRef = useRef(new Set<string>());
  const receivedMediaKeysRef = useRef<Record<string, ReceivedGroupCallMediaKey>>({});
  const mediaKeyRotationStateRef = useRef<MediaKeyRotationState>({
    lastRotatedAtMs: null,
    participantFingerprint: null,
  });
  const mediaKeyDeliveryTrackerRef = useRef<GroupCallMediaKeyDeliveryTracker | null>(null);
  const sfuClientRef = useRef<GroupSfuClient | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const didEndRef = useRef(false);
  const ownsServerCallRef = useRef(false);
  const joinedParticipantRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const unloadCleanupSentRef = useRef(false);
  const attachInitialStream = useRef((stream: MediaStream) => {
    activeStreamRef.current = stream;
  }).current;
  const cleanupLocalMedia = useRef(vi.fn()).current;
  const resetLocalMediaState = useRef(vi.fn()).current;
  const resetMinimizedDock = useRef(vi.fn()).current;
  const resetCallDuration = useRef(vi.fn()).current;
  const createInitialMediaKey = useRef<() => LocalGroupCallMediaKey | null>(() => null).current;
  const endServerRoom = useRef(vi.fn(async () => undefined)).current;
  const leaveCurrentCall = useRef(vi.fn(async () => undefined)).current;

  useGroupCallSessionLifecycle({
    session: TEST_SESSION,
    userId: "user-1",
    deviceId: "device-1",
    identityDhKeyPair: TEST_IDENTITY_KEY_PAIR,
    localAdvertisedMediaEncryptionMode: "off",
    strictFrameEncryptionUnsupported: false,
    attachInitialStream,
    cleanupLocalMedia,
    resetLocalMediaState,
    resetMinimizedDock,
    dispatchStatus: props.onStatus,
    setCallId,
    setAccessGranted,
    setError,
    setIsMinimized,
    resetCallDuration,
    setPinnedStageTileId,
    setActiveParticipantUserIds,
    setActiveParticipantDeviceIdsByUserId,
    setRemoteParticipantMediaModes,
    setRemoteMedia,
    setCallHostUserId,
    setLocalMediaKey,
    setSharedMediaKeyDeviceCount,
    setReceivedMediaKeyCount,
    localMediaKeyRef,
    sharedMediaKeyTargetsRef,
    receivedMediaKeysRef,
    mediaKeyRotationStateRef,
    mediaKeyDeliveryTrackerRef,
    sfuClientRef,
    activeStreamRef,
    startErrorMessage: "Could not start call",
    mediaPermissionErrorMessage: "Media permission failed",
    frameUnsupportedStrictMessage: "Frame encryption unavailable",
    createInitialMediaKey,
    callIdRef,
    didEndRef,
    ownsServerCallRef,
    joinedParticipantRef,
    actionInFlightRef,
    unloadCleanupSentRef,
    endServerRoom,
    leaveCurrentCall,
  });

  return <span data-call-id={callId ?? ""} />;
}

describe("useGroupCallSessionLifecycle reconnect", () => {
  let container: HTMLDivElement;
  let root: Root;
  let getUserMedia: Mock<[], Promise<MediaStream>>;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    getUserMedia = vi.fn(async () => createFakeStream());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    mocks.getActiveGroupCall.mockReset().mockResolvedValue(null);
    mocks.post.mockReset().mockResolvedValue({ callId: "call-1" });
    mocks.joinGroupCall.mockReset().mockResolvedValue([{ userId: "user-1" }]);
    mocks.getGroupCallParticipantDevices.mockReset().mockResolvedValue([]);
    mocks.put.mockReset().mockResolvedValue({ ok: true });
    mocks.leaveGroupCall.mockReset().mockResolvedValue({ ok: true });
    mocks.startGroupSfuClient.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("marks the joined room active before opening the SFU client", async () => {
    const statusActions: string[] = [];
    mocks.startGroupSfuClient.mockResolvedValue(createFakeSfuClient());

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();

    const activeStatusCallIndex = mocks.put.mock.calls.findIndex(([path, body]) =>
      path === "/calls/call-1/status" &&
      (body as { status?: string }).status === "active"
    );
    expect(activeStatusCallIndex).toBeGreaterThanOrEqual(0);
    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(1);
    expect(mocks.put.mock.invocationCallOrder[activeStatusCallIndex]).toBeLessThan(
      mocks.startGroupSfuClient.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(statusActions).toContain("SESSION_READY");
  });

  it("does not end a room when POST reuses a call created by a race", async () => {
    const statusActions: string[] = [];
    mocks.post.mockResolvedValueOnce({ callId: "call-1", created: false });
    mocks.startGroupSfuClient.mockRejectedValue(new Error("sfu unavailable"));

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();

    for (const delayMs of [350, 700]) {
      await act(async () => {
        vi.advanceTimersByTime(delayMs);
        await Promise.resolve();
      });
      await flushMicrotasks();
    }

    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(3);
    expect(statusActions).toContain("SESSION_ERROR");
    expect(mocks.put.mock.calls).toEqual([
      ["/calls/call-1/status", { status: "active" }],
    ]);
  });

  it("rejoins the SFU transport after a transport failure", async () => {
    const statusActions: string[] = [];
    const sfuClients = [createFakeSfuClient(), createFakeSfuClient()];
    let transportFailed: (() => void) | null = null;

    mocks.startGroupSfuClient.mockImplementation(
      async (options: GroupSfuClientOptions) => {
        transportFailed = options.onTransportFailed ?? null;
        return sfuClients.shift() ?? createFakeSfuClient();
      }
    );

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();

    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(1);
    expect(statusActions).toContain("SESSION_READY");
    expect(transportFailed).not.toBeNull();

    act(() => {
      transportFailed?.();
    });

    expect(statusActions.at(-1)).toBe("RECONNECT_START");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(2);
    expect((mocks.startGroupSfuClient.mock.calls[1]?.[0] as GroupSfuClientOptions).roomId).toBe("call-1");
    expect((mocks.startGroupSfuClient.mock.calls[1]?.[0] as GroupSfuClientOptions).localStream).toBeTruthy();
    expect((mocks.startGroupSfuClient.mock.results[0]?.value)).toBeTruthy();
    expect((mocks.startGroupSfuClient.mock.calls[1]?.[0] as GroupSfuClientOptions).onTransportFailed).toEqual(expect.any(Function));
    expect(statusActions.at(-1)).toBe("SESSION_READY");
  });

  it("moves to error after repeated SFU rejoin failures", async () => {
    const statusActions: string[] = [];
    let transportFailed: (() => void) | null = null;

    mocks.startGroupSfuClient
      .mockImplementationOnce(async (options: GroupSfuClientOptions) => {
        transportFailed = options.onTransportFailed ?? null;
        return createFakeSfuClient();
      })
      .mockImplementation(async (options: GroupSfuClientOptions) => {
        transportFailed = options.onTransportFailed ?? null;
        throw new Error("sfu unavailable");
      });

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();

    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(1);
    expect(transportFailed).not.toBeNull();

    act(() => {
      transportFailed?.();
    });

    for (const delayMs of [1000, 2000, 4000]) {
      await act(async () => {
        vi.advanceTimersByTime(delayMs);
        await Promise.resolve();
      });
      await flushMicrotasks();
    }

    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(4);
    expect(statusActions.at(-1)).toBe("SESSION_ERROR");
  });

  it("retries bootstrap when the first join attempt races with a stale active call", async () => {
    const statusActions: string[] = [];

    mocks.getActiveGroupCall
      .mockResolvedValueOnce({
        callId: "stale-call",
        callType: "audio",
        status: "ringing",
        callerUserId: "user-2",
        createdAt: new Date().toISOString(),
        answeredAt: null,
      })
      .mockResolvedValueOnce(null);
    mocks.post.mockResolvedValueOnce({ callId: "call-2" });
    mocks.joinGroupCall
      .mockRejectedValueOnce(
        Object.assign(new Error("Call not found"), { status: 404 })
      )
      .mockResolvedValue([{ userId: "user-1" }]);
    mocks.getGroupCallParticipantDevices.mockResolvedValue([]);
    mocks.startGroupSfuClient.mockResolvedValue(createFakeSfuClient());

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mocks.joinGroupCall).toHaveBeenCalledTimes(2);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.startGroupSfuClient).toHaveBeenCalledTimes(1);
    expect(
      (mocks.startGroupSfuClient.mock.calls[0]?.[0] as GroupSfuClientOptions)
        .roomId
    ).toBe("call-2");
    expect(statusActions).toContain("SESSION_READY");
  });

  it("ignores stale join completion after the session unmounts", async () => {
    const statusActions: string[] = [];
    let resolveMedia!: (stream: MediaStream) => void;
    const pendingMedia = new Promise<MediaStream>((resolve) => {
      resolveMedia = resolve;
    });
    getUserMedia.mockReturnValueOnce(pendingMedia);
    mocks.startGroupSfuClient.mockResolvedValue(createFakeSfuClient());

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });
    await flushMicrotasks();

    expect(getUserMedia).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(null);
    });

    const staleStream = createFakeStream();
    await act(async () => {
      resolveMedia(staleStream);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(mocks.startGroupSfuClient).not.toHaveBeenCalled();
    expect(statusActions).not.toContain("SESSION_READY");
    expect(mocks.put).toHaveBeenCalledWith("/calls/call-1/status", {
      status: "ended",
    });
    expect(staleStream.getTracks()[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it("does not create a call after unmount when active-call lookup resolves late", async () => {
    const statusActions: string[] = [];
    let resolveActiveCall!: (call: null) => void;
    const pendingActiveCall = new Promise<null>((resolve) => {
      resolveActiveCall = resolve;
    });

    mocks.getActiveGroupCall.mockReturnValueOnce(pendingActiveCall);

    await act(async () => {
      root.render(
        <LifecycleHarness
          onStatus={(action) => {
            statusActions.push(action.type);
          }}
        />
      );
    });

    await act(async () => {
      root.render(null);
    });

    await act(async () => {
      resolveActiveCall(null);
      await Promise.resolve();
    });
    await flushMicrotasks();

    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.joinGroupCall).not.toHaveBeenCalled();
    expect(mocks.startGroupSfuClient).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(statusActions).not.toContain("SESSION_READY");
  });
});
